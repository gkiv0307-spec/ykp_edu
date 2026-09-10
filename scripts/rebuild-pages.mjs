/**
 * 블로그를 다시 읽지 않고, 저장해 둔 data/listings.json 으로
 * 물건 상세 페이지와 sitemap 만 다시 만든다.
 *
 * 페이지 디자인이나 문구를 고칠 때 쓴다.
 * (물건 내용까지 새로 받아오려면 update-listings.mjs 를 돌린다.)
 *
 *   node scripts/rebuild-pages.mjs
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildListingPages } from './build-listing-pages.mjs';
import { buildSitemap } from './build-sitemap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = await readFile(path.join(ROOT, 'data', 'listings.json'), 'utf8');
const listings = JSON.parse(raw).map((l) => ({
  ...l,
  saleDate: l.saleDate ? new Date(l.saleDate) : null,
}));

const pages = await buildListingPages(ROOT, listings);
console.log(`· 물건 상세 페이지 ${pages.length}장 생성`);

const n = await buildSitemap(ROOT);
console.log(`· sitemap.xml 갱신 (${n}개 주소)`);
