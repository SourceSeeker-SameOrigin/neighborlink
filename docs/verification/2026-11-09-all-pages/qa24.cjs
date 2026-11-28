const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const results=[];
(async()=>{
 for(const route of ['pet/order','elder/meal']){
  let fail=false,pricing=null;const r=runtime(async()=>{if(fail)throw Error('合成报价失败');return {pricing,onDutyCount:1,slots:[],hasTrashMembership:false};});
  const p=r.instance('miniprogram/'+route+'.js');p.data.community={_id:'fixture-community',canteens:[{id:'fixture-canteen'}]};
  const xml=fs.readFileSync('miniprogram/'+route+'.wxml','utf8');const disabled=xml.match(/<price-bar[^>]*disabled="\{\{(.*?)\}\}"/)[1];const isDisabled=()=>!!vm.runInNewContext(disabled,{...p.data});
  const cfg=JSON.parse(fs.readFileSync('miniprogram/'+route+'.json'));assert(cfg.usingComponents['price-bar']);assert(cfg.usingComponents['empty-state']);assert(cfg.usingComponents['privacy-popup']);
  await p.refreshQuote();assert.equal(p.data.amount,'--');assert(isDisabled());
  pricing={payAmount:500,goodsCap:1000};await p.refreshQuote();assert.equal(p.data.amount,'15.00');assert(!isDisabled());
  fail=true;await p.refreshQuote();assert.equal(p.data.amount,'--');assert(isDisabled());
  results.push({route,status:'PASS',checks:'注册/无报价禁用/有效合成报价金额/失败恢复禁用'});
 }
 let definition;vm.runInNewContext(fs.readFileSync('miniprogram/components/price-bar/index.js','utf8'),{Component:d=>definition=d});
 let count=0;const c={data:{disabled:true,loading:false},triggerEvent:()=>count++};definition.methods.submit.call(c);assert.equal(count,0);c.data.disabled=false;c.data.loading=true;definition.methods.submit.call(c);assert.equal(count,0);c.data.loading=false;definition.methods.submit.call(c);assert.equal(count,1);
 results.push({route:'components/price-bar/index',status:'PASS',checks:'禁用/忙碌不触发提交，就绪仅触发一次'});
 const report={scope:'隔离页面报价和真实组件方法，非真实下单',results};fs.writeFileSync(__dirname+'/qa24.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
