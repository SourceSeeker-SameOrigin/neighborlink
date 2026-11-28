// Actual provider task page with synthetic confirmation and intercepted API writes.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject}; };
function fixture(){
 let read=async()=>({status:'accepted',canShareLocation:false,serviceCode:'trash',detail:{},pricing:{},slot:{}}),write=async()=>({});
 const env=runtime(async(n,a,d,o)=>a==='detail'?read():write(d,o),{media:{}});
 env.app.globalData.user={_id:'synthetic-provider-a',roles:['provider']};
 const modals=[];env.wx.showModal=o=>modals.push(o);
 const page=env.instance('miniprogram/provider/task/task.js');page.onLoad({id:'synthetic-order-a'});
 return{env,page,modals,read:f=>{read=f;},write:f=>{write=f;},writes:()=>env.requests.filter(x=>x[1]==='release'),act:()=>page.act({currentTarget:{dataset:{action:'release'}}})};
}
async function boundary(f,b){
 if(b==='hidden')f.page.onHide();
 if(b==='unload')f.page.onUnload();
 if(b==='user-changed')f.env.app.globalData.user={_id:'synthetic-provider-b',roles:['provider']};
 if(b==='order-changed')f.page.orderId='synthetic-order-b';
 if(b==='refreshed')await f.page.load();
 if(b==='completed')f.page.data.order.status='done';
 if(b==='returned'){f.page.onHide();await f.page.onShow();}
}
async function test(name,run){try{await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
(async()=>{
 const boundaries=['same-page','cancel','hidden','unload','user-changed','order-changed','refreshed','completed','returned'];
 for(const b of boundaries)await test('confirmation-'+b,async()=>{
  const f=fixture();await f.page.onShow();const op=f.act();await flush();await boundary(f,b);
  f.modals[0].success({confirm:b!=='cancel',cancel:b==='cancel'});await op;
  assert.equal(f.writes().length,b==='same-page'?1:0);assert.equal(f.env.navigation.length,b==='same-page'?1:0);
  if(b==='same-page')assert.equal(f.writes()[0][2].orderId,'synthetic-order-a');
  await f.page.onShow();assert.equal(f.page.data.busy,false);
 });
 for(const outcome of ['success','failure'])for(const b of ['same-page','hidden','unload','user-changed','order-changed','refreshed','completed','returned'])await test('sent-'+outcome+'-'+b,async()=>{
  const f=fixture(),wait=deferred();f.write(()=>wait.promise);await f.page.onShow();const op=f.act();f.modals[0].success({confirm:true});await flush();assert.equal(f.writes().length,1);
  await boundary(f,b);const before=f.page.data.error;
  if(outcome==='success')wait.resolve({});else wait.reject(Error('synthetic release failure'));await op;
  assert.equal(f.env.navigation.length,b==='same-page'&&outcome==='success'?1:0);
  assert.equal(f.page.data.error,b==='same-page'&&outcome==='failure'?'synthetic release failure':before);
  const options=f.writes()[0][3];assert.equal(options.redirectOnForbidden,false);assert.equal(options.silent,true);assert.equal(options.loading,false);
  if(b!=='same-page')assert.equal(options.isActive(),false);
 });
 await test('duplicate-click-one-confirmation',async()=>{
  const f=fixture();await f.page.onShow();const first=f.act();await f.act();assert.equal(f.modals.length,1);f.modals[0].success({confirm:true});await first;assert.equal(f.writes().length,1);
 });
 await test('old-finally-does-not-unlock-new-operation',async()=>{
  const f=fixture(),wait=deferred();f.write(()=>wait.promise);await f.page.onShow();const old=f.act();f.modals[0].success({confirm:true});await flush();await f.page.load();const next=f.act();
  wait.resolve({});await old;assert.equal(f.page.data.busy,true);assert.equal(f.env.navigation.length,0);
  f.modals[1].success({confirm:false});await next;assert.equal(f.page.data.busy,false);
 });
 await test('modal-failure-and-retry',async()=>{
  const f=fixture();await f.page.onShow();const old=f.act();f.modals[0].fail({errMsg:'synthetic modal fail'});await old;assert.equal(f.page.data.busy,false);assert(f.page.data.error);
  const next=f.act();f.modals[1].success({confirm:true});await next;assert.equal(f.writes().length,1);
 });
 for(const b of ['loading','read-failed','hidden','completed','changed-user-before-click'])await test('start-guard-'+b,async()=>{
  const f=fixture();await f.page.onShow();
  if(b==='loading')f.page.data.loading=true;
  if(b==='read-failed'){f.read(async()=>{throw Error('read failed');});await f.page.load();}
  if(b==='hidden')f.page.onHide();if(b==='completed')f.page.data.order.status='done';
  if(b==='changed-user-before-click')f.env.app.globalData.user={_id:'synthetic-provider-b',roles:['provider']};
  await f.act();assert.equal(f.modals.length,0);assert.equal(f.writes().length,0);
 });
 for(const b of ['same-page','hidden','user-changed'])await test('real-client-forbidden-'+b,async()=>{
  const f=fixture(),wait=deferred(),effects=[];const module={exports:{}};
  const clientWx={cloud:{callFunction:()=>wait.promise},showToast:()=>effects.push('toast'),switchTab:()=>effects.push('navigation')};
  require('vm').runInNewContext(require('fs').readFileSync('miniprogram/utils/api.js','utf8'),{module,wx:clientWx});
  f.write((data,options)=>module.exports.call('provider','release',data,options));
  await f.page.onShow();const op=f.act();f.modals[0].success({confirm:true});await flush();await boundary(f,b);
  wait.resolve({result:{ok:false,code:'E_FORBIDDEN',message:'synthetic forbidden'}});await op;
  assert.deepEqual(effects,[]);assert.equal(f.env.navigation.length,0);
  assert.equal(f.page.data.error,b==='same-page'?'synthetic forbidden':'');
 });
 console.log(JSON.stringify({scope:'actual page with synthetic modal and API; no real order release',pass:results.filter(x=>x.pass).length,fail:results.filter(x=>!x.pass).length,results},null,2));
 if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
