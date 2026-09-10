/**
 * 물건 1건당 상세 페이지 한 장을 만든다.  →  /listings/<사건번호>.html
 *
 * 왜 만드는가:
 * 지금은 물건 카드 44개가 전부 네이버 블로그로 나가서, 방문자는 새어나가고
 * 사이트에는 검색에 걸릴 페이지가 메인 하나뿐이다. 물건마다 페이지를 두면
 * "대구 수성구 아파트 경매" 같은 검색어로 들어올 입구가 44개로 늘고,
 * 들어온 사람을 상담까지 끌고 갈 수 있다.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage } from './lib/shell.mjs';

const SITE = 'https://xn--289av8kwmfs4dv2e.store';
const OUT_DIR_NAME = 'listings';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const won = (n) => (Number.isFinite(n) && n > 0
  ? (() => {
    const eok = Math.floor(n / 1e8); const man = Math.floor((n % 1e8) / 1e4);
    if (eok && man) return `${eok}억 ${man.toLocaleString('ko-KR')}만원`;
    if (eok) return `${eok}억원`;
    return `${man.toLocaleString('ko-KR')}만원`;
  })()
  : null);

/**
 * 주소에 쓸 식별자. 한글을 넣으면 서버·CDN마다 인코딩 처리가 달라
 * 링크가 깨질 수 있어 ASCII로만 만든다.  "2025타경8824" → "2025tg8824"
 * 검색 키워드는 제목·본문이 담당하므로 주소가 영문이어도 손해가 없다.
 */
export function slugOf(l) {
  const base = l.caseNo ? l.caseNo.replace(/타경/g, 'tg') : `post${l.id}`;
  const ascii = base.replace(/[^0-9A-Za-z]/g, '');
  return ascii || `post${l.id}`;
}

/**
 * 이미지 경로를 루트 기준으로 바꾼다.
 * 목록 데이터에는 "assets/…" 로 들어 있는데, 상세 페이지는 /listings/ 안에 있어서
 * 그대로 쓰면 /listings/assets/… 를 찾다가 깨진다.
 */
const imgSrc = (l) => {
  const p = l?.image || 'assets/ykphone-logo-mark.png';
  return p.startsWith('/') || p.startsWith('http') ? p : `/${p}`;
};

/** 요약문에서 앞쪽 2문장만 — 블로그 본문을 통째로 베끼면 중복 콘텐츠가 된다. */
function excerpt(text, max = 180) {
  if (!text) return '';
  const s = text.split(/(?<=다\.|요\.|\.)\s/).slice(0, 2).join(' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function summaryRows(l) {
  const rows = [
    ['소재지', [l.sido, l.sigungu].filter(Boolean).join(' ') || null],
    ['물건 종류', l.kind],
    ['전용면적', l.area ? `${l.area}㎡ (약 ${(l.area * 0.3025).toFixed(1)}평)` : null],
    ['감정가', won(l.appraisal)],
    ['최저매각가격', won(l.minBid)],
    ['감정가 대비', l.appraisal && l.minBid ? `${Math.round((l.minBid / l.appraisal) * 100)}%` : null],
    ['매각기일', l.saleDate ? new Date(l.saleDate).toLocaleDateString('ko-KR') : null],
    ['담당 법원', l.court],
    ['사건번호', l.caseNo],
  ].filter(([, v]) => v);

  return `<dl class="listing-facts">${rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function relatedBlock(l, all) {
  const near = all
    .filter((o) => slugOf(o) !== slugOf(l) && o.sido === l.sido && !o.sold)
    .slice(0, 3);
  if (!near.length) return '';

  return '<section class="listing-related"><h2>같은 지역 다른 물건</h2><div class="listing-related-grid">'
    + near.map((o) => `<a href="/${OUT_DIR_NAME}/${slugOf(o)}.html">`
      + `<img src="${esc(imgSrc(o))}" alt="${esc(o.name)}" loading="lazy" width="720" height="540"/>`
      + `<strong>${esc(o.name)}</strong>`
      + `<small>${esc([o.sido, o.sigungu].filter(Boolean).join(' · '))}</small>`
      + `<b>${esc(won(o.minBid) || '가격 문의')}</b></a>`).join('')
    + '</div></section>';
}

function ctaBlock(l) {
  const label = `${l.name} (${l.caseNo || '사건번호 미상'})`;
  return '<section class="listing-cta">'
    + '<h2>이 물건, 입찰해도 될까요?</h2>'
    + '<p>권리분석·시세조사·적정 입찰가까지 함께 계산해 드립니다. '
    + '사건번호를 남겨주시면 확인 후 연락드립니다.</p>'
    + `<div class="listing-cta-actions">`
    + `<a class="button button-primary" href="/apply.html?item=${encodeURIComponent(label)}">이 물건 상담 신청 <span>→</span></a>`
    + '<a class="button button-ghost" href="https://open.kakao.com/o/s91CvTFf" target="_blank" rel="noreferrer">카카오톡으로 묻기</a>'
    + '<a class="button button-ghost" href="tel:0532810759">전화상담 053-281-0759</a>'
    + '</div></section>';
}

function pageFor(l, all, shell) {
  const place = [l.sido, l.sigungu].filter(Boolean).join(' ');
  const priceLabel = won(l.minBid) || won(l.appraisal) || '';
  const title = `${place} ${l.name} ${l.kind} 경매 ${priceLabel}${l.caseNo ? ` | ${l.caseNo}` : ''}`;
  const ratio = l.appraisal && l.minBid ? Math.round((l.minBid / l.appraisal) * 100) : null;

  const description = [
    `${place} ${l.name} ${l.kind} 경매 물건입니다.`,
    won(l.appraisal) ? `감정가 ${won(l.appraisal)}` : null,
    won(l.minBid) ? `최저가 ${won(l.minBid)}${ratio ? ` (감정가의 ${ratio}%)` : ''}` : null,
    l.saleDate ? `매각기일 ${new Date(l.saleDate).toLocaleDateString('ko-KR')}.` : null,
    '권리분석과 적정 입찰가까지 상담해 드립니다.',
  ].filter(Boolean).join(' ');

  const canonical = `${SITE}/${OUT_DIR_NAME}/${slugOf(l)}.html`;
  const image = SITE + imgSrc(l);

  const content = '<article class="listing-detail">'
    + '<nav class="listing-crumb" aria-label="현재 위치">'
    + '<a href="/">홈</a><span>›</span><a href="/#properties">전국 경매물건</a>'
    + `<span>›</span><em>${esc(l.name)}</em></nav>`
    + `<header class="listing-head"><p class="eyebrow dark"><span></span> ${esc(place)} · ${esc(l.kind)} 경매</p>`
    + `<h1>${esc(l.name)}</h1>`
    + (l.saleDate || ratio
      ? `<div class="listing-badges">${ratio ? `<span>감정가의 ${ratio}%</span>` : ''}`
        + `${l.sold ? '<span class="is-sold">낙찰완료</span>'
          : l.saleDate ? `<span>매각기일 ${new Date(l.saleDate).toLocaleDateString('ko-KR')}</span>` : ''}</div>`
      : '')
    + '</header>'
    + `<div class="listing-visual"><img src="${esc(imgSrc(l))}" `
    + `alt="${esc(`${place} ${l.name} 경매 물건`)}" width="720" height="540"/></div>`
    + summaryRows(l)
    + (excerpt(l.description)
      ? `<section class="listing-summary"><h2>물건 요약</h2><p>${esc(excerpt(l.description))}</p>`
        + `<a class="listing-source" href="${esc(l.link)}" target="_blank" rel="noreferrer">`
        + '블로그에서 권리분석 전문 보기 ↗</a></section>'
      : '')
    + ctaBlock(l)
    + relatedBlock(l, all)
    + '</article>';

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${place} ${l.name} ${l.kind} 경매`,
    image: [image],
    description,
    sku: l.caseNo || l.id,
    ...(l.minBid ? {
      offers: {
        '@type': 'Offer',
        price: l.minBid,
        priceCurrency: 'KRW',
        availability: l.sold
          ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        url: canonical,
      },
    } : {}),
  }];

  return renderPage({
    shell,
    title,
    description,
    canonical,
    image,
    bodyClass: 'page-listing',
    jsonLd,
    breadcrumb: [
      { name: '홈', url: `${SITE}/` },
      { name: '전국 경매물건', url: `${SITE}/#properties` },
      { name: l.name, url: canonical },
    ],
    content,
  });
}

/** 물건 목록 전체를 받아 상세 페이지들을 쓰고, 만든 파일 목록을 돌려준다. */
export async function buildListingPages(root, listings) {
  const shell = await loadShell(root);
  const outDir = path.join(root, OUT_DIR_NAME);
  await mkdir(outDir, { recursive: true });

  const written = new Set();
  for (const l of listings) {
    const file = `${slugOf(l)}.html`;
    await writeFile(path.join(outDir, file), pageFor(l, listings, shell), 'utf8');
    written.add(file);
  }

  /* 목록에서 빠진 물건의 페이지는 지운다 */
  if (existsSync(outDir)) {
    for (const f of await readdir(outDir)) {
      if (f.endsWith('.html') && !written.has(f)) {
        await unlink(path.join(outDir, f));
      }
    }
  }

  return [...written].map((f) => `/${OUT_DIR_NAME}/${f}`);
}

export { SITE, OUT_DIR_NAME };
