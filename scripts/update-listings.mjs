/**
 * 네이버 블로그(ykphone_edu) RSS에서 최신 경매물건 글을 읽어
 * index.html 의 "전국 경매물건" 카드 목록을 통째로 다시 만든다.
 *
 *   node scripts/update-listings.mjs          실제 갱신
 *   node scripts/update-listings.mjs --dry    파일을 쓰지 않고 결과만 출력
 *
 * GitHub Actions 에서 매일 자동 실행된다. (.github/workflows/update-listings.yml)
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildListingPages, slugOf } from './build-listing-pages.mjs';
import { buildSitemap } from './build-sitemap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_ID = 'ykphone_edu';
const RSS_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`;
const IMAGE_DIR = path.join(ROOT, 'assets', 'properties', 'auto');
const IMAGE_HREF = 'assets/properties/auto';
const INDEX_FILE = path.join(ROOT, 'index.html');
const DRY_RUN = process.argv.includes('--dry');

/* 지역 필터에 항상 넣어둘 순서. 실제 물건이 있는 지역만 노출된다. */
const REGION_ORDER = ['서울', '경기', '인천', '대전', '대구', '부산', '울산', '광주', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

/* 제목에서 단지명을 뽑을 때 잘라낼 단어들 */
const TITLE_STOPWORDS = /^(아파트|오피스텔|빌라|다세대|연립|상가|토지|주택|숙박시설|경매|공매|물건|매각|낙찰|유찰|\d+회|\d+차)$/;

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* ------------------------------------------------------------------ 유틸 */

const log = (...a) => console.log(...a);

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA_MOBILE, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 태그를 걷어내고 공백을 하나로 눌러 본문 텍스트만 남긴다. */
function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|​/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "1억 9,300만원", "193,000,000원", "6억9700만원" 을 모두 숫자(원)로 바꾼다.
 * 해석할 수 없으면 null.
 */
function parseKoreanMoney(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[\s,]/g, '');

  const eok = s.match(/^(\d+(?:\.\d+)?)억(?:(\d+)만)?원?$/);
  if (eok) {
    const man = eok[2] ? Number(eok[2]) : 0;
    return Math.round(Number(eok[1]) * 1e8 + man * 1e4);
  }
  const manOnly = s.match(/^(\d+(?:\.\d+)?)만원?$/);
  if (manOnly) return Math.round(Number(manOnly[1]) * 1e4);

  const plain = s.match(/^(\d{6,})원?$/);
  if (plain) return Number(plain[1]);

  return null;
}

/** 숫자(원)를 "1억 1,690만원" 형태로 표기한다. */
function formatKoreanMoney(won) {
  if (!Number.isFinite(won) || won <= 0) return null;
  const eok = Math.floor(won / 1e8);
  const man = Math.floor((won % 1e8) / 1e4);
  if (eok && man) return `${eok}억 ${man.toLocaleString('ko-KR')}만원`;
  if (eok) return `${eok}억원`;
  if (man) return `${man.toLocaleString('ko-KR')}만원`;
  return `${won.toLocaleString('ko-KR')}원`;
}

/** 오늘 00:00 (KST) 기준 Date */
function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  kst.setHours(0, 0, 0, 0);
  return kst;
}

/* ------------------------------------------------------------- RSS 읽기 */

function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      if (!t) return '';
      return decodeEntities(t[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '')).trim();
    };
    const link = pick('link').replace(/\?.*$/, '');
    const id = link.match(/\/(\d+)$/)?.[1];
    if (!id) continue;
    items.push({
      id,
      link,
      title: pick('title'),
      category: pick('category'),
      description: toPlainText(pick('description')),
      pubDate: pick('pubDate'),
    });
  }
  return items;
}

/* ------------------------------------------------------- 글 1건 정보 추출 */

/** 제목에서 지역(시/도, 시군구)과 단지명을 뽑는다. */
function parseTitle(title) {
  let t = title.replace(/\s*\d{4}\s*타경\s*\d+.*$/, '').trim();

  const tokens = t.split(/\s+/);
  let sido = null;
  let sigungu = null;
  let idx = 0;

  const sidoAlias = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주' };

  if (tokens[0]) {
    const first = sidoAlias[tokens[0]] || tokens[0];
    if (REGION_ORDER.includes(first)) { sido = first; idx = 1; }
  }
  if (sido && tokens[idx] && /(구|군|시)$/.test(tokens[idx]) && tokens[idx].length <= 5) {
    sigungu = tokens[idx];
    idx += 1;
  }

  /* 남은 토큰 중 앞에서부터, 멈춤단어를 만나기 전까지가 단지명 */
  const nameParts = [];
  for (let i = idx; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (TITLE_STOPWORDS.test(tok)) break;
    if (/원대?$/.test(tok) && /\d/.test(tok)) break;
    if (/^\d/.test(tok)) break;
    nameParts.push(tok);
    if (nameParts.length >= 3) break;
  }

  return { sido, sigungu, name: nameParts.join(' ').trim() || null };
}

/** 본문/요약 텍스트에서 금액·기일·면적·법원을 찾는다. */
function parseDetails(text) {
  const grab = (patterns) => {
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const won = parseKoreanMoney(m[1]);
        if (won) return won;
      }
    }
    return null;
  };

  const MONEY = '([\\d,]+(?:\\.\\d+)?\\s*억\\s*[\\d,]*\\s*만?\\s*원|[\\d,]{7,}\\s*원|[\\d,]+\\s*만\\s*원)';

  const appraisal = grab([
    new RegExp(`감정가(?:는|가|액)?\\s*[:：]?\\s*${MONEY}`),
    new RegExp(`감정평가액\\s*[:：]?\\s*${MONEY}`),
  ]);

  const minBid = grab([
    new RegExp(`최저매각가격(?:은|는)?\\s*[:：]?\\s*(?:감정가의\\s*\\d+%\\s*인\\s*)?${MONEY}`),
    new RegExp(`최저가(?:는|가)?\\s*[:：]?\\s*${MONEY}`),
    new RegExp(`최저\\s*입찰가\\s*[:：]?\\s*${MONEY}`),
  ]);

  /* "매각기일 : 2026년 9월 23일", "3차 매각기일은 2026년 9월 15일", "매각기일 2026.9.23" 모두 허용 */
  const dateM = text.match(/매각기일[^\d]{0,8}(\d{4})\s*[년.]\s*(\d{1,2})\s*[월.]\s*(\d{1,2})\s*일?/);
  const saleDate = dateM
    ? new Date(Number(dateM[1]), Number(dateM[2]) - 1, Number(dateM[3]))
    : null;

  const areaM = text.match(/전용\s*면적(?:은|:|：)?\s*([\d.]+)\s*㎡/) || text.match(/전용\s*([\d.]+)\s*㎡/);
  const area = areaM ? Number(areaM[1]) : null;

  const courtM = text.match(/([가-힣]{2,6}지방법원(?:\s*[가-힣]{2,6}지원)?)/) || text.match(/([가-힣]{2,6}지원)/);
  const court = courtM ? courtM[1].replace(/\s+/g, '') : null;

  return { appraisal, minBid, saleDate, area, court };
}

const SIDO_ALIAS = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주' };

/**
 * 본문의 "소재지 : 대구 수성구 상록로 15 물건 : 범어센트럴푸르지오 102동 4층 402호"
 * 같은 정보 블록에서 지역과 단지명을 뽑는다. 제목보다 훨씬 정확하다.
 */
function parseLocation(text) {
  let sido = null;
  let sigungu = null;

  /* 긴 이름("대구광역시")이 짧은 이름("대구")보다 먼저 매칭되도록 길이순 정렬 */
  const sidoNames = Object.keys(SIDO_ALIAS).concat(REGION_ORDER)
    .sort((a, b) => b.length - a.length).join('|');
  const locRe = new RegExp(`(${sidoNames})\\s*([가-힣]{2,6}(?:구|군|시))`, 'g');
  const NOT_SIGUNGU = /^(광역시|특별시|특별자치시|자치시|자치구|직할시)$/;

  /* 소재지 근처를 먼저 보고, 없으면 본문 전체에서 찾되 법원 주소는 건너뛴다. */
  const near = text.match(/소재지[^]{0,60}/)?.[0];
  const scan = (hay) => {
    if (!hay) return null;
    for (const m of hay.matchAll(locRe)) {
      const before = hay.slice(Math.max(0, m.index - 12), m.index);
      if (/법원|지원|등기소/.test(before)) continue;
      if (NOT_SIGUNGU.test(m[2])) continue;
      return m;
    }
    return null;
  };

  const locM = scan(near) || scan(text);
  if (locM) {
    sido = SIDO_ALIAS[locM[1]] || locM[1];
    sigungu = locM[2];
  }

  /* 단지명: 정확한 것부터 차례로 시도 */
  const nameCandidates = [
    /물건\s*[:：]\s*([가-힣A-Za-z0-9]{2,20})/,
    /([가-힣A-Za-z0-9]{2,20}?)\s*\d{1,3}동\s*(?:\d{1,2}층\s*)?[\d-]{1,6}호/,
    /([가-힣A-Za-z0-9]{2,20}?)\s*\d{1,2}층\s*[\d-]{1,6}호/,
    /소재지[^]{0,60}?,\s*([가-힣A-Za-z0-9]{2,20})\s*(?:전용|감정|매각)/,
    /소재지[^]{0,60}?\s([가-힣A-Za-z0-9]{3,20})\s*전용면적/,
  ];
  const isBadName = (v) => (
    !v || v.length < 2
    || /^[\d\s-]+$/.test(v)          // "10", "704"
    || /^\d/.test(v)                 // 숫자로 시작
    || /(동|층|호|로|길|번지)$/.test(v) // "704동", "14층", 도로명
    || /^(소재지|물건|전용면적|감정가|최저가|경매|아파트|블로그)$/.test(v)
  );

  /* 단지명도 소재지 근처를 먼저 본다. 사무실 건물명이 페이지 곳곳에 박혀 있어서
     전체 텍스트만 훑으면 엉뚱한 이름이 잡힌다. */
  const nameScope = text.match(/(?:소재지|물건\s*[:：])[^]{0,220}/)?.[0];
  const findName = (hay) => {
    if (!hay) return null;
    for (const re of nameCandidates) {
      const m = hay.match(re);
      if (!m) continue;
      const v = m[1].trim();
      if (isBadName(v)) continue;
      return v;
    }
    return null;
  };

  const name = findName(nameScope) || findName(text);

  return { sido, sigungu, name };
}

/** 물건 종류 추정 */
function guessKind(text, title) {
  const hay = `${title} ${text.slice(0, 400)}`;
  if (/오피스텔/.test(hay)) return '오피스텔';
  if (/빌라|다세대|연립/.test(hay)) return '빌라';
  if (/상가|근린생활/.test(hay)) return '상가';
  if (/토지|임야|전답/.test(hay)) return '토지';
  if (/숙박|모텔|호텔/.test(hay)) return '숙박시설';
  if (/단독주택|주택/.test(hay)) return '주택';
  return '아파트';
}

async function buildListing(item) {
  let pageText = '';
  let ogImage = null;
  try {
    const html = await fetchText(`https://m.blog.naver.com/${BLOG_ID}/${item.id}`);
    pageText = toPlainText(html);
    ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)?.[1] || null;
  } catch (err) {
    log(`  ! 본문을 못 읽음 (${item.id}): ${err.message}`);
  }

  /* 본문을 우선 보고, 빠진 값은 RSS 요약에서 메운다. */
  const fromBody = parseDetails(pageText);
  const fromRss = parseDetails(item.description);
  const d = {
    appraisal: fromBody.appraisal ?? fromRss.appraisal,
    minBid: fromBody.minBid ?? fromRss.minBid,
    saleDate: fromBody.saleDate ?? fromRss.saleDate,
    area: fromBody.area ?? fromRss.area,
    court: fromBody.court ?? fromRss.court,
  };

  /* 지역·단지명은 본문 정보블록 → RSS 요약 → 제목 순으로 신뢰한다. */
  const locBody = parseLocation(pageText);
  const locRss = parseLocation(item.description);
  const locTitle = parseTitle(item.title);
  /* RSS 요약문이 글마다 고유하고 군더더기가 없어 가장 믿을 만하다.
     본문 HTML에는 학원 사무실 주소·관련글이 섞여 있어 오탐이 난다.
     지역과 단지명은 반드시 같은 출처에서 가져온다 —
     섞어 쓰면 "부산 물건인데 대구 수성구" 같은 어긋남이 생긴다. */
  /* 지역: 제목이 거의 항상 "대구 수성구 …" 로 시작하므로 제목을 먼저 믿는다.
     시/도와 시군구는 반드시 한 출처에서 짝으로 가져온다. */
  const regionSrc = [locTitle, locRss, locBody].find((l) => l.sido) ?? {};
  const sido = regionSrc.sido ?? null;
  const sigungu = regionSrc.sigungu ?? null;

  /* 단지명: RSS 요약문 첫 문장이 가장 깨끗하다. */
  const rawName = [locRss, locTitle, locBody].map((l) => l.name).find(Boolean) ?? null;
  const name = rawName
    ? rawName.replace(/\s*(경매|아파트\s*경매|물건)?\s*[,.·\-]+\s*$/, '').trim()
    : null;

  const caseNo = (item.title.match(/\d{4}\s*타경\s*\d+/) || pageText.match(/\d{4}\s*타경\s*\d+/) || [null])[0];

  return {
    id: item.id,
    link: item.link,
    title: item.title,
    /* 상세 페이지의 "물건 요약"에 쓴다 (앞 두 문장만 발췌) */
    description: item.description,
    name: name || item.title.slice(0, 20),
    sido,
    sigungu,
    kind: guessKind(pageText || item.description, item.title),
    caseNo: caseNo ? caseNo.replace(/\s+/g, '') : null,
    ogImage,
    ...d,
  };
}

/* ----------------------------------------------------------- 이미지 처리 */

async function downloadImage(listing) {
  if (!listing.ogImage) return null;
  const out = path.join(IMAGE_DIR, `${listing.id}.webp`);
  const href = `${IMAGE_HREF}/${listing.id}.webp`;
  if (existsSync(out)) return href;
  if (DRY_RUN) return href;

  try {
    const res = await fetch(listing.ogImage, { headers: { 'User-Agent': UA_MOBILE } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize({ width: 720, height: 540, fit: 'cover', position: 'top' })
      .webp({ quality: 78 })
      .toFile(out);
    log(`  + 이미지 저장 ${path.basename(out)}`);
    return href;
  } catch (err) {
    log(`  ! 이미지 실패 (${listing.id}): ${err.message}`);
    return null;
  }
}

/* --------------------------------------------------------------- 카드 HTML */

function renderCard(l, i, sold) {
  const accent = `accent-${(i % 3) + 1}`;
  const region = l.sido || '기타';
  const place = [l.sido, l.sigungu].filter(Boolean).join(' · ') || '전국';
  const price = formatKoreanMoney(l.minBid) || formatKoreanMoney(l.appraisal) || '가격 문의';
  const img = l.image || 'assets/ykphone-logo-mark.png';

  const ratio = l.appraisal && l.minBid ? Math.round((l.minBid / l.appraisal) * 100) : null;
  const badgeLeft = sold
    ? `${l.kind} · 낙찰완료`
    : ratio && ratio < 100 ? `${l.kind} · 감정가의 ${ratio}%` : l.kind;

  let badgeRight;
  if (sold) {
    badgeRight = '<time class="badge-sold">낙찰완료</time>';
  } else if (l.saleDate) {
    const days = Math.round((l.saleDate - todayKST()) / 86400000);
    badgeRight = `<time class="badge-dday" datetime="${l.saleDate.toISOString().slice(0, 10)}">${days === 0 ? 'D-DAY' : `D-${days}`}</time>`;
  } else {
    badgeRight = `<time>${l.pubLabel}</time>`;
  }

  const ctaBits = [l.caseNo, l.appraisal ? `감정가 ${formatKoreanMoney(l.appraisal)}` : null]
    .filter(Boolean).join(' · ') || '블로그에서 자세히 보기';

  const stamp = sold ? '<div class="sold-out-stamp">낙찰완료</div>' : '';
  const courtAttr = l.court ? ` data-court="${escapeHtml(l.court)}"` : '';

  /* 상담 CTA: 카카오 오픈채팅은 URL로 메시지를 미리 채워 넣는 기능이 없어서,
     클릭 시 문의 문구를 클립보드에 복사한 뒤 채팅방을 열어준다
     (js/main.js 의 .property-feed-consult 클릭 핸들러). */
  const consultMsg = `${l.caseNo || l.name} 물건 상담 문의드립니다.`;
  const consultBtn = sold
    ? ''
    : `<button type="button" class="property-feed-consult" data-consult-msg="${escapeHtml(consultMsg)}">` +
      `카톡 상담<span>💬</span></button>`;

  /* 카드는 블로그가 아니라 사이트 안의 물건 상세 페이지로 보낸다.
     예전에는 카드 44개가 전부 네이버로 나가서 방문자도 검색 점수도 새어나갔다. */
  const detailHref = `/listings/${slugOf(l)}.html`;

  return `<article class="property-feed-card ${accent}${sold ? ' is-sold-out' : ''}" data-region="${escapeHtml(region)}"${courtAttr}>` +
    `<a class="property-feed-link" href="${escapeHtml(detailHref)}">` +
    `<div class="property-feed-visual">${stamp}` +
    `<img src="${escapeHtml(img)}" alt="${escapeHtml(l.name)}" loading="lazy" width="720" height="540"/>` +
    `<div class="property-feed-badges"><span>${escapeHtml(badgeLeft)}</span>${badgeRight}</div>` +
    `<div class="property-feed-overlay"><div class="property-feed-price">` +
    `<small>${escapeHtml(place)}</small><strong>${escapeHtml(price)}</strong></div>` +
    `<h3>${escapeHtml(l.name)}</h3></div></div></a>` +
    `<div class="property-feed-cta">` +
    `<a class="property-feed-cta-link" href="${escapeHtml(detailHref)}">${escapeHtml(ctaBits)}<span>→</span></a>` +
    consultBtn +
    `</div>` +
    `</article>`;
}

function renderFilterBar(listings) {
  const present = new Set(listings.map((l) => l.sido).filter(Boolean));
  const regions = REGION_ORDER.filter((r) => present.has(r));
  const buttons = ['<button class="active">전체</button>']
    .concat(regions.map((r) => `<button class="">${r}</button>`));
  return `<div class="filter-bar" aria-label="지역 필터">${buttons.join('')}</div>`;
}

function renderStatusTabs(activeCount, soldCount) {
  return '<div class="status-tabs" role="tablist" aria-label="매물 상태">' +
    `<button type="button" role="tab" aria-selected="true" class="active" data-status-tab="active"><span>01</span> 진행중인 물건 <b>${activeCount}</b></button>` +
    `<button type="button" role="tab" aria-selected="false" data-status-tab="sold"><span>02</span> 낙찰완료 <b>${soldCount}</b></button>` +
    '</div>';
}

function renderGrids(active, sold) {
  const grid = (rows, panel, isSold) =>
    `<div class="property-feed-grid" data-status-panel="${panel}"${panel === 'sold' ? ' hidden' : ''}>` +
    rows.map((l, i) => renderCard(l, i, isSold)).join('') +
    '</div>';

  return grid(active, 'active', false) + grid(sold, 'sold', true) +
    '<p class="filter-empty" hidden>이 지역은 아직 등록된 물건이 없습니다. ' +
    `<a href="https://blog.naver.com/${BLOG_ID}" target="_blank" rel="noreferrer">블로그에서 전체 물건 보기 ↗</a></p>` +
    '<nav class="feed-pagination" aria-label="물건 목록 페이지 이동" hidden>' +
    '<button type="button" class="feed-page-prev" aria-label="이전 페이지">← 이전</button>' +
    '<div class="feed-page-nums"></div>' +
    '<button type="button" class="feed-page-next" aria-label="다음 페이지">다음 →</button>' +
    '</nav>';
}

/* ------------------------------------------------------------ index.html */

function patchIndex(html, { filterBar, statusTabs, grids, updatedLabel }) {
  let out = html;

  out = out.replace(/<div class="filter-bar"[\s\S]*?<\/div>/, filterBar);
  out = out.replace(/<div class="status-tabs"[\s\S]*?<\/div>\s*(?=<div class="sample-notice")/, statusTabs);

  out = out.replace(
    /<div class="sample-notice">[\s\S]*?<\/div>/,
    `<div class="sample-notice"><strong>블로그 연동</strong>블로그에 올라온 최신 물건을 매일 자동으로 가져옵니다. 카드를 누르면 물건 상세정보를 볼 수 있습니다. <em class="feed-updated">${updatedLabel} 기준</em></div>`,
  );

  const start = out.indexOf('<div class="property-feed-grid"');
  if (start === -1) throw new Error('property-feed-grid 를 찾지 못했습니다.');
  const end = out.indexOf('</section>', start);
  if (end === -1) throw new Error('물건 섹션의 끝을 찾지 못했습니다.');

  return out.slice(0, start) + grids + out.slice(end);
}

/* ------------------------------------------------------------------ main */

async function main() {
  log('· RSS 내려받는 중…');
  const items = parseRss(await fetchText(RSS_URL));
  log(`  RSS 글 ${items.length}건`);

  const candidates = items.filter((it) => {
    if (it.category.trim() === '공지사항') return false;
    const hay = `${it.title} ${it.description}`;
    return /타경/.test(hay) && /경매/.test(hay);
  });
  log(`  물건 글 후보 ${candidates.length}건`);

  const listings = [];
  for (const [i, it] of candidates.entries()) {
    log(`· (${i + 1}/${candidates.length}) ${it.title.slice(0, 40)}`);
    const l = await buildListing(it);
    l.pubLabel = it.pubDate ? new Date(it.pubDate).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\.$/, '') : '';
    if (!l.minBid && !l.appraisal) { log('  - 금액을 못 읽어 건너뜀'); continue; }
    l.image = await downloadImage(l);
    listings.push(l);
  }

  const today = todayKST();
  const active = listings.filter((l) => !l.saleDate || l.saleDate >= today);
  const sold = listings.filter((l) => l.saleDate && l.saleDate < today);

  /* 상세 페이지에서도 낙찰 여부를 알아야 한다 */
  active.forEach((l) => { l.sold = false; });
  sold.forEach((l) => { l.sold = true; });

  /* 진행중은 매각기일 가까운 순, 낙찰완료는 최근 기일 순 */
  active.sort((a, b) => (a.saleDate?.getTime() ?? Infinity) - (b.saleDate?.getTime() ?? Infinity));
  sold.sort((a, b) => (b.saleDate?.getTime() ?? 0) - (a.saleDate?.getTime() ?? 0));

  log(`\n· 진행중 ${active.length}건 / 낙찰완료 ${sold.length}건`);

  const updatedLabel = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = await readFile(INDEX_FILE, 'utf8');
  const next = patchIndex(html, {
    filterBar: renderFilterBar(listings),
    statusTabs: renderStatusTabs(active.length, sold.length),
    grids: renderGrids(active, sold),
    updatedLabel,
  });

  if (DRY_RUN) {
    log('\n[--dry] 파일을 쓰지 않았습니다.');
    for (const l of [...active, ...sold]) {
      log(`  ${l.saleDate ? l.saleDate.toISOString().slice(0, 10) : '기일미상'} | ${(l.sido || '?') + ' ' + (l.sigungu || '')} | ${l.name} | 최저 ${formatKoreanMoney(l.minBid) || '?'} | 감정 ${formatKoreanMoney(l.appraisal) || '?'} | ${l.caseNo || '사건번호?'} | img:${l.image ? 'O' : 'X'}`);
    }
    return;
  }

  if (next === html) {
    log('· index.html 변경 없음');
  } else {
    await writeFile(INDEX_FILE, next, 'utf8');
    log('· index.html 갱신 완료');
  }

  /* 물건 상세 페이지 — 카드가 여기로 연결된다. index.html 이 그대로여도
     상세 페이지 쪽은 문구가 바뀌었을 수 있으니 항상 다시 만든다. */
  await mkdir(path.join(ROOT, 'data'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'data', 'listings.json'),
    JSON.stringify(listings, null, 1),
    'utf8',
  );

  const pages = await buildListingPages(ROOT, listings);
  log(`· 물건 상세 페이지 ${pages.length}장 생성`);

  await buildSitemap(ROOT, pages);
  log('· sitemap.xml 갱신');

  /* 더 이상 쓰이지 않는 자동 이미지 정리 */
  const used = new Set(listings.map((l) => l.image && path.basename(l.image)).filter(Boolean));
  for (const f of await readdir(IMAGE_DIR)) {
    if (!used.has(f)) { await unlink(path.join(IMAGE_DIR, f)); log(`  - 사용하지 않는 이미지 삭제 ${f}`); }
  }
}

await mkdir(IMAGE_DIR, { recursive: true });
await main();
