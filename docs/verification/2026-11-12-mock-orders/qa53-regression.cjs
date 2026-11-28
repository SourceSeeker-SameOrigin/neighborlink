const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function test(name, run) { try { await run(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } }
async function setup(create = async () => ({ orderId: 'synthetic-order' })) {
 const r = runtime(async (name, action, body) => {
  if (name !== 'order') throw Error('Unexpected function');
  if (action === 'quote') return { slots: [{ date: '2026-11-13', start: '07:00', end: '00:00' }], pricing: { payAmount: 0 } };
  if (action === 'create') return create(body);
  throw Error('Unexpected action');
 });
 r.app.globalData.user.communityId = 'synthetic-community';
 r.wx.setStorageSync = (k,v) => { r.store[k] = JSON.parse(JSON.stringify(v)); };
 const p = r.instance('miniprogram/recycle/order/order.js'); await p.onLoad();
 await p.category({ currentTarget: { dataset: { code: 'paper' } } });
 r.wx.redirectTo = o => { r.navigation.push(['redirectTo', o.url]); o.fail?.({ errMsg: 'Synthetic failure' }); };
 return { ...r, p, creates: () => r.requests.filter(x => x[1] === 'create') };
}
(async () => {
 await test('success then failed navigation retries only navigation', async () => { const r=await setup(); await r.p.create(); await r.p.create(); assert.equal(r.creates().length,1); assert.equal(r.navigation.length,2); assert(r.p.data.navigationError.includes('不会重复预约')); });
 await test('unknown result retries same input with same request ID', async () => { let n=0; const r=await setup(()=>{if(!n++)throw Error('lost');return {orderId:'synthetic-order'};}); await r.p.create(); await r.p.create(); assert.equal(r.creates().length,2); assert.equal(r.creates()[0][2].requestId,r.creates()[1][2].requestId); });
 await test('changed input after failed create receives different request ID', async () => { const r=await setup(()=>{throw Error('lost');}); await r.p.create(); r.p.note({detail:{value:'different'}}); await r.p.create(); assert.notEqual(r.creates()[0][2].requestId,r.creates()[1][2].requestId); });
 await test('concurrent submit while create pending calls create once', async () => { const d=deferred(),r=await setup(()=>d.promise); const t=r.p.create(); await r.p.create(); d.resolve({orderId:'synthetic-order'}); await t; assert.equal(r.creates().length,1); });
 await test('received order locks edits and quotes', async () => { const r=await setup(); await r.p.create(); const before=JSON.stringify(r.p.data.categories),count=r.requests.length; r.p.note({detail:{value:'changed'}}); r.p.selectSlot({detail:{value:5}}); await r.p.category({currentTarget:{dataset:{code:'plastic'}}}); await r.p.refreshQuote(); assert.equal(JSON.stringify(r.p.data.categories),before); assert.equal(r.p.data.note,''); assert.equal(r.p.data.slotIndex,0); assert.equal(r.requests.length,count); });
 await test('fresh instance restores minimal own receipt without quote/create', async () => { const r=await setup(); r.p.note({detail:{value:'private draft'}}); await r.p.create(); const receipt=r.store[r.p.receiptKey]; assert.deepEqual(Object.keys(receipt).sort(),['orderId','userId']); assert(!JSON.stringify(r.store).includes('private draft')); const p=r.instance('miniprogram/recycle/order/order.js'),count=r.requests.length; await p.onLoad(); assert.equal(p.data.createdOrderId,'synthetic-order'); assert.equal(r.requests.length,count); await p.create(); assert.equal(r.creates().length,1); });
 await test('wrong user receipt ignored', async () => { const r=await setup(); r.store[r.p.receiptKey]={userId:'someone-else',orderId:'other-order'}; const p=r.instance('miniprogram/recycle/order/order.js'); await p.onLoad(); assert.equal(p.data.createdOrderId,''); });
 await test('same page user change drops old in-memory receipt', async () => { const r=await setup(); await r.p.create(); r.app.globalData.user={_id:'other',communityId:'other'}; await r.p.load(); const n=r.navigation.length; r.p.openCreatedOrder(); assert.equal(r.p.data.createdOrderId,''); assert.equal(r.navigation.length,n); });
 await test('successful navigation removes only matching stored receipt', async () => { const r=await setup(); r.wx.redirectTo=o=>{r.navigation.push(['redirectTo',o.url]);o.success();}; await r.p.create(); assert.equal(r.store[r.p.receiptKey],undefined); });
 await test('late navigation success preserves newer receipt', async () => { const r=await setup(); let nav; r.wx.redirectTo=o=>{nav=o;}; await r.p.create(); r.store[r.p.receiptKey]={userId:'fixture',orderId:'newer'}; nav.success(); assert.equal(r.store[r.p.receiptKey].orderId,'newer'); });
 await test('navigation pending blocks duplicate navigation', async () => { const r=await setup(); r.wx.redirectTo=o=>r.navigation.push(['redirectTo',o.url]); await r.p.create(); await r.p.create(); r.p.openCreatedOrder(); assert.equal(r.navigation.length,1); });
 await test('synchronous navigation throw shows recovery error', async () => { const r=await setup(); r.wx.redirectTo=()=>{throw Error('synthetic');}; await r.p.create(); assert.equal(r.p.data.navigating,false); assert(r.p.data.navigationError); assert.equal(r.creates().length,1); });
 await test('storage write failure retains memory lock', async () => { const r=await setup(); r.wx.setStorageSync=()=>{throw Error('storage');}; await r.p.create(); await r.p.create(); assert.equal(r.creates().length,1); assert.equal(r.p.receipt.orderId,'synthetic-order'); });
 await test('invalid result does not lock and same input retains request ID', async () => { const r=await setup(()=>({})); await r.p.create(); await r.p.create(); assert.equal(r.p.data.createdOrderId,''); assert.equal(r.creates()[0][2].requestId,r.creates()[1][2].requestId); });
 for(const lifecycle of ['onHide','onUnload']) await test('late create after '+lifecycle+' persists receipt without UI/navigation',async()=>{const d=deferred(),r=await setup(()=>d.promise),t=r.p.create();r.p[lifecycle]();const snapshot=JSON.stringify(r.p.data);d.resolve({orderId:'synthetic-order'});await t;assert.equal(JSON.stringify(r.p.data),snapshot);assert.equal(r.navigation.length,0);assert.equal(r.store[r.p.receiptKey].orderId,'synthetic-order');if(lifecycle==='onHide'){await r.p.onShow();assert.equal(r.p.data.createdOrderId,'synthetic-order');assert.equal(r.p.data.busy,false);}});
 await test('return while create pending stays locked until result',async()=>{const d=deferred(),r=await setup(()=>d.promise),t=r.p.create();r.p.onHide();await r.p.onShow();assert.equal(r.p.data.busy,true);await r.p.create();d.resolve({orderId:'synthetic-order'});await t;assert.equal(r.creates().length,1);assert.equal(r.p.data.busy,false);assert.equal(r.p.data.createdOrderId,'synthetic-order');});
 await test('late identity read after unload cannot update page',async()=>{const r=await setup(),d=deferred();r.app.ensureSession=()=>d.promise;const t=r.p.load();r.p.onUnload();const before=JSON.stringify(r.p.data);d.resolve(r.app.globalData.user);await t;assert.equal(JSON.stringify(r.p.data),before);});
 await test('quote response after hide cannot update page',async()=>{const d=deferred(),r=runtime(async()=>d.promise),p=r.instance('miniprogram/recycle/order/order.js');p.communityId='synthetic';p.data.categories[0].selected=true;const t=p.refreshQuote();p.onHide();const before=JSON.stringify(p.data);d.resolve({pricing:{payAmount:0},slots:[]});await t;assert.equal(JSON.stringify(p.data),before);});
 await test('load failure blocks creation and preserves note',async()=>{const r=await setup();r.p.note({detail:{value:'keep'}});r.app.ensureSession=async()=>{throw Error('session');};await r.p.load();await r.p.create();assert.equal(r.creates().length,0);assert.equal(r.p.data.note,'keep');assert.equal(r.p.data.error,'session');});
 await test('invalid selected slot blocks request',async()=>{const r=await setup();r.p.selectSlot({detail:{value:99}});await r.p.create();assert.equal(r.creates().length,0);assert(r.p.data.error);});
 console.log(JSON.stringify({scope:'Offline actual recycle page with synthetic API, storage and navigation; no real cloud or visual acceptance',total:results.length,passed:results.filter(x=>x.passed).length,results},null,2));
 if(results.some(x=>!x.passed))process.exitCode=1;
})();
