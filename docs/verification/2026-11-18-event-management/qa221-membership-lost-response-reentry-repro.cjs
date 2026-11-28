// Actual membership page with synthetic orders, lost responses and read-only lookup.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const plans = ['trash_monthly', 'express_monthly', 'visit_monthly', 'vacant_monthly'];

async function check(planCode, alreadyCreated) {
  const orders = new Map();
  let firstBuy = true, firstLookup = true;
  let originalBody;
  const r = runtime(async (_functionName, action, body) => {
    if (action === 'plans') return { list: [{ code: planCode, name: '合成月卡', price: 500, payAmount: 500 }] };
    if (action === 'mine') return { list: [] };
    if (action === 'lookupBuy') {
      if (alreadyCreated && firstLookup) { firstLookup = false; throw Error('synthetic lookup unavailable'); }
      const orderId = orders.get(body.requestId);
      return orderId ? { orderId, planCode, communityId: 'synthetic-community', addressId: null,
        slot: originalBody.slot || null, entry: planCode === 'vacant_monthly' ? 'password' : null } : { orderId: null };
    }
    assert.equal(action, 'buy');
    originalBody ||= body;
    if (firstBuy) {
      firstBuy = false;
      if (alreadyCreated) orders.set(body.requestId, 'synthetic-order-1');
      throw Error('synthetic response lost');
    }
    if (!orders.has(body.requestId)) orders.set(body.requestId, 'synthetic-order-1');
    return { orderId: orders.get(body.requestId) };
  }, { payment: { pay: async () => false } });
  r.app.globalData.user = { _id: 'synthetic-resident', communityId: 'synthetic-community', buildingId: 'synthetic-building' };
  const event = { currentTarget: { dataset: { code: planCode } } };
  const first = r.instance('miniprogram/pages/membership/index.js');
  await first.load();
  if (planCode === 'vacant_monthly') first.setData({ entry: 'password', entryPassword: 'synthetic-secret' });
  await first.buy(event);
  assert.equal(first.data.createdOrderId, '');
  assert(!JSON.stringify(r.store).includes('synthetic-secret'));
  first.onUnload();

  const second = r.instance('miniprogram/pages/membership/index.js');
  await second.load();
  if (alreadyCreated) {
    assert.equal(second.data.createdOrderId, 'synthetic-order-1');
    assert.equal(second.data.recoveryPending, false);
  } else {
    assert.equal(second.data.recoveryPending, true);
    assert.equal(second.data.recoveryCanRetry, true);
    if (planCode === 'vacant_monthly') {
      await second.retryPending();
      assert.equal(r.requests.filter(([, action]) => action === 'buy').length, 1);
      second.setData({ entryPassword: 'synthetic-secret' });
    }
    await second.retryPending();
    assert.equal(second.data.createdOrderId, 'synthetic-order-1');
  }
  const buys = r.requests.filter(([, action]) => action === 'buy');
  assert.equal(buys.length, alreadyCreated ? 1 : 2);
  assert(buys.every(([, , body]) => body.requestId === originalBody.requestId));
  assert.equal(orders.size, 1);
  assert(!JSON.stringify(r.store).includes('synthetic-secret'));
  return { planCode, alreadyCreated, buyCalls: buys.length, lookupCalls: r.requests.filter(([, action]) => action === 'lookupBuy').length,
    createdOrders: orders.size, displayedOrderId: second.data.createdOrderId };
}

(async () => {
  const results = [];
  for (const planCode of plans) {
    results.push(await check(planCode, true));
    results.push(await check(planCode, false));
  }
  console.log(JSON.stringify({ scope: 'Actual membership page; eight synthetic cross-page recovery scenarios; no real orders or payment', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
