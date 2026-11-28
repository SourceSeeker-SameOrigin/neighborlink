// Actual membership page with a synthetic cloud store. No real orders or payments.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const plans = ['trash_monthly', 'express_monthly', 'visit_monthly', 'vacant_monthly'];

async function reproduce(planCode) {
  const orders = new Map();
  const r = runtime(async (_functionName, action, body) => {
    if (action === 'plans') return { list: [{ code: planCode, price: 500, payAmount: 500 }] };
    if (action === 'mine') return { list: [] };
    assert.equal(action, 'buy');
    if (!orders.has(body.requestId)) orders.set(body.requestId, `synthetic-order-${orders.size + 1}`);
    if (orders.size === 1) throw Error('synthetic response lost after order creation');
    return { orderId: orders.get(body.requestId) };
  }, { payment: { pay: async () => false } });
  r.app.globalData.user = { _id: 'synthetic-resident', communityId: 'synthetic-community', buildingId: 'synthetic-building' };
  const event = { currentTarget: { dataset: { code: planCode } } };
  const first = r.instance('miniprogram/pages/membership/index.js');
  await first.load();
  if (planCode === 'vacant_monthly') first.setData({ entry: 'password', entryPassword: 'synthetic-secret' });
  await first.buy(event);
  assert.equal(orders.size, 1);
  assert.equal(first.data.createdOrderId, '');
  assert.equal(r.store[first.receiptKey], undefined);
  first.onUnload();

  const second = r.instance('miniprogram/pages/membership/index.js');
  await second.load();
  if (planCode === 'vacant_monthly') second.setData({ entry: 'password', entryPassword: 'synthetic-secret' });
  await second.buy(event);
  const buys = r.requests.filter(([, action]) => action === 'buy');
  const outcome = { planCode, calls: buys.length, requestIdsDiffer: buys[0][2].requestId !== buys[1][2].requestId,
    createdOrders: orders.size, displayedOrderId: second.data.createdOrderId };
  assert.equal(outcome.calls, 2);
  assert.equal(outcome.requestIdsDiffer, true);
  assert.equal(outcome.createdOrders, 2);
  assert.equal(outcome.displayedOrderId, 'synthetic-order-2');
  return outcome;
}

Promise.all(plans.map(reproduce)).then(results => {
  console.log(JSON.stringify({ scope: 'Actual membership page with synthetic cloud; no real order, payment or cloud write', results }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });
