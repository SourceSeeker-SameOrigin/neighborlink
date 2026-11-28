// Actual page, synthetic identities/orders; all API writes intercepted.
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const results=[];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
function fixture(action='start'){
 const order={_id:'synthetic-order-a',status:action==='start'?'accepted':'in_service',featureEnabled:true,canShareLocation:false,serviceCode:'trash',detail:{},pricing:{},slot:{}};
 let read=async()=>JSON.parse(JSON.stringify(order)),write=async()=>({});
 const env=runtime(async(n,a,d,o)=>a==='detail'?read():write(d,o),{media:{}});
 env.app.globalData.user={_id:'synthetic-provider-a',roles:['provider']};
 const page=env.instance('miniprogram/provider/task/task.js');page.onLoad({id:order._id});
 return{env,page,order,read:f=>read=f,write:f=>write=f,
  writes:()=>env.requests.filter(x=>x[1]===action),act:()=>page.act({currentTarget:{dataset:{action}}})};
}
async function boundary(f,b){
 if(b==='read-failed'){f.read(async()=>{throw Error('读取被拒');});await f.page.load();}
 if(b==='changed-user')f.env.app.globalData.user={_id:'synthetic-provider-b'};
 if(b==='changed-order')f.page.orderId='synthetic-order-b';
 if(b==='hidden')f.page.onHide();if(b==='unloaded')f.page.onUnload();
 if(b==='refreshed')await f.page.load();
 if(b==='returned'){f.page.onHide();await f.page.onShow();}
 if(b==='completed')f.page.data.order.status='done';
 if(b==='disabled')f.page.data.order.featureEnabled=false;
 if(b==='loading')f.page.data.loading=true;
}
(async()=>{
 for(const action of ['start','deliver']){
  for(const b of ['ready','read-failed','changed-user','changed-order','hidden','unloaded','completed','disabled','loading'])await test(action+'-guard-'+b,async()=>{
   const f=fixture(action);await f.page.onShow();await boundary(f,b);await f.act();assert.equal(f.writes().length,b==='ready'?1:0);
   if(['read-failed','hidden','unloaded'].includes(b)){assert.equal(f.page.data.order,null);assert.equal(f.page.data.taskReady,false);}
  });
  for(const outcome of ['success','failure'])for(const b of ['ready','changed-user','changed-order','hidden','unloaded','refreshed','returned','completed','disabled'])await test(action+'-sent-'+outcome+'-'+b,async()=>{
   const f=fixture(action),wait=deferred();f.write(()=>wait.promise);await f.page.onShow();const op=f.act();await flush();assert.equal(f.writes().length,1);
   await boundary(f,b);const snapshot=JSON.stringify(f.page.data),reads=f.env.requests.filter(x=>x[1]==='detail').length;
   outcome==='success'?wait.resolve({}):wait.reject(Error('操作失败'));await op;
   if(b!=='ready'){const expected=JSON.parse(snapshot);
    // The same read/context still owns its busy flag when only status/feature changes.
    if(['completed','disabled'].includes(b))expected.busy=false;
    assert.equal(JSON.stringify(f.page.data),JSON.stringify(expected));assert.equal(f.env.requests.filter(x=>x[1]==='detail').length,reads);}
   else{assert.equal(f.page.data.busy,false);assert.equal(f.page.data.error,outcome==='failure'?'操作失败':'');assert.equal(f.env.requests.filter(x=>x[1]==='detail').length,reads+(outcome==='success'?1:0));}
   assert.equal(f.writes()[0][2].orderId,'synthetic-order-a');assert.equal(f.env.navigation.length,0);
   assert.equal(f.writes()[0][3].redirectOnForbidden,false);assert.equal(f.writes()[0][3].silent,true);
  });
  await test(action+'-duplicate-and-new-operation-lock',async()=>{
   const f=fixture(action),old=deferred(),next=deferred();let count=0;f.write(()=>++count===1?old.promise:next.promise);
   await f.page.onShow();const first=f.act();await f.act();assert.equal(f.writes().length,1);
   await f.page.load();const second=f.act();assert.equal(f.writes().length,2);old.resolve({});await first;assert.equal(f.page.data.busy,true);
   next.reject(Error('可重试失败'));await second;assert.equal(f.page.data.busy,false);assert.equal(f.page.data.error,'可重试失败');
   f.write(async()=>({}));await f.act();assert.equal(f.writes().length,3);assert.equal(f.page.data.busy,false);
  });
  for(const b of ['ready','hidden','changed-user'])await test(action+'-actual-api-forbidden-'+b,async()=>{
   const f=fixture(action),wait=deferred(),effects=[],module={exports:{}};
   vm.runInNewContext(fs.readFileSync('miniprogram/utils/api.js','utf8'),{module,wx:{cloud:{callFunction:()=>wait.promise},showToast:()=>effects.push('toast'),switchTab:()=>effects.push('redirect')}});
   f.write((d,o)=>module.exports.call('provider',action,d,o));await f.page.onShow();const op=f.act();await boundary(f,b);
   wait.resolve({result:{ok:false,code:'E_FORBIDDEN',message:'拒绝操作'}});await op;assert.deepEqual(effects,[]);assert.equal(f.page.data.error,b==='ready'?'拒绝操作':'');
  });
 }
 for(const outcome of ['success','failure'])for(const b of ['hidden','unloaded','changed-user','changed-order','refreshed'])await test('read-'+outcome+'-'+b,async()=>{
  const f=fixture(),wait=deferred();await f.page.onShow();f.read(()=>wait.promise);const op=f.page.load();await flush();assert.equal(f.page.data.order,null);
  if(b==='refreshed')f.read(async()=>({...f.order,note:'最新任务'}));await boundary(f,b);const snapshot=JSON.stringify(f.page.data);
  outcome==='success'?wait.resolve({...f.order,note:'过期任务'}):wait.reject(Error('旧读取失败'));await op;assert.equal(JSON.stringify(f.page.data),snapshot);
 });
 for(const b of ['same','changed-user','changed-order'])await test('draft-'+b,async()=>{
  const f=fixture('deliver');f.order.serviceCode='recycle';f.order.detail={categories:['paper']};await f.page.onShow();
  f.page.setData({photos:['synthetic-file'],receiptPhoto:'synthetic-receipt',goodsYuan:'3',weightsTenths:{paper:12},visitNotes:'合成说明',photoByItem:{windows:['synthetic-window']}});
  f.page.onHide();await boundary(f,b);await f.page.onShow();
  assert.equal(f.page.data.photos.length,b==='same'?1:0);assert.equal(f.page.data.visitNotes,b==='same'?'合成说明':'');
  assert.equal(f.page.data.recycleRows[0].value,b==='same'?'1.2':'');assert.equal(Object.keys(f.page.data.photoByItem).length,b==='same'?1:0);
 });
 await test('read-failure-retry-no-write',async()=>{
  const f=fixture();await f.page.onShow();f.read(async()=>{throw Error('读取失败');});await f.page.load();assert.equal(f.page.data.order,null);assert.equal(f.page.data.loading,false);
  f.read(async()=>f.order);await f.page.load();assert.equal(f.page.data.taskReady,true);assert.equal(f.page.data.error,'');assert.equal(f.writes().length,0);
 });
 await test('missing-identity-no-detail',async()=>{
  const f=fixture();f.env.app.globalData.user=null;await f.page.onShow();assert.equal(f.env.requests.length,0);assert.equal(f.page.data.taskReady,false);assert.equal(f.page.data.loading,false);assert(f.page.data.error);
 });
 for(const service of ['trash','parcel','buy','help','meal','escort','visit','recycle'])await test('deliver-payload-'+service,async()=>{
  const f=fixture('deliver');f.order.serviceCode=service;f.order.detail={categories:['paper']};await f.page.onShow();
  f.page.setData({photos:['synthetic-proof'],receiptPhoto:'synthetic-receipt',goodsYuan:'2.50',weightsTenths:{paper:12},visitNotes:'合成探访',visitAttention:true,attentionCallConfirmed:true});
  await f.act();const data=f.writes()[0][2];assert.equal(data.orderId,'synthetic-order-a');
  if(service==='recycle')assert.equal(data.weightsTenths.paper,12);else {assert.equal(data.photos[0],'synthetic-proof');assert.equal(data.goodsActual,250);}
  if(service==='visit'){assert.equal(data.visitReport.notes,'合成探访');assert.equal(data.visitReport.attentionCallConfirmed,true);}
 });
 await test('vacant-uses-separate-report',async()=>{const f=fixture('deliver');f.order.serviceCode='vacant';await f.page.onShow();await f.act();assert.equal(f.writes().length,0);});
 await test('cleared-task-phone-handler-safe',async()=>{const f=fixture();await f.page.onShow();f.page.onHide();assert.doesNotThrow(()=>f.page.callResident());});
 await test('cleared-task-phone-callback-safe',async()=>{const f=fixture();f.order.serviceCode='visit';f.order.canCallResident=true;f.order.userPhone='synthetic-phone';await f.page.onShow();let callback;f.env.wx.makePhoneCall=o=>callback=o.success;f.page.callResident();f.page.onHide();assert.doesNotThrow(()=>callback());assert.equal(f.page.data.attentionCallConfirmed,false);});
 console.log(JSON.stringify({scope:'actual task page and API client, synthetic responses only; no cloud writes',pass:results.filter(x=>x.pass).length,fail:results.filter(x=>!x.pass).length,results},null,2));
 if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
