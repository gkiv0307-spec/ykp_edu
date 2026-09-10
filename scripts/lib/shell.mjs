/**
 * index.html 에서 공통 껍데기(헤더·푸터·플로팅 버튼)를 뽑아
 * 하위 페이지에 그대로 씌운다.
 *
 * 파셜 파일을 따로 두지 않고 index.html 을 단일 출처로 삼는 이유:
 * 메뉴가 바뀔 때 두 곳을 고치다 어긋나는 일이 생기지 않는다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const between = (html, startTag, endTag) => {
  const s = html.indexOf(startTag);
  if (s === -1) return '';
  const e = html.indexOf(endTag, s);
  return e === -1 ? '' : html.slice(s, e + endTag.length);
};

/** 하위 디렉터리에서도 깨지지 않도록 상대경로를 루트 기준으로 바꾼다. */
function toRootRelative(html) {
  return html
    .replace(/(href|src)="(assets|css|js)\//g, '$1="/$2/')
    .replace(/href="#/g, 'href="/#');
}

export async function loadShell(root) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  return {
    header: toRootRelative(between(html, '<header', '</header>')),
    footer: toRootRelative(between(html, '<footer', '</footer>')),
    floating: toRootRelative(between(html, '<aside class="floating-consult"', '</aside>')),
    mobileNav: toRootRelative(
      between(html, '<div class="mobile-menu-backdrop', '</div>')
      + between(html, '<nav class="mobile-menu ', '</nav>'),
    ),
  };
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 완성된 HTML 문서 한 장을 만든다.
 * canonical/og 를 페이지마다 제대로 넣어야 검색엔진이 각 페이지를 따로 인식한다.
 */
export function renderPage({
  shell, title, description, canonical, image, bodyClass = '',
  jsonLd = [], breadcrumb = null, content, scripts = [],
}) {
  const ld = [...jsonLd];
  if (breadcrumb) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumb.map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: b.name, item: b.url,
      })),
    });
  }

  return '<!DOCTYPE html><html lang="ko"><head>'
    + '<meta charSet="utf-8"/>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    + `<title>${esc(title)}</title>`
    + `<meta name="description" content="${esc(description)}"/>`
    + '<meta name="robots" content="index,follow"/>'
    + `<link rel="canonical" href="${esc(canonical)}"/>`
    + '<link rel="shortcut icon" href="/assets/ykphone-logo-mark.png"/>'
    + '<link rel="icon" href="/assets/ykphone-logo-mark.png"/>'
    + '<meta property="og:type" content="article"/>'
    + '<meta property="og:site_name" content="옆커폰부동산에듀"/>'
    + `<meta property="og:title" content="${esc(title)}"/>`
    + `<meta property="og:description" content="${esc(description)}"/>`
    + `<meta property="og:url" content="${esc(canonical)}"/>`
    + `<meta property="og:image" content="${esc(image)}"/>`
    + '<meta property="og:locale" content="ko_KR"/>'
    + '<meta name="twitter:card" content="summary_large_image"/>'
    + `<meta name="twitter:title" content="${esc(title)}"/>`
    + `<meta name="twitter:description" content="${esc(description)}"/>`
    + `<meta name="twitter:image" content="${esc(image)}"/>`
    + '<link rel="stylesheet" href="/css/style.css"/>'
    + ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')
    + `</head><body class="${bodyClass}"><main>`
    + shell.header + shell.mobileNav
    + content
    + shell.footer + shell.floating
    + '</main><script src="/js/main.js" defer></script>'
    + scripts.map((s) => `<script src="${esc(s)}" defer></script>`).join('')
    + '</body></html>';
}
