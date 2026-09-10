/**
 * 과정 1개당 페이지 한 장을 만든다.  →  /courses/<이름>.html
 *
 * 왜 만드는가:
 * 과정 정보가 메인 페이지 안에만 있어서 "대구 경매 초급반" 처럼 과정을
 * 콕 집어 찾는 검색어로 들어올 입구가 없었다. 과정마다 페이지를 두면
 * 검색 입구가 생기고, 나중에 결제 버튼을 붙일 자리도 여기가 된다.
 */

import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage } from './lib/shell.mjs';
import { readCourses } from './lib/courses.mjs';

const SITE = 'https://xn--289av8kwmfs4dv2e.store';
const OUT_DIR = 'courses';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const priceLabel = (c) => (c.price
  ? c.price
  : c.optionPrices.map((o) => `${o.label} ${o.price}`).join(' / ') || '상담 후 안내');

function priceBlock(c) {
  if (c.optionPrices.length) {
    return '<div class="cp-options">'
      + c.optionPrices.map((o) => '<div class="cp-option">'
        + `<small>${esc(o.label)}</small><strong>${esc(o.price)}</strong>`
        + (o.note ? `<span>${esc(o.note)}</span>` : '')
        + '</div>').join('')
      + '</div>';
  }
  return '<div class="cp-price">'
    + `<strong>${esc(c.price || '상담 후 안내')}</strong>`
    + (c.priceNote ? `<span>${esc(c.priceNote)}</span>` : '')
    + '</div>';
}

function otherCourses(c, all) {
  const rest = all.filter((o) => o.slug !== c.slug);
  if (!rest.length) return '';
  return '<section class="cp-others"><h2>다른 과정도 살펴보세요</h2><div class="cp-others-grid">'
    + rest.map((o) => `<a href="/${OUT_DIR}/${o.slug}.html">`
      + `<small>${esc(o.step)}</small><strong>${esc(o.name)}</strong>`
      + `<span>${esc(o.sub)}</span><b>${esc(priceLabel(o))}</b></a>`).join('')
    + '</div></section>';
}

function pageFor(c, all, shell) {
  const title = `${c.name} | 대구경매학원 ${c.sub} - 옆커폰부동산에듀`;
  const description = [
    `${c.name} — ${c.sub}.`,
    c.method ? `${c.method},` : null,
    c.duration ? `${c.duration}.` : null,
    `수강료 ${priceLabel(c)}.`,
    c.goal ? `${c.goal}을 목표로 합니다.` : null,
    '상담료 없이 먼저 문의해 보세요.',
  ].filter(Boolean).join(' ');

  const canonical = `${SITE}/${OUT_DIR}/${c.slug}.html`;
  const applyHref = `/apply.html?course=${encodeURIComponent(c.name)}`;

  const content = '<article class="course-page">'
    + '<nav class="listing-crumb" aria-label="현재 위치">'
    + '<a href="/">홈</a><span>›</span><a href="/#courses">수강료·과정</a>'
    + `<span>›</span><em>${esc(c.name)}</em></nav>`

    + '<header class="cp-head">'
    + `<p class="eyebrow dark"><span></span> ${esc(c.step)}</p>`
    + `<h1>${esc(c.name)}</h1>`
    + `<p class="cp-sub">${esc(c.sub)}</p>`
    + (c.goal ? `<p class="cp-goal"><small>핵심 목표</small><strong>${esc(c.goal)}</strong></p>` : '')
    + '</header>'

    + '<div class="cp-summary">'
    + (c.method ? `<div><small>진행 방식</small><strong>${esc(c.method)}</strong></div>` : '')
    + (c.duration ? `<div><small>기간</small><strong>${esc(c.duration)}</strong></div>` : '')
    + '</div>'

    + priceBlock(c)

    + (c.audience.length
      ? '<section class="cp-audience"><h2>이런 분께 추천합니다</h2><ul>'
        + c.audience.map((a) => `<li>${esc(a)}</li>`).join('')
        + '</ul></section>'
      : '')

    + (c.curriculum.length
      ? `<section class="cp-curriculum"><h2>${esc(c.contentHeading)}</h2><ol>`
        + c.curriculum.map((v) => `<li>${esc(v)}</li>`).join('')
        + '</ol></section>'
      : '')

    + (c.support.length
      ? '<section class="cp-support"><h2>과정에 포함된 것</h2><dl>'
        + c.support.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')
        + '</dl></section>'
      : '')

    + (c.benefits.length
      ? '<section class="cp-benefits"><h2>선택 서비스 <small>지역·항목별로 다릅니다</small></h2><dl>'
        + c.benefits.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')
        + '</dl></section>'
      : '')

    + '<section class="cp-cta">'
    + `<h2>${esc(c.name)}, 나에게 맞을까요?</h2>`
    + '<p>경매 경험과 목표를 들어보고 맞는 단계를 알려드립니다. '
    + '억지로 상위 과정을 권하지 않습니다.</p>'
    + '<div class="cp-cta-actions">'
    + `<a class="button button-primary" href="${applyHref}">이 과정 상담 신청 <span>→</span></a>`
    + '<a class="button button-ghost" href="https://open.kakao.com/o/s91CvTFf" target="_blank" rel="noreferrer">카카오톡으로 묻기</a>'
    + '<a class="button button-ghost" href="tel:0532810759">전화 053-281-0759</a>'
    + '</div>'
    + (c.links.length
      ? '<p class="cp-more">'
        + c.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`).join('')
        + '</p>'
      : '')
    + '</section>'

    + otherCourses(c, all)
    + '</article>';

  return renderPage({
    shell,
    title,
    description,
    canonical,
    image: `${SITE}/assets/ykphone-logo-horizontal.png`,
    bodyClass: 'page-course',
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${c.name} - ${c.sub}`,
      description,
      url: canonical,
      provider: {
        '@type': 'EducationalOrganization',
        name: '옆커폰부동산에듀',
        url: `${SITE}/`,
      },
      ...(c.curriculum.length ? { teaches: c.curriculum } : {}),
      hasCourseInstance: {
        '@type': 'CourseInstance',
        courseMode: /온라인/.test(c.method) ? 'online' : 'onsite',
        location: {
          '@type': 'Place',
          name: '옆커폰부동산에듀',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '두산동 207-5, 2층 204호',
            addressLocality: '대구광역시 수성구',
            addressCountry: 'KR',
          },
        },
      },
    }],
    breadcrumb: [
      { name: '홈', url: `${SITE}/` },
      { name: '수강료·과정', url: `${SITE}/#courses` },
      { name: c.name, url: canonical },
    ],
    content,
  });
}

export async function buildCoursePages(root) {
  const shell = await loadShell(root);
  const courses = await readCourses(root);
  const dir = path.join(root, OUT_DIR);
  await mkdir(dir, { recursive: true });

  const written = new Set();
  for (const c of courses) {
    const file = `${c.slug}.html`;
    await writeFile(path.join(dir, file), pageFor(c, courses, shell), 'utf8');
    written.add(file);
  }

  if (existsSync(dir)) {
    for (const f of await readdir(dir)) {
      if (f.endsWith('.html') && !written.has(f)) await unlink(path.join(dir, f));
    }
  }

  return { pages: [...written].map((f) => `/${OUT_DIR}/${f}`), courses };
}

export { OUT_DIR };
