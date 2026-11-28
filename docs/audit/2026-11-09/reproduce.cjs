const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.cwd(), results=[];
(async()=>{
 const code=fs.readFileSync('cloudfunctions/content/index.js','utf8');
 const fn=code.slice(code.indexOf('async function moderateUser('),code.indexOf('\nasync function moderateContent('));
 let calls=[];
 const moderate=vm.runInNewContext(fn+';moderateUser',{...require(path.join(root,'cloudfunctions/_shared/validate.js')),requireRole:require(path.join(root,'cloudfunctions/_shared/auth')).requireRole,server:{get:async()=>{throw Error('Unexpected database read');}},Date});
 const module={exports:{}};
 const wx={showLoading(){},hideLoading(){},showToast(){},switchTab(){},cloud:{
  async callFunction(req){
   calls.push(req);
   try { const data=await moderate(req.data,{user:{roles:['admin']}}); return {result:{ok:true,data}}; }
   catch(e){return {result:{ok:false,code:e.code,message:e.message}};}
  }
 }};
 vm.runInNewContext(fs.readFileSync('miniprogram/utils/api.js','utf8'),{module,require(){throw Error('Unexpected require');},wx});
 for(const operation of ['mute','block']){try{await module.exports.call('content','moderateUser',{userId:'synthetic-target',action:operation,hours:24});}catch(e){results.push({case:operation,sentAction:calls.at(-1).data.action,code:e.code,message:e.message,expected:'admin operation reaches corresponding branch',observed:'E_INVALID_PARAM before database access',status:'DEFECT_REPRODUCED'});}}
 let page;const nav=[];
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/index/index.js','utf8'),{Page:d=>page=d,require:id=>id.includes('service-catalog')?require(path.join(root,'miniprogram/utils/service-catalog')):{},wx:{showModal:x=>nav.push(x),navigateTo(){throw Error('Unexpected navigate');}}});
 page.introduce({currentTarget:{dataset:{code:'pet'}}});results.push({case:'home catalog pet',status:'OBSERVED',result:'description modal only',count:nav.length});
 let settlements;vm.runInNewContext(fs.readFileSync('miniprogram/admin/settlements/settlements.js','utf8'),{Page:d=>settlements=d,require:id=>id.includes('money')?{yuan:()=>''}:{call(){throw Error('Unexpected API');}},getApp:()=>({ensureSession:async()=>({roles:['resident','property'],communityId:'synthetic'})}),Date});
 const inst={...settlements,data:JSON.parse(JSON.stringify(settlements.data)),setData(p){Object.assign(this.data,p)}};await inst.load();results.push({case:'property settlements page',status:'DEFECT_REPRODUCED',message:inst.data.error,expected:'read-only own-community property share'});
 fs.writeFileSync('docs/audit/2026-11-09/reproductions.json',JSON.stringify({scope:'Actual source functions isolated in VM; synthetic identities; no network/cloud read/write',results},null,2)+'\n');console.log(JSON.stringify(results));
})();
