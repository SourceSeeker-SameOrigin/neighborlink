// Actual membership page with synthetic API/payment/navigation; no live cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const codes = ['trash_monthly', 'express_monthly', 'visit_monthly', 'vacant_monthly'];
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } }
async function setup(code, options = {}) {
  let paymentCalls = 0;
  const r = runtime(async (n, action, body) => {
    if (action === 'plans') return { list: [{ code, price: 100, payAmount: 100 }] };
    if (action === 'mine') return { list: [] };
    if (action === 'lookupBuy') return options.lookup ? options.lookup(body) : { orderId: null };
    if (action === 'buy') return options.create ? options.create(body) : { orderId: 'synthetic-order', mock: true };
    throw Error('Unexpected action ' + action);
  }, { payment: { pay: async () => { paymentCalls++; return options.pay ? options.pay() : false; } } });
  r.app.globalData.user = { _id: 'fixture', buildingId: 'synthetic', communityId: 'synthetic', roles: ['resident'] };
  r.wx.setStorageSync = (key, value) => { r.store[key] = JSON.parse(JSON.stringify(value)); };
  const page = r.instance('miniprogram/pages/membership/index.js');
  await page.load();
  const event = { currentTarget: { dataset: { code } } };
  return { ...r, page, event, payments: () => paymentCalls, buys: () => r.requests.filter(x => x[1] === 'buy'),
    failNav() { r.wx.navigateTo = o => { r.navigation.push(['navigateTo', o.url]); o.fail?.({ errMsg: 'synthetic failure' }); }; } };
}
(async () => {
  for (const code of codes) {
    await test(code + ': double click during create calls buy once', async () => {
      const d = deferred(), r = await setup(code, { create: () => d.promise });
      const t = r.page.buy(r.event); await r.page.buy(r.event); assert.equal(r.buys().length, 1);
      d.resolve({ orderId: 'synthetic-order', mock: true }); await t;
    });
    await test(code + ': unknown create outcome waits for confirmation and reuses request ID', async () => {
      let n = 0; const r = await setup(code, { create: () => { if (!n++) throw Error('synthetic timeout'); return { orderId: 'synthetic-order' }; } });
      await r.page.buy(r.event); await r.page.buy(r.event);
      assert.equal(r.buys().length, 1); assert.equal(r.page.data.recoveryPending, true);
      if (code === 'vacant_monthly') r.page.setData({ entryPassword: 'synthetic-secret' });
      await r.page.retryPending();
      assert.equal(r.buys().length, 2); assert.equal(r.buys()[0][2].requestId, r.buys()[1][2].requestId);
    });
    await test(code + ': cancelled payment and failed navigation do not buy or pay again', async () => {
      const r = await setup(code); r.failNav(); await r.page.buy(r.event); await r.page.buy(r.event);
      assert.equal(r.buys().length, 1); assert.equal(r.payments(), 1); assert(r.page.data.navigationError.includes('不会重复购买'));
      assert.equal(r.page.data.createdOrderId, 'synthetic-order'); assert.equal(r.page.data.busy, false);
    });
    await test(code + ': payment exception still locks and opens existing order', async () => {
      const r = await setup(code, { pay: () => { throw Error('synthetic pay error'); } }); r.failNav();
      await r.page.buy(r.event); await r.page.buy(r.event); assert.equal(r.buys().length, 1); assert.equal(r.payments(), 1);
      assert.equal(r.navigation[0][1], '/pages/orders/detail?id=synthetic-order');
    });
    await test(code + ': payment success followed by navigation failure keeps receipt', async () => {
      const r = await setup(code, { pay: () => true }); r.failNav(); await r.page.buy(r.event); await r.page.buy(r.event);
      assert.equal(r.buys().length, 1); assert.equal(r.payments(), 1); assert(r.store[r.page.receiptKey]);
    });
    await test(code + ': new instance restores minimum receipt without plans or new payment', async () => {
      const r = await setup(code); r.page.data.entryPassword = 'synthetic-private-password'; r.failNav(); await r.page.buy(r.event);
      assert.deepEqual(Object.keys(r.store[r.page.receiptKey]).sort(), ['orderId', 'userId']);
      assert(!JSON.stringify(r.store).includes('synthetic-private-password')); assert.equal(r.page.data.entryPassword, '');
      const next = r.instance('miniprogram/pages/membership/index.js'), count = r.requests.length;
      await next.load(); assert.equal(next.data.createdOrderId, 'synthetic-order'); assert.equal(r.requests.length, count);
      await next.buy(r.event); assert.equal(r.buys().length, 1); assert.equal(r.payments(), 1);
    });
    for (const lifecycle of ['onHide', 'onUnload']) await test(code + ': late create after ' + lifecycle + ' saves receipt without UI/payment/navigation', async () => {
      const d = deferred(), r = await setup(code, { create: () => d.promise });
      const t = r.page.buy(r.event); r.page[lifecycle](); const before = JSON.stringify(r.page.data);
      d.resolve({ orderId: 'synthetic-order' }); await t;
      assert.equal(JSON.stringify(r.page.data), before); assert.equal(r.payments(), 0); assert.equal(r.navigation.length, 0);
      assert.equal(r.store[r.page.receiptKey].orderId, 'synthetic-order');
      if (lifecycle === 'onHide') { r.page.onShow(); await new Promise(setImmediate); assert.equal(r.page.data.createdOrderId, 'synthetic-order'); assert.equal(r.page.data.busy, false); }
    });
    await test(code + ': invalid create result keeps request ID for confirmed retry', async () => {
      let n = 0; const r = await setup(code, { create: () => n++ ? { orderId: 'synthetic-order' } : {} });
      await r.page.buy(r.event); assert.equal(r.payments(), 0);
      if (code === 'vacant_monthly') r.page.setData({ entryPassword: 'synthetic-secret' });
      await r.page.retryPending();
      assert.equal(r.buys()[0][2].requestId, r.buys()[1][2].requestId);
    });
    await test(code + ': storage failure prevents unsafe create', async () => {
      const r = await setup(code); r.wx.setStorageSync = () => { throw Error('synthetic storage full'); }; r.failNav();
      await r.page.buy(r.event); await r.page.buy(r.event); assert.equal(r.buys().length, 0); assert.equal(r.payments(), 0);
      assert.match(r.page.data.error, /无法保存本次购买编号/);
    });
  }
  await test('navigation pending rejects repeat click; success clears matching receipt and return permits new purchase', async () => {
    const r = await setup(codes[0]); let nav; r.wx.navigateTo = o => { nav = o; };
    await r.page.buy(r.event); const first = nav; await r.page.buy(r.event); assert.equal(nav, first); assert.equal(r.buys().length, 1);
    r.page.onHide(); first.success(); assert.equal(r.store[r.page.receiptKey], undefined); assert.equal(r.page.receipt, null);
    r.page.onShow(); await new Promise(setImmediate); assert.equal(r.page.data.createdOrderId, ''); assert(r.page.data.ready);
  });
  await test('navigation success never clears a newer receipt', async () => {
    const r = await setup(codes[0]); let nav; r.wx.navigateTo = o => { nav = o; }; await r.page.buy(r.event);
    r.store[r.page.receiptKey] = { userId: 'fixture', orderId: 'newer-order' }; nav.success();
    assert.equal(r.store[r.page.receiptKey].orderId, 'newer-order');
  });
  await test('wrong user receipt is ignored; identity change cannot open previous in-memory order', async () => {
    const r = await setup(codes[0]); r.store[r.page.receiptKey] = { userId: 'other', orderId: 'other-order' };
    await r.page.load(); assert.equal(r.page.data.createdOrderId, ''); r.failNav(); await r.page.buy(r.event);
    r.app.globalData.user = { ...r.app.globalData.user, _id: 'another' }; await r.page.load();
    assert.equal(r.page.data.createdOrderId, ''); const n = r.navigation.length; r.page.openCreatedOrder(); assert.equal(r.navigation.length, n);
  });
  await test('synchronous navigation error exposes retry and preserves receipt', async () => {
    const r = await setup(codes[0]); r.wx.navigateTo = () => { throw Error('synthetic sync failure'); };
    await r.page.buy(r.event); assert.equal(r.page.data.navigating, false); assert(r.page.data.navigationError); assert(r.page.receipt);
  });
  console.log(JSON.stringify({ scope: 'Offline actual membership page; synthetic APIs, payment, navigation and storage; no cloud or visual acceptance', total: results.length, passed: results.filter(x => x.passed).length, results }, null, 2));
  if (results.some(x => !x.passed)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
