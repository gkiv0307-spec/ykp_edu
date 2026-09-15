/**
 * /policy.html — 결제 전에 알아야 할 것들을 한 장에 모은다.
 *
 * 환불·연기·질문기간과 개인정보 처리는 대표가 정할 내용이라
 * data/policy.json 에서 읽는다. 값이 null 인 항목은 렌더링하지 않는다.
 * 확정되지 않은 규정이 그럴듯한 모습으로 공개되는 것이 가장 나쁘다.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderPage } from './lib/shell.mjs';

const SITE = 'https://xn--289av8kwmfs4dv2e.store';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const table = (head, rows) => '<div class="policy-scroll"><table>'
  + `<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>`
  + rows.map((r) => '<tr>'
    + `<th scope="row">${esc(r[0])}</th>`
    + r.slice(1).map((c, i) => `<td data-label="${esc(head[i + 1])}">${esc(c)}</td>`).join('')
    + '</tr>').join('')
  + '</tbody></table></div>';

const block = (id, title, inner) => (inner
  ? `<section class="policy-block" id="${id}"><h2>${esc(title)}</h2>${inner}</section>`
  : '');

const para = (label, text) => (text
  ? `<dl class="policy-pair"><dt>${esc(label)}</dt><dd>${esc(text)}</dd></dl>` : '');

function policyPage(shell, p) {
  const r = p.환불;
  const refund = r ? table(['수강을 그만두는 시점', '돌려드리는 금액'], r.단계)
    + (r.근거 ? `<p class="policy-note">기준: ${esc(r.근거)}</p>` : '')
    + (r.비고 ? `<p class="policy-note">${esc(r.비고)}</p>` : '') : '';

  const qna = p.질문지원 ? table(['과정', '질문에 답해 드리는 기간'], p.질문지원) : '';

  /* 아직 정해지지 않은 항목은 통째로 빠진다 */
  const extras = [['연기', p.연기], ['결석', p.결석], ['영상 복습', p.영상복습]]
    .filter(([, v]) => v).map(([k, v]) => para(k, v)).join('');

  const pi = p.개인정보 || {};
  const privacy = [
    pi.수집항목 ? table(['구분', '수집하는 정보'], pi.수집항목) : '',
    para('이용 목적', pi.이용목적),
    para('보유 기간', pi.보유기간),
    para('파기', pi.파기),
    pi.위탁 ? '<h3>처리 위탁</h3>' + table(['받는 곳', '맡기는 일'], pi.위탁) : '',
    para('동의를 거부할 권리', pi.거부권리),
    para('개인정보 보호책임자', pi.책임자),
  ].join('');

  const content = '<article class="policy-page">'
    + '<nav class="listing-crumb" aria-label="현재 위치">'
    + '<a href="/">홈</a><span>›</span><em>수강 안내</em></nav>'
    + '<header class="policy-head">'
    + '<p class="eyebrow dark"><span></span> 결제 전에 확인하세요</p>'
    + '<h1>수강 안내와<br/>개인정보 처리</h1>'
    + '<p class="policy-lead">돈을 내기 전에 알아야 할 것을 한 장에 모았습니다. '
    + '여기에 적히지 않은 조건은 계약서에서 다시 확인하실 수 있습니다.</p>'
    + '</header>'
    + block('refund', '환불', refund)
    + block('qna', '수료 후 질문 지원', qna)
    + block('etc', '연기 · 결석 · 복습', extras)
    + block('privacy', '개인정보 수집·이용 안내', privacy)
    + '<section class="policy-block"><h2>문의</h2>'
    + '<p class="policy-note">규정에 대해 궁금한 점은 상담 신청이나 전화로 물어봐 주세요.</p>'
    + '<div class="policy-actions">'
    + '<a class="button button-primary" href="/apply.html">무료 상담 신청 <span>→</span></a>'
    + '<a class="button button-line" href="tel:0532810759">전화 053-281-0759</a>'
    + '</div></section>'
    + '</article>';

  return renderPage({
    shell,
    title: '수강 안내와 개인정보 처리 | 옆커폰부동산에듀',
    description: '환불 기준, 수료 후 질문 지원 기간, 개인정보 수집 항목과 이용 목적을 결제 전에 확인하실 수 있도록 정리했습니다.',
    canonical: `${SITE}/policy.html`,
    image: `${SITE}/assets/ykphone-logo-horizontal.png`,
    bodyClass: 'page-policy',
    breadcrumb: [
      { name: '홈', url: `${SITE}/` },
      { name: '수강 안내', url: `${SITE}/policy.html` },
    ],
    content,
  });
}

export async function buildPolicyPage(root, shell) {
  const p = JSON.parse(await readFile(path.join(root, 'data', 'policy.json'), 'utf8'));
  await writeFile(path.join(root, 'policy.html'), policyPage(shell, p), 'utf8');

  /* 아직 못 채운 항목을 빌드 때마다 알려준다 */
  const missing = [];
  if (!p.연기) missing.push('연기');
  if (!p.결석) missing.push('결석');
  if (!p.영상복습) missing.push('영상복습');
  if (!p.개인정보?.보유기간) missing.push('개인정보 보유기간');
  if (!p.개인정보?.책임자) missing.push('개인정보 보호책임자');
  return missing;
}
