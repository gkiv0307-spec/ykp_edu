const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/consult-form.js'),'utf8');
async function run(response,expected) {
 const status={textContent:'',innerHTML:'',className:''}, submit={disabled:false};
 const field=(value='')=>({value,checked:true,disabled:false,classList:{toggle(){}},setAttribute(){},addEventListener(){},focus(){}});
 const els={'f-name':field('시스템테스트'),'f-phone':field('01000000000'),'f-agree':field(),'f-date':field(),'f-time':field(),'f-interest':{...field(),options:[{value:'경매 수강 문의'}]},'f-msg':field()};
 let handler;
 const form={querySelector(s){return s==='.apply-status'?status:s==='.apply-submit'?submit:els[s.slice(1)]||null},querySelectorAll(){return Object.values(els)},addEventListener(t,f){if(t==='submit')handler=f}};
 const document={getElementById(id){return id==='consult-form'?form:els[id]||null}};
 const ctx={document,location:{search:''},window:{},URLSearchParams,Date,FormData:class {forEach(fn){fn('시스템테스트','이름');fn('01000000000','연락처')}},setTimeout:()=>1,clearTimeout(){},fetch:async()=>{if(response instanceof Error)throw response;return response}};
 vm.runInNewContext(source,ctx);
 handler({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(status.className==='apply-status is-ok',expected);
 assert.equal(els['f-name'].disabled,true,'uncertain submissions must stay locked to avoid duplicates');
 return status.className;
}
(async()=>{
 await run({ok:true,json:async()=>({ok:true})},true);
 await run({ok:true,json:async()=>({ok:false})},false);
 await run({ok:false,json:async()=>({ok:true})},false);
 await run({ok:true,json:async()=>{throw new Error('invalid json')}},false);
 await run(new Error('network'),false);
 console.log('PASS: confirmed success, rejected response, HTTP failure, invalid JSON and network failure. No external request sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
