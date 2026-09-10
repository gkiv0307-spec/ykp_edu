/**
 * 물건 목록과 무관한 고정 페이지를 만든다. 지금은 상담신청 페이지 한 장.
 *
 *   node scripts/build-static-pages.mjs
 *
 * 헤더·푸터는 index.html 에서 그대로 가져오므로 메뉴가 바뀌어도 따로 손댈 필요가 없다.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell, renderPage } from './lib/shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://xn--289av8kwmfs4dv2e.store';

const FIELDS = {
  관심분야: [
    '내 집 마련 (실거주)',
    '상가·건물 투자',
    '재테크·수익형 부동산',
    '경매 수강 문의',
    '특정 물건 컨설팅',
  ],
  경매경험: [
    '처음입니다',
    '기초는 알고 있습니다',
    '입찰해 본 적 있습니다',
    '낙찰받아 본 적 있습니다',
  ],
};

const options = (list) => list.map((v) => `<option value="${v}">${v}</option>`).join('');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 수강료를 index.html 의 과정 카드에서 직접 읽어 온다.
 * 금액을 여기에 또 적어두면 한쪽만 고쳐져 서로 어긋난다.
 * (같은 이유로 가격표를 이미지로 만들지 않았다 — 금액이 바뀌면 다시 그려야 한다.)
 */
async function readCourses(root) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const cards = [...html.matchAll(/<article class="course-card([^"]*)" id="([^"]+)">([\s\S]*?)<\/article>/g)];

  return cards.map(([, , id, body]) => {
    const title = body.match(/<div class="course-title"><h3>([^<]+)<\/h3><p>([^<]*)<\/p>/);
    const meta = [...body.matchAll(/<small>(진행 방식|기간)<\/small><strong>([^<]+)<\/strong>/g)];

    const single = body.match(/<div class="course-price"><strong>([^<]+)<\/strong><span>([^<]*)<\/span>/);
    const optionBlock = body.match(/<div class="course-price-options">([\s\S]*?)<\/div>\s*<div class="course-goal"/);
    const optionPrices = optionBlock
      ? [...optionBlock[1].matchAll(/<small>([^<]+)<\/small><strong>([^<]+)<\/strong>/g)]
        .map((m) => ({ label: m[1], price: m[2] }))
      : [];

    return {
      id,
      name: title?.[1] ?? '',
      sub: title?.[2] ?? '',
      method: meta.find((m) => m[1] === '진행 방식')?.[2] ?? '',
      duration: meta.find((m) => m[1] === '기간')?.[2] ?? '',
      price: single?.[1] ?? null,
      note: single?.[2] ?? '',
      optionPrices,
    };
  }).filter((c) => c.name);
}

/** 상담신청 페이지에 넣을 수강료 요약표 */
function priceTable(courses) {
  const priceCell = (c) => {
    if (c.optionPrices.length) {
      return c.optionPrices
        .map((o) => `<span class="price-opt"><small>${esc(o.label)}</small><b>${esc(o.price)}</b></span>`)
        .join('');
    }
    return `<b>${esc(c.price || '상담 후 안내')}</b>`
      + (c.note ? `<small>${esc(c.note)}</small>` : '');
  };

  return '<section class="price-table" id="prices">'
    + '<h2>수강료 한눈에 보기</h2>'
    + '<p class="price-lead">모든 금액은 부가세와 교재비가 포함된 기준입니다. '
    + '어떤 과정이 맞을지 모르겠다면 위에 연락처만 남겨주세요.</p>'
    + '<div class="price-scroll"><table>'
    + '<thead><tr><th scope="col">과정</th><th scope="col">진행 방식</th>'
    + '<th scope="col">기간</th><th scope="col">수강료</th></tr></thead><tbody>'
    + courses.map((c) => '<tr>'
      + `<th scope="row"><a href="/#${esc(c.id)}">${esc(c.name)}</a><small>${esc(c.sub)}</small></th>`
      + `<td data-label="진행 방식">${esc(c.method || '-')}</td>`
      + `<td data-label="기간">${esc(c.duration || '-')}</td>`
      + `<td class="price-cell" data-label="수강료">${priceCell(c)}</td>`
      + '</tr>').join('')
    + '</tbody></table></div>'
    + '<a class="button button-line price-more" href="/#courses">과정별 상세 내용 보기 <span>→</span></a>'
    + '</section>';
}

function applyPage(shell, courses) {
  const content = '<article class="apply-page">'
    + '<nav class="listing-crumb" aria-label="현재 위치">'
    + '<a href="/">홈</a><span>›</span><em>상담 신청</em></nav>'

    + '<header class="apply-head">'
    + '<p class="eyebrow dark"><span></span> 상담 신청</p>'
    + '<h1>어떤 물건을, 얼마에<br/>사야 할지 같이 계산해 드립니다.</h1>'
    + '<p class="apply-lead">연락처를 남겨주시면 <strong>영업일 기준 1일 안에</strong> 연락드립니다. '
    + '상담 전에 미리 알아두면 좋은 내용도 함께 보내드립니다.</p>'
    + '<ul class="apply-trust">'
    + '<li>상담료 없음</li><li>가입 절차 없음</li><li>전국 물건 가능</li>'
    + '</ul>'
    + '</header>'

    + '<form class="apply-form" id="consult-form" novalidate>'
    + '<div class="apply-field" data-item-wrap hidden>'
    + '<label for="f-item">문의 물건</label>'
    + '<input type="text" id="f-item" name="물건" readonly/>'
    + '</div>'

    + '<div class="apply-row">'
    + '<div class="apply-field">'
    + '<label for="f-name">이름 <b aria-hidden="true">*</b><span class="sr-only">필수</span></label>'
    + '<input type="text" id="f-name" name="이름" required autocomplete="name" placeholder="홍길동"/>'
    + '<p class="apply-error" data-for="f-name"></p>'
    + '</div>'
    + '<div class="apply-field">'
    + '<label for="f-phone">연락처 <b aria-hidden="true">*</b><span class="sr-only">필수</span></label>'
    + '<input type="tel" id="f-phone" name="연락처" required autocomplete="tel" inputmode="numeric" placeholder="010-0000-0000"/>'
    + '<p class="apply-error" data-for="f-phone"></p>'
    + '</div>'
    + '</div>'

    + '<div class="apply-row">'
    + '<div class="apply-field">'
    + '<label for="f-interest">무엇이 궁금하신가요?</label>'
    + `<select id="f-interest" name="관심분야">${options(FIELDS.관심분야)}</select>`
    + '</div>'
    + '<div class="apply-field">'
    + '<label for="f-level">경매 경험</label>'
    + `<select id="f-level" name="경매경험">${options(FIELDS.경매경험)}</select>`
    + '</div>'
    + '</div>'

    + '<div class="apply-field">'
    + '<label for="f-msg">하고 싶은 말 <small>(선택)</small></label>'
    + '<textarea id="f-msg" name="문의내용" rows="4" '
    + 'placeholder="예) 수성구 쪽 3억 이하 아파트를 보고 있습니다. 대출이 얼마나 나올지 궁금합니다."></textarea>'
    + '</div>'

    + '<label class="apply-agree">'
    + '<input type="checkbox" id="f-agree" name="개인정보동의" required/>'
    + '<span>상담 연락을 위한 <strong>이름·연락처 수집</strong>에 동의합니다. '
    + '상담 목적 외에는 사용하지 않으며, 요청하시면 즉시 삭제합니다.</span>'
    + '</label>'
    + '<p class="apply-error" data-for="f-agree"></p>'

    + '<button type="submit" class="button button-primary apply-submit">상담 신청하기 <span>→</span></button>'
    + '<p class="apply-status" role="status" aria-live="polite"></p>'
    + '</form>'

    + '<section class="apply-alt">'
    + '<h2>바로 물어보고 싶다면</h2>'
    + '<div class="apply-alt-actions">'
    + '<a class="button button-line" href="https://open.kakao.com/o/s91CvTFf" target="_blank" rel="noreferrer">카카오톡 상담</a>'
    + '<a class="button button-line" href="tel:0532810759">전화 053-281-0759</a>'
    + '</div>'
    + '</section>'
    + priceTable(courses)
    + '</article>';

  return renderPage({
    shell,
    title: '상담 신청 | 옆커폰부동산에듀 대구경매학원',
    description: '내 집 마련부터 상가·건물 투자까지, 어떤 물건을 얼마에 사야 할지 함께 계산해 드립니다. '
      + '연락처를 남겨주시면 영업일 기준 1일 안에 연락드립니다. 상담료 없음.',
    canonical: `${SITE}/apply.html`,
    image: `${SITE}/assets/ykphone-logo-horizontal.png`,
    bodyClass: 'page-apply',
    scripts: ['/js/consult-form.js'],
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: '상담 신청',
      url: `${SITE}/apply.html`,
      about: { '@type': 'EducationalOrganization', name: '옆커폰부동산에듀' },
    }],
    breadcrumb: [
      { name: '홈', url: `${SITE}/` },
      { name: '상담 신청', url: `${SITE}/apply.html` },
    ],
    content,
  });
}

const shell = await loadShell(ROOT);
const courses = await readCourses(ROOT);
await writeFile(path.join(ROOT, 'apply.html'), applyPage(shell, courses), 'utf8');
console.log(`· apply.html 생성 (수강료 ${courses.length}개 과정 반영)`);
