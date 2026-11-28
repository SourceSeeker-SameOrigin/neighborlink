const fs=require('fs'),assert=require('assert');
const {runtime}=require('./page-fixture.cjs');
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',message:e.message});}}
(async()=>{
await check('按次表单忽略旧草稿blocks，发送当前小区模式和分钟数',async()=>{const r=runtime(),p=r.instance('miniprogram/pages/service/help.js');p.data.community={_id:'fixture',prices:{help:{billingMode:'per_visit',perVisit:3900,includedMinutes:30}}};p.data.form.blocks='8';p.data.form.desc='合成测试';const d=p.params().detail;assert.equal(d.blocks,undefined);assert.equal(d.billingMode,'per_visit');assert.equal(d.includedMinutes,30);});
await check('切回旧计价小区保留原时长参数，不发送按次模式',async()=>{const p=runtime().instance('miniprogram/pages/service/help.js');p.data.community={_id:'legacy',prices:{help:{per15min:1000,maxBlocks:8}}};p.data.form.blocks='2';const d=p.params().detail;assert.equal(d.blocks,2);assert.equal(d.billingMode,undefined);});
await check('管理配置切换模式只移除不适用的帮把手字段，保留其他价格',async()=>{const f=runtime().load('miniprogram/admin/community/form.js');const old={help:{per15min:1000,maxBlocks:8},buy:{serviceFee:5000}};const prices=f.pricePatch(old,[{key:'help.perVisit',label:'单次价',value:'3900'},{key:'help.includedMinutes',label:'分钟',value:'30'}],'per_visit');assert.equal(prices.help.perVisit,3900);assert.equal(prices.help.per15min,undefined);assert.equal(prices.buy.serviceFee,5000);assert.equal(old.help.per15min,1000);});
await check('管理保存按次模式，再加载保留选项及整数分',async()=>{let saved;const c={_id:'c',name:'合成小区',prices:{help:{billingMode:'per_visit',perVisit:3900,includedMinutes:30}},buildings:[]};const r=runtime(async(n,a,v)=>{if(a==='managementConfig')return{community:c,communities:[c],global:{}};if(a==='updateCommunity'){saved=v;return{};}throw Error(a);});r.app.globalData.user={roles:['admin']};const p=r.instance('miniprogram/admin/community/community.js');await p.load();assert.equal(p.data.helpModeIndex,1);await p.saveCommunity();assert.equal(p.data.error,'');assert.equal(saved.prices.help.perVisit,3900);assert.equal(saved.prices.help.includedMinutes,30);assert.equal(saved.prices.help.billingMode,'per_visit');});
await check('QA06 核心卡片无url仍按服务代码导航，绑定显式路由优先',async()=>{const fs=require('fs'),vm=require('vm');let component;const nav=[];vm.runInNewContext(fs.readFileSync('miniprogram/components/service-tile/index.js','utf8'),{Component:c=>component=c,wx:{navigateTo:o=>nav.push(o.url)}});component.methods.open.call({data:{code:'help',url:''}});component.methods.open.call({data:{code:'help',url:'/pages/bind/bind'}});assert.deepEqual(nav,['/pages/service/help','/pages/bind/bind']);});
await check('D13 实际order.quote入口校验四项已批准价格和首单商品款分离（离线）',async()=>{
 const {fixture}=require('./cloud-fixture.cjs');const prices={express:{base:500,extraParcel:100,largeSurcharge:200,maxParcels:10},trash:{single:500},buy:{serviceFee:5000,goodsCapMin:1000,goodsCapMax:20000},help:{billingMode:'per_visit',perVisit:3900,includedMinutes:30},firstOrderPrice:100};
 const f=fixture({records:{users:[{_id:'u',openid:'actor',roles:['resident'],communityId:'c',buildingId:'b',unit:'合成单元',room:'合成门牌',phone:'13800000000',firstPaidAt:null}],buildings:[{_id:'b',communityId:'c',name:'合成楼栋',units:['合成单元']}],communities:[{_id:'c',status:'active',prices,stations:[{code:'north_gate',name:'北门'}],dutyWindows:[{start:'07:00',end:'00:00'}],features:{}}]}});
 for(const [serviceCode,detail,listPrice,payAmount,goodsCap] of [
 ['express',{stationCode:'north_gate',pickupCodes:['合成码1','合成码2'],largeCount:1,placement:'door'},800,100,0],
 ['trash',{bags:1,sorted:true},500,100,0],['buy',{shop:'合成商店',items:'合成清单',goodsCap:1000},5000,100,1000],
 ['help',{category:'carry',desc:'合成需求',billingMode:'per_visit',includedMinutes:30},3900,3900,0]]){
  const r=await f.call('order','quote',{communityId:'c',serviceCode,detail,metadata:true});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.data.pricing.listPrice,listPrice);assert.equal(r.data.pricing.payAmount,payAmount);assert.equal(r.data.pricing.goodsCap,goodsCap);assert(r.data.slots.length>0);
 }
 assert.equal(f.writes.length,0);
});
const report={scope:'Offline actual page handlers; synthetic data; no cloud writes',total:results.length,passed:results.filter(r=>r.status==='PASS').length,results};fs.writeFileSync('docs/verification/2026-11-09-remediation/d13-regression.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.total===report.passed?0:1;
})();
