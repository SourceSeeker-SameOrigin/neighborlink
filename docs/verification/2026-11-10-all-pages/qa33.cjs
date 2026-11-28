// Isolated pagination/operation-gate regression, no network or real records.
const fs=require('fs'),assert=require('assert');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const communities=Array.from({length:101},(_,i)=>({_id:'c'+i,name:'合成'+i}));
const providers=Array.from({length:21},(_,i)=>({_id:'p'+i}));
const merchants=Array.from({length:21},(_,i)=>({_id:'m'+i}));
const results=[];
async function test(name,run){try{await run();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
function setup(name,control={}){
 const r=runtime(async(fn,action,data={})=>{
  const all=action==='listCommunities'?communities:action==='listProviders'?providers:action==='adminList'?merchants:null;
  if(all){const offset=data.offset||0,size=action==='listCommunities'?100:20;
   if(control.fail && offset>0 && (!control.action || control.action===action))throw Error('合成第二页失败');
   if(control.pause && offset>0)await control.pause;
   return {list:all.slice(offset,offset+size),hasMore:offset+size<all.length};}
  if(action==='getFeatures')return {communityId:data.communityId,global:{},community:{}};
  if(action==='getCommunity')return {_id:data.communityId,buildings:[]};
  if(action==='dashboard')return {serviceFeeTurnover:0,actualIncome:0,refundTotal:0,complaintRate:0,acceptRate15m:0,extensions:{},orders:{}};
  if(action==='listSettlements')return {list:[]};
  if(action==='notificationTemplates')return{};
  throw Error('意外业务调用 '+action);
 });r.app.globalData.user={_id:'fixture',roles:['admin'],communityId:'c100'};
 return {r,p:r.instance(`miniprogram/admin/${name}/${name}.js`)};
}
async function dependencyActions(name,p){
 const e={detail:{value:0},currentTarget:{dataset:{field:'communityIndex',scope:'global',key:'location',type:'provider',id:'fake'}}};
 const methods={dashboard:['chooseCommunity','chooseDate','chooseScope'],features:['choose','scope','toggle'],recycle:['select','openExports'],posters:['generate'],settlements:['select','preview','create','markPaid','exportCsv']};
 for(const method of methods[name])await p[method](e);
}
(async()=>{
 for(const name of ['dashboard','features','recycle','posters','settlements']){
  await test(name+'：完整加载101小区，相关对象21条及原审核筛选',async()=>{
   const {r,p}=setup(name);await p.load();assert.equal(p.data.ready,true);assert.equal(p.data.communities.length,101);
   assert(p.data.communities.some(x=>x._id==='c100'));
   assert.deepEqual(r.requests.filter(x=>x[1]==='listCommunities').map(x=>x[2].offset),[0,100]);
   if(['dashboard','features','recycle'].includes(name))assert.equal(p.data.communities[p.data.communityIndex]._id,'c100');
   if(['posters','settlements'].includes(name))assert.equal(p.data.providers.length,21);
   if(name==='settlements')assert.equal(p.data.merchants.length,21);
   assert(r.requests.filter(x=>['listProviders','adminList'].includes(x[1])).every(x=>x[2].status==='approved'));
  });
  await test(name+'：第二页失败禁止依赖操作，重试读齐后恢复',async()=>{
   const control={fail:true};const {r,p}=setup(name,control);await p.load();await new Promise(setImmediate);
   assert.equal(p.data.ready,false);assert.equal(p.data.error,'合成第二页失败');
   const count=r.requests.length;await dependencyActions(name,p);assert.equal(r.requests.length,count);
   control.fail=false;await p.load();assert.equal(p.data.ready,true);assert.equal(p.data.communities.length,101);assert.equal(p.data.error,'');
  });
  await test(name+'：加载未结束时依赖操作不发请求',async()=>{
   let resolve;const control={pause:new Promise(r=>resolve=r)};const {r,p}=setup(name,control);const load=p.load();
   await new Promise(setImmediate);const count=r.requests.length;await dependencyActions(name,p);assert.equal(r.requests.length,count);
   resolve();await load;assert.equal(p.data.ready,true);
  });
 }
 for(const action of ['listProviders','adminList'])await test('结算对象'+action+'第二页失败不得用不完整选项提交',async()=>{
  const control={fail:true,action};const {r,p}=setup('settlements',control);await p.load();await new Promise(setImmediate);
  assert.equal(p.data.ready,false);const count=r.requests.length;await dependencyActions('settlements',p);assert.equal(r.requests.length,count);
  control.fail=false;await p.load();assert.equal(p.data.ready,true);assert.equal(p.data.providers.length,21);assert.equal(p.data.merchants.length,21);
 });
 for(const [name,page] of [['空页仍有后续',{list:[],hasMore:true}],['缺少列表',{hasMore:false}],['重复记录',{list:[{_id:'x'},{_id:'x'}],hasMore:true}],['记录缺ID',{list:[{}],hasMore:false}]]){
  await test('异常分页：'+name,async()=>{const r=runtime(async()=>page);await assert.rejects(r.load('miniprogram/utils/list-all.js')('catalog','listCommunities'),/分页异常|缺失或重复/);assert.equal(r.requests.length,1);});
 }
 await test('空列表正常返回且只读取一次',async()=>{const r=runtime(async()=>({list:[],hasMore:false}));const result=await r.load('miniprogram/utils/list-all.js')('catalog','listCommunities');assert.equal(result.length,0);assert.equal(r.requests.length,1);});
 await test('后续页重复记录停止，避免无限循环',async()=>{const r=runtime(async()=>({list:[{_id:'same'}],hasMore:true}));await assert.rejects(r.load('miniprogram/utils/list-all.js')('admin','listProviders'),/重复/);assert.equal(r.requests.length,2);});
 await test('物业结算仍限本区，不拉取管理员选择器',async()=>{const {r,p}=setup('settlements');r.app.globalData.user.roles=['property'];await p.load();assert.equal(p.data.ready,true);assert.equal(p.data.isAdmin,false);assert.equal(p.data.communities[0]._id,'c100');assert(!r.requests.some(x=>['listCommunities','listProviders','adminList'].includes(x[1])));});
 const report={scope:'Isolated VM only; no real large dataset, cloud writes or payment',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};
 fs.writeFileSync(__dirname+'/qa33.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.total!==report.passed)process.exitCode=1;
})();
