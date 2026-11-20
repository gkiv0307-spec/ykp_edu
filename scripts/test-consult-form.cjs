const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/consult-form.js'),'utf8');
async function run(response,expected,search='',selection=null,expectedCourse=null) {
 const status={textContent:'',innerHTML:'',className:''}, submit={disabled:false};
 const field=(value='')=>({value,checked:true,disabled:false,classList:{toggle(){}},setAttribute(){},addEventListener(){},focus(){}});
 const els={'f-name':field('시스템테스트'),'f-phone':field('01000000000'),'f-agree':field(),'f-date':field(),'f-time':field(),'f-interest':{...field(),options:[{value:'경매 수강 문의'}]},'f-msg':field()};
 const syntheticNotify=Boolean(search);
 const crumbs={textContent:''}, consultHeading={hidden:false}, notifyHeading={hidden:true};
 const consultFields=[els['f-interest'],els['f-msg'],els['f-date'],els['f-time']];
 const consultOnly={hidden:false,querySelectorAll:()=>consultFields}, notifyOnly={hidden:true};
 if(syntheticNotify) {
   els['f-notify-course']={...field(),disabled:true};
   els['apply-crumb']=crumbs; els['consult-heading']=consultHeading; els['notify-heading']=notifyHeading;
 }
 let handler, outgoing, attempts=0;
 const form={querySelector(s){return s==='.apply-status'?status:s==='.apply-submit'?submit:els[s.slice(1)]||null},querySelectorAll(s){return s==='[data-consult-only]'?[consultOnly]:s==='[data-notify-only]'?[notifyOnly]:Object.values(els)},addEventListener(t,f){if(t==='submit')handler=f}};
 const document={getElementById(id){return id==='consult-form'?form:els[id]||null}};
 const ctx={document,location:{search},window:{},URLSearchParams,Date,FormData:class {forEach(fn){fn('시스템테스트','이름');fn('01000000000','연락처')}},setTimeout:()=>1,clearTimeout(){},fetch:async(_endpoint, opts)=>{attempts++;outgoing=JSON.parse(opts.body);if(response instanceof Error)throw response;return response}};
 vm.runInNewContext(source,ctx);
 if(syntheticNotify) {
   assert.equal(consultHeading.hidden,true);
   assert.equal(notifyHeading.hidden,false);
   assert.equal(consultOnly.hidden,true);
   assert.equal(notifyOnly.hidden,false);
   assert.equal(consultFields.every(f=>f.disabled),true);
   assert.equal(crumbs.textContent,'다음 기수 알림 신청');
   const expectedSlug=new URLSearchParams(search).get('course');
   assert.equal(els['f-notify-course'].value,['beginner','intermediate'].includes(expectedSlug)?expectedSlug:'');
   assert.equal(els['f-notify-course'].required,true);
   if(selection!==null) els['f-notify-course'].value=selection;
 }
 handler({preventDefault(){}});
 if(syntheticNotify&&!expectedCourse) {
   assert.equal(attempts,0,'no submission without an allowlisted course');
   return;
 }
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(status.className==='apply-status is-ok',expected);
 if (syntheticNotify) {
   assert.equal(attempts,1);
   assert.equal(outgoing['관심분야'],'다음 기수 알림 신청 — '+expectedCourse);
   assert.match(outgoing['문의내용'],new RegExp(expectedCourse));
   assert.match(status.textContent,/수강 등록은 별도/);
 }
 assert.equal(els['f-name'].disabled,true,'uncertain submissions must stay locked to avoid duplicates');
 return status.className;
}
(async()=>{
 await run({ok:true,json:async()=>({ok:true})},true);
 await run({ok:true,json:async()=>({ok:false})},false);
 await run({ok:false,json:async()=>({ok:true})},false);
 await run({ok:true,json:async()=>{throw new Error('invalid json')}},false);
 await run(new Error('network'),false);
 const success={ok:true,json:async()=>({ok:true})};
 await run(success,true,'?notify=next-cohort&course=beginner',null,'초급반');
 await run(success,true,'?notify=next-cohort&course=intermediate',null,'중급반');
 await run(success,true,'?notify=next-cohort','intermediate','중급반');
 await run(success,false,'?notify=next-cohort');
 await run(success,false,'?notify=next-cohort&course=constructor');
 console.log('PASS: next-cohort generic selection, course preselection, allowlist and payload.');
 console.log('PASS: confirmed success, rejected response, HTTP failure, invalid JSON and network failure. No external request sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
