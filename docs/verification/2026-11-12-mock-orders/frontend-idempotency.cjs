// Actual service-form code, synthetic API/navigation only; no cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const cases = [];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function check(name, fn) { try { await fn(); cases.push({ name, passed: true }); } catch (e) { cases.push({ name, passed: false, error: e.message }); } }
function setup(code, call, pay = async () => false) {
  const r = runtime(call, { payment: { pay } }); r.wx.setStorageSync = (k,v) => { r.store[k] = structuredClone(v); };
  r.app.globalData.user = { _id:'synthetic', communityId:'synthetic-community', buildingId:'synthetic-building', roles:['resident'] };
  const p = r.instance(r.load('miniprogram/utils/service-form.js')(code));
  p.draftKey = 'synthetic-draft';
  Object.assign(p.data, { loading:false, community:{ _id:'synthetic-community', stations:[], canteens:[], prices:{} },
    addresses:[{ id:'synthetic-address' }], quote:{ payAmount:100, goodsCap:0 }, quoteLoading:false });
  return { r, p };
}
(async()=>{
  for (const code of ['express','trash','buy','help','meal','escort','pet']) {
    await check(code+': double tap while create is pending submits once',async()=>{
      const d=deferred(); const {r,p}=setup(code,async()=>d.promise);
      const first=p.submit(); await p.submit(); assert.equal(r.requests.length,1);
      d.resolve({orderId:'synthetic-order',mock:true}); await first; assert.equal(r.navigation.length,1);
    });
    await check(code+': uncertain network result reuses request ID for identical retry',async()=>{
      let n=0;const {r,p}=setup(code,async()=>{if(!n++)throw Error('synthetic timeout');return {orderId:'synthetic-order',mock:true};});
      await p.submit(); assert.equal(p.data.error,'synthetic timeout'); assert.equal(p.data.saving,false);
      await p.submit(); assert.equal(r.requests[0][2].requestId,r.requests[1][2].requestId); assert.equal(r.navigation.length,1);
    });
    await check(code+': payment failure redirects to existing order without a second create',async()=>{
      const {r,p}=setup(code,async()=>({orderId:'synthetic-order',mock:true}),async()=>{throw Error('synthetic pay failure');});
      await p.submit();assert.equal(r.requests.length,1);assert.deepEqual(r.navigation,[['redirectTo','/pages/orders/detail?id=synthetic-order']]);
    });
    await check(code+': failed detail navigation must not create a new order on retry',async()=>{
      const {r,p}=setup(code,async()=>({orderId:'synthetic-order',mock:true}));
      r.wx.redirectTo=o=>{if(o.fail)o.fail({errMsg:'redirectTo:fail synthetic'});};
      await p.submit();await p.submit();
      const ids=r.requests.filter(x=>x[1]==='create').map(x=>x[2].requestId);
      assert.equal(new Set(ids).size,1,'navigation failure generated a new create request ID');
      assert(p.data.navigationError.includes('订单已创建'));
    });
    await check(code+': recovered receipt opens only the existing order, never payment',async()=>{
      let payments=0;const {r,p}=setup(code,async()=>({orderId:'synthetic-order',mock:true}),async()=>{payments++;});
      r.wx.redirectTo=o=>o.fail({errMsg:'synthetic'});
      await p.submit();assert.equal(payments,1);
      assert.deepEqual(Object.keys(r.store[p.draftKey]).sort(),['createdOrderId','userId']);
      const restored=r.instance(r.load('miniprogram/utils/service-form.js')(code));restored.draftKey=p.draftKey;
      restored.restoreDraft(r.app.globalData.user);assert.equal(restored.data.createdOrderId,'synthetic-order');
      await restored.submit();assert.equal(r.requests.length,1);assert.equal(payments,1);
    });
    await check(code+': navigation retry is guarded and success clears only own receipt',async()=>{
      let navigation;const {r,p}=setup(code,async()=>({orderId:'synthetic-order',mock:true}));
      r.wx.redirectTo=o=>{navigation=o;};await p.submit();const first=navigation;
      await p.submit();assert.equal(navigation,first);assert.equal(r.requests.length,1);
      first.fail({errMsg:'synthetic'});assert.equal(p.data.navigating,false);
      p.openCreatedOrder();assert.notEqual(navigation,first);navigation.success();assert.equal(r.store[p.draftKey],undefined);
    });
    await check(code+': late create after unload keeps receipt without navigation or payment',async()=>{
      let payments=0;const d=deferred();const {r,p}=setup(code,async()=>d.promise,async()=>{payments++;});
      const pending=p.submit();p.onUnload();const snapshot=JSON.stringify(p.data);
      d.resolve({orderId:'synthetic-order',mock:true});await pending;
      assert.equal(payments,0);assert.equal(r.navigation.length,0);assert.equal(JSON.stringify(p.data),snapshot);
      assert.equal(r.store[p.draftKey].createdOrderId,'synthetic-order');
    });
    await check(code+': late create after hide restores receipt on return without another create',async()=>{
      const d=deferred();const {r,p}=setup(code,async()=>d.promise);const pending=p.submit();p.onHide();
      d.resolve({orderId:'synthetic-order',mock:true});await pending;assert.equal(r.navigation.length,0);
      p.hidden=false;p.restoreDraft(r.app.globalData.user);assert.equal(p.data.createdOrderId,'synthetic-order');
      await p.submit();assert.equal(r.requests.length,1);assert.equal(r.navigation.length,1);
    });
    await check(code+': wrong-user receipt is discarded; created receipt contains no password',async()=>{
      const {r,p}=setup(code,async()=>({orderId:'synthetic-order',mock:true}));
      r.store[p.draftKey]={userId:'other',createdOrderId:'other-order'};p.restoreDraft(r.app.globalData.user);
      assert.equal(p.createdOrderId,undefined);assert.equal(r.store[p.draftKey],undefined);
      p.data.form.entryPassword='synthetic-secret';r.wx.redirectTo=o=>o.fail({});await p.submit();
      assert(!JSON.stringify(r.store).includes('synthetic-secret'));assert.equal(r.requests.length,1);
    });
  }
  console.log(JSON.stringify({scope:'Offline page handlers, synthetic API/payment/navigation; not live UI acceptance',passed:cases.filter(c=>c.passed).length,total:cases.length,cases},null,2));
  if(cases.some(c=>!c.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
