import assert from 'node:assert/strict';
import {selectPosts,thumbnailUrl,patchInsights,main} from './update-insights.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const item=(id,category,date='Thu, 08 Oct 2026 10:00:00 +0900')=>`<item><title><![CDATA[정보 <제목> & 읽기]]></title><category>${category}</category><link>https://blog.naver.com/hjko0/${id}?fromRss=true</link><pubDate>${date}</pubDate></item>`;
const xml='<rss>'+item(1,'공지/안내')+item(2,'강의소개/커리큘럼')+item(3,'부동산 투자뉴스')+item(3,'부동산 투자뉴스')+item(4,'경매지식정보','Thu, 08 Oct 2026 15:00:00 +0900')+'</rss>';
const posts=selectPosts(xml);
assert.deepEqual(posts.map(x=>x.id),['4','3']);
assert(posts.every(x=>x.link===`https://blog.naver.com/hjko0/${x.id}`));
assert.equal(thumbnailUrl('<meta content="https://blogthumb.pstatic.net/a.png?a=1&amp;b=2" property="og:image">'),'https://blogthumb.pstatic.net/a.png?a=1&b=2');
assert.throws(()=>thumbnailUrl('<meta property="og:image" content="https://example.com/a">'));
const original='<header>원본</header><section id="insights">old</section><footer>그대로</footer>';
const rendered=patchInsights(original,posts.map(x=>({...x,image:`assets/insights/${x.id}.webp`})));
assert(rendered.startsWith('<header>원본</header>')&&rendered.endsWith('<footer>그대로</footer>'));
assert(rendered.includes('&lt;제목&gt; &amp; 읽기'));
assert(!rendered.includes('<제목>'));
assert.equal((rendered.match(/class="insight-slide"/g)||[]).length,2);
const temp=await mkdtemp(path.join(tmpdir(),'insights-test-'));
try {
  await writeFile(path.join(temp,'index.html'),original);
  await assert.rejects(main({root:temp,fetcher:async()=>new Response('<rss/>')}), /기존 슬라이드/);
  assert.equal(await readFile(path.join(temp,'index.html'),'utf8'),original);
  await assert.rejects(main({root:temp,fetcher:async(url)=>new Response(url.includes('rss.')?xml:'unavailable',{status:url.includes('rss.')?200:503})}),/HTTP 503/);
  assert.equal(await readFile(path.join(temp,'index.html'),'utf8'),original);
} finally {
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(tmpdir()));
  assert(path.basename(temp).startsWith('insights-test-'));
  await rm(temp,{recursive:true,force:true});
}
console.log('PASS: information categories, latest order, dedupe, article links, safe thumbnails, HTML escaping, failed feeds preserve section');
