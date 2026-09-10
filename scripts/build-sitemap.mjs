/**
 * sitemap.xml 을 다시 만든다.
 *
 * 물건 페이지가 매일 늘고 줄기 때문에 손으로 관리할 수 없다.
 * 고정 페이지 목록 + 그날의 물건 페이지 목록을 합쳐서 쓴다.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://xn--289av8kwmfs4dv2e.store';

/* 물건 목록과 무관하게 항상 들어가는 페이지들.
   새 페이지를 만들면 여기에 한 줄 추가하면 된다. */
export const STATIC_PAGES = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/apply.html', changefreq: 'monthly', priority: '0.9' },
];

export async function buildSitemap(root, listingPages = [], extraPages = []) {
  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    ...STATIC_PAGES,
    ...extraPages,
    ...listingPages.map((p) => ({ loc: p, changefreq: 'weekly', priority: '0.7' })),
  ];

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.map((e) => '  <url>\n'
      + `    <loc>${SITE}${encodeURI(e.loc)}</loc>\n`
      + `    <lastmod>${today}</lastmod>\n`
      + `    <changefreq>${e.changefreq}</changefreq>\n`
      + `    <priority>${e.priority}</priority>\n`
      + '  </url>').join('\n')
    + '\n</urlset>\n';

  await writeFile(path.join(root, 'sitemap.xml'), xml, 'utf8');
  return entries.length;
}
