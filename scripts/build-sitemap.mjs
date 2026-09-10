/**
 * sitemap.xml 을 다시 만든다.
 *
 * 물건 페이지는 매일 늘고 줄고, 과정 페이지도 나중에 늘어난다.
 * 호출하는 쪽에서 목록을 넘겨받는 방식이면 한쪽만 갱신됐을 때
 * 나머지가 sitemap 에서 사라진다. 그래서 폴더를 직접 훑는다.
 */

import { writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SITE = 'https://xn--289av8kwmfs4dv2e.store';

/* 폴더에서 생성되지 않는 낱장 페이지들 */
const STATIC_PAGES = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/apply.html', changefreq: 'monthly', priority: '0.9' },
];

/* 훑어서 넣을 폴더들 */
const SCAN_DIRS = [
  { dir: 'courses', changefreq: 'monthly', priority: '0.8' },
  { dir: 'listings', changefreq: 'weekly', priority: '0.7' },
];

async function htmlFilesIn(root, dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  const files = await readdir(abs);
  return files.filter((f) => f.endsWith('.html')).sort().map((f) => `/${dir}/${f}`);
}

export async function buildSitemap(root) {
  const today = new Date().toISOString().slice(0, 10);

  const entries = [...STATIC_PAGES];
  for (const { dir, changefreq, priority } of SCAN_DIRS) {
    for (const loc of await htmlFilesIn(root, dir)) {
      entries.push({ loc, changefreq, priority });
    }
  }

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

export { STATIC_PAGES };
