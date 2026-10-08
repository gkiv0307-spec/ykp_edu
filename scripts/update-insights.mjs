import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {parseRss} from './update-listings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = 'hjko0';
const LIMIT = 12;
const CATEGORIES = new Set(['부동산투자뉴스', '부동산정책브리핑', '경매지식정보']);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function selectPosts(xml) {
  const seen = new Set();
  return parseRss(xml, BLOG)
    .filter((p) => CATEGORIES.has(p.category.replace(/\s/g, '')))
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .slice(0, LIMIT);
}

export function thumbnailUrl(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/property=["']og:image["']/i.test(tag)) continue;
    const value = tag.match(/content=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
    if (!value) continue;
    const url = new URL(value);
    if (url.protocol === 'https:' && /(^|\.)pstatic\.net$/.test(url.hostname)) return url.href;
  }
  throw new Error('네이버 공개 썸네일을 찾지 못했습니다.');
}

export function renderInsights(posts) {
  const cards = posts.map((p, i) =>
    `<a class="insight-slide" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.title)} — 블로그에서 새 창으로 보기">` +
    `<img src="${esc(p.image)}" alt="${esc(p.title)}" width="720" height="720" loading="lazy" decoding="async"/>` +
    `<span class="insight-open" aria-hidden="true">↗</span></a>`
  ).join('');
  return '<section class="section insights-section" id="insights">' +
    '<div class="section-heading compact"><div><p class="eyebrow dark"><span></span> 경매 인사이트</p>' +
    '<h2>부동산 정보, 한눈에.</h2><p>썸네일을 누르면 블로그 글로 연결됩니다.</p></div>' +
    `<a href="https://blog.naver.com/${BLOG}" target="_blank" rel="noopener noreferrer">블로그 전체보기 ↗</a></div>` +
    '<div class="insights-carousel" role="region" aria-roledescription="슬라이드" aria-label="부동산 정보성 글">' +
    `<div class="insights-track" id="insights-track" tabindex="0" aria-label="정보성 글 썸네일. 좌우 방향키로 넘길 수 있습니다.">${cards}</div>` +
    '<div class="insights-toolbar"><span class="insights-hint">옆으로 넘겨 더 읽어보세요 <span aria-hidden="true">↔</span></span>' +
    '<div class="insights-controls" hidden><span class="insights-count" aria-live="off"></span>' +
    '<button type="button" class="insights-pause" aria-label="자동 넘김 정지" aria-controls="insights-track"><span aria-hidden="true">Ⅱ</span></button>' +
    '<button type="button" class="insights-prev" aria-label="이전 글 보기" aria-controls="insights-track"><span aria-hidden="true">←</span></button>' +
    '<button type="button" class="insights-next" aria-label="다음 글 보기" aria-controls="insights-track"><span aria-hidden="true">→</span></button>' +
    '</div></div></div></section>';
}

export function patchInsights(html, posts) {
  const section = /<section\b[^>]*\bid="insights"[^>]*>[\s\S]*?<\/section>/;
  if (!section.test(html)) throw new Error('경매 인사이트 영역을 찾지 못했습니다.');
  return html.replace(section, () => renderInsights(posts));
}

export async function main({fetcher = fetch, root = ROOT} = {}) {
  async function get(url) {
    const response = await fetcher(url, {headers:{'User-Agent':UA}, signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response;
  }
  const posts = selectPosts(await (await get(`https://rss.blog.naver.com/${BLOG}.xml`)).text());
  if (!posts.length) throw new Error('정보성 글이 없어 기존 슬라이드를 유지합니다.');
  const dir = path.join(root, 'assets/insights');
  await mkdir(dir, {recursive:true});
  const rows = [];
  for (const post of posts) {
    const image = `assets/insights/${post.id}.webp`;
    const imagePath = path.join(root, image);
    if (!existsSync(imagePath)) {
      const html = await (await get(`https://m.blog.naver.com/${BLOG}/${post.id}`)).text();
      const bytes = Buffer.from(await (await get(thumbnailUrl(html))).arrayBuffer());
      // Contain preserves all thumbnail text; no cropped headlines or faces.
      await sharp(bytes).resize(720, 720, {fit:'contain', background:'#171512'}).webp({quality:86}).toFile(imagePath);
    }
    rows.push({id:post.id, blogId:BLOG, title:post.title, category:post.category, link:post.link, publishedAt:post.pubDate, image});
  }
  // Write only after every selected thumbnail is ready. Failed fetches preserve
  // the last published carousel instead of replacing it with empty cards.
  const file = path.join(root, 'index.html');
  const next = patchInsights(await readFile(file, 'utf8'), rows);
  await mkdir(path.join(root, 'data'), {recursive:true});
  await writeFile(path.join(root, 'data/insights.json'), JSON.stringify(rows, null, 2)+'\n');
  await writeFile(file, next);
  const used = new Set(rows.map((p) => `${p.id}.webp`));
  for (const name of await readdir(dir)) {
    if (/^\d+\.webp$/.test(name) && !used.has(name)) await unlink(path.join(dir, name));
  }
  console.log(`경매 인사이트: ${BLOG} 정보성 글 ${rows.length}개 갱신`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
