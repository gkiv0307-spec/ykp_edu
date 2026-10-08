import assert from 'node:assert/strict';
import { BLOG_IDS, REGION_GROUPS, regionGroup } from './lib/listing-sources.mjs';
import { collectRss, articleText, parseTitle, parseLocation, parseDetails, buildListing, renderFilterBar, renderGrids, assignDetailSlugs } from './update-listings.mjs';
import { slugOf } from './build-listing-pages.mjs';

const fetched = [];
const rows = await collectRss(async (url) => {
  fetched.push(url);
  const id = url.match(/\/([^/]+)\.xml$/)[1];
  return `<rss><channel><item><title>대구 수성구 테스트 경매</title><link>https://blog.naver.com/${id}/123456</link><description>물건 소개</description></item></channel></rss>`;
});
assert.equal(fetched.length, 3);
assert.deepEqual(rows.map((r) => r.blogId), BLOG_IDS);
assert(rows.every((r) => r.link === `https://blog.naver.com/${r.blogId}/${r.id}`));
await assert.rejects(collectRss(async () => '<rss/>'), /RSS 글이 없어/);

assert.equal(REGION_GROUPS.flatMap((g) => g.provinces).length, 17);
assert.equal(regionGroup('제주'), '강원/제주도');
assert.equal(regionGroup('강원'), '강원/제주도');
assert.equal(regionGroup('울산'), '부산/경남권');
assert.equal(regionGroup('인천'), '서울/수도권');
assert.equal(regionGroup('세종'), '호남/충청권');
for (const {label} of REGION_GROUPS) assert(renderFilterBar().includes(`>${label}</button>`));

const html = '<div class="profile">대구 수성구 사무실</div><div class="se-main-container"><div class="map">대구 수성구 학원</div><p class="se-text-paragraph">부산 남구 테스트타운 101동 3층 301호</p><p class="se-text-paragraph">2026타경99 감정가 2억원 최저매각가격 1억 4,000만원 매각기일 2026.10.20</p></div><p class="se-text-paragraph">서울 강남구 관련글</p>';
const body = articleText(html);
assert(!/사무실|학원|관련글/.test(body));
assert.equal(parseLocation(body).sigungu, '남구');
assert.equal(parseTitle('대구아파트경매 대곡역래미안, 같은 동 시세 비교｜2026타경2').name, '대곡역래미안');
assert.equal(parseLocation('본건은 전용 84㎡입니다. 테스트타운 전용 84㎡', '부산 테스트타운 경매').name, '테스트타운');
assert.equal(parseDetails('입찰보증금 1,400만원 2026-10-20(화) 오전 10시').saleDate.getDate(), 20);
let postUrl;
const listing = await buildListing({id:'123',blogId:'ykphone_edu',title:'부산경매아파트 남구 테스트타운',description:'',link:'https://blog.naver.com/ykphone_edu/123'}, async (url) => {postUrl=url; return html;});
assert.equal(postUrl, 'https://m.blog.naver.com/ykphone_edu/123');
assert.equal(listing.sido, '부산');
assert.equal(listing.name, '테스트타운');
assert.equal(listing.caseNo, '2026타경99');
assert.equal(listing.minBid, 140000000);
assert(renderGrids([listing], []).includes('data-region="부산/경남권"'));
assert.notEqual(slugOf({...listing,detailSlug:'2026tg99-post123'}), slugOf({...listing,detailSlug:'2026tg99-post456'}));
const duplicates = [{...listing,id:'456'}, {...listing,id:'123'}];
assignDetailSlugs(duplicates, [listing]);
assert.equal(slugOf(duplicates[1]), '2026tg99', 'existing URL must survive new same-case posts');
assert.equal(slugOf(duplicates[0]), '2026tg99-post456');
assert.equal(parseLocation('본건은 101동 301호입니다.', '테스트타운 경매').name, null);
assert.equal(parseLocation('칠곡남율효성해링턴플레이스1단지 106동 1401호', '경북 칠곡 아파트 경매 남율 효성해링턴플레이스1단지').name, '칠곡남율효성해링턴플레이스1단지');
console.log('PASS: three sources, source links, feed failure, five regions, article isolation, new post formats, unique detail links');
