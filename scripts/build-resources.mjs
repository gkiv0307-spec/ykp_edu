import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {renderPage} from './lib/shell.mjs';

export async function buildResources(root,shell) {
 const groups = [
  ['1. 물건을 정확히 구분하기',['법원, 사건번호, 물건번호, 동·호수를 함께 기록합니다.','법원 원문에서 최신 매각기일과 변경·취하 여부를 확인합니다.','블로그의 게시일과 실제 매각기일을 구분합니다.']],
  ['2. 권리와 점유 확인하기',['매각물건명세서, 현황조사서, 감정평가서와 등기사항증명서를 대조합니다.','임차인·점유자 현황과 인수 가능성이 있는 권리를 정리합니다.','판단이 어려운 권리관계는 관련 전문가에게 확인합니다.']],
  ['3. 현장에서 확인하기',['주변 실거래와 현재 매물을 함께 비교합니다.','접근성·주변 환경·건물 상태·수리 필요사항을 기록합니다.','관리비 등 미납금과 점유 상태는 확인 자료·확인일을 함께 남깁니다.']],
  ['4. 자금과 입찰 상한 정하기',['입찰가 외에 세금·수리·점유 해결·보유 비용과 예비비를 나누어 계산합니다.','대출 가능 여부·금액·조건을 금융기관에 확인하고, 부족할 때의 계획을 세웁니다.','근거를 기록한 입찰 상한을 정하고 현장 분위기 때문에 올리지 않습니다.']],
  ['5. 입찰 서류 점검하기',['해당 법원이 안내하는 제출서류, 입찰보증금, 납부 방식과 마감 시각을 확인합니다.','입찰표의 사건번호·물건번호·금액·명의를 다시 대조합니다.','대리 입찰이면 위임과 대리 요건을 별도로 확인합니다.']],
  ['6. 결과를 기록하기',['매각기일이 지났다는 이유만으로 낙찰되었다고 판단하지 않습니다.','법원 확인 결과, 나의 입찰가와 판단 근거를 기록합니다.','패찰했더라도 무리하지 않은 선택이었는지 복기합니다.']]
 ];
 const title='대구 아파트 첫 입찰 체크리스트';
 const text=[title,'옆커폰부동산에듀 | 교육용 점검 자료 | 2026-09-15','',...groups.flatMap(([h,items])=>[h,...items.map(x=>'[ ] '+x),'']),'이 자료는 개별 물건의 권리분석이나 투자 판단을 대신하지 않습니다. 최신 법원 자료와 전문가 확인을 바탕으로 본인이 최종 판단하세요.','053-281-0759 | https://xn--289av8kwmfs4dv2e.store/'].join('\n');
 await mkdir(path.join(root,'downloads'),{recursive:true});
 await writeFile(path.join(root,'downloads/first-bid-checklist.txt'),text,'utf8');
 const content='<article class="course-page checklist-page"><header class="cp-head"><p class="eyebrow dark">무료 교육자료</p><h1>'+title+'</h1><p class="cp-sub">입찰 전에 자료와 판단 근거를 하나씩 확인하세요.</p></header>'
  +'<p><a class="button button-primary" href="/downloads/first-bid-checklist.txt" download>체크리스트 다운로드</a></p>'
  +groups.map(([h,items])=>'<section class="cp-support"><h2>'+h+'</h2><ul>'+items.map(x=>'<li>'+x+'</li>').join('')+'</ul></section>').join('')
  +'<section class="cp-support"><p>개별 물건의 권리분석이나 투자 판단을 대신하는 자료가 아닙니다. 최신 법원 자료와 전문가 확인을 바탕으로 본인이 최종 판단하세요. 낙찰과 수익은 보장되지 않습니다.</p></section>'
  +'<section class="cp-cta"><h2>첫 입찰을 함께 준비하고 싶다면</h2><a class="button button-primary" href="/courses/beginner.html">첫 입찰 준비반 보기</a></section></article>';
 await writeFile(path.join(root,'checklist.html'),renderPage({shell,title:title+' | 옆커폰부동산에듀',description:'물건 식별·권리·현장·자금·입찰서류·결과복기를 위한 무료 교육용 체크리스트.',canonical:'https://xn--289av8kwmfs4dv2e.store/checklist.html',image:'https://xn--289av8kwmfs4dv2e.store/assets/ykphone-logo-horizontal.png',bodyClass:'page-course',content}),'utf8');
}
