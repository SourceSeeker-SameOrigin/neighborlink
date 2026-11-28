// Read-only isolated actual page handlers; all orders and responses are synthetic.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}; };
const tick = async () => { for(let i=0;i<5;i++) await Promise.resolve(); };
const row = id => ({_id:id,pricing:{payAmount:100,goodsCap:0},createdAt:'2026-11-12T00:00:00Z'});
async function test(name, fn) {try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}
function setup(kind, call) {const r=runtime(call);r.app.globalData.user.roles=['resident','admin'];r.p=r.instance(kind==='resident'?'miniprogram/pages/orders/list.js':'miniprogram/admin/orders/orders.js');r.key=kind==='resident'?'orders':'rows';return r;}
(async()=>{
 for(const kind of ['resident','admin']) {
  await test(kind+' newer filter wins over late prior success',async()=>{
   const a=deferred(),b=deferred();let n=0;const r=setup(kind,()=>++n===1?a.promise:b.promise);const x=r.p.load(true);await tick();const y=r.p.load(true);await tick();b.resolve({list:[row('new')],hasMore:false});await y;a.resolve({list:[row('old')],hasMore:true});await x;assert.equal(r.p.data[r.key][0]._id,'new');assert.equal(r.p.data.hasMore,false);
  });
  await test(kind+' filter failure clears old group rows',async()=>{const r=setup(kind,async()=>{throw Error('synthetic failure')});r.p.data[r.key]=[row('old')];await r.p.load(true);assert.equal(r.p.data[r.key].length,0);assert.equal(r.p.data.error,'synthetic failure');assert.equal(r.p.data.loading,false)});
  await test(kind+' failed next page preserves rows and offset on retry',async()=>{let fail=true;const r=setup(kind,async()=>{if(fail)throw Error('next page failed');return {list:[row('next')],hasMore:false}});r.p.data[r.key]=[row('first')];await r.p.load(false);assert.equal(r.p.data[r.key][0]._id,'first');fail=false;await r.p.load(false);assert.equal(r.requests[0][2].offset,1);assert.equal(r.requests[1][2].offset,1);assert.deepEqual(Array.from(r.p.data[r.key],x=>x._id),['first','next'])});
  for(const hook of ['onHide','onUnload'])await test(kind+' late list success after '+hook+' has no page writes',async()=>{const d=deferred(),r=setup(kind,()=>d.promise);const x=r.p.load(true);await tick();if(r.p[hook])r.p[hook]();let writes=0;const old=r.p.setData;r.p.setData=function(v){writes++;old.call(this,v)};d.resolve({list:[row('late')],hasMore:false});await x;assert.equal(writes,0,'late page writes: '+writes)});
 }
 await test('resident unread newer response wins',async()=>{const a=deferred(),b=deferred();let n=0,badge;const r=setup('resident',()=>++n===1?a.promise:b.promise);r.wx.setTabBarBadge=o=>badge=o.text;r.wx.removeTabBarBadge=()=>badge='';const x=r.p.refreshUnread(),y=r.p.refreshUnread();b.resolve({unreadTotal:7});await y;a.resolve({unreadTotal:1});await x;assert.equal(badge,'7','older response replaced badge with '+badge)});
 for(const hook of ['onHide','onUnload'])await test('resident unread after '+hook+' has no tab changes',async()=>{const d=deferred(),r=setup('resident',()=>d.promise);let updates=0;r.wx.setTabBarBadge=()=>updates++;r.wx.removeTabBarBadge=()=>updates++;const p=r.p.refreshUnread();if(r.p[hook])r.p[hook]();d.resolve({unreadTotal:4});await p;assert.equal(updates,0,'late badge changes: '+updates)});
 const report={source:'07da819',scope:'Synthetic isolated actual page methods; no real cloud reads/writes or UI acceptance',passed:results.filter(x=>x.passed).length,total:results.length,results};console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
})();
