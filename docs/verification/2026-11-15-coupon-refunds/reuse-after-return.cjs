// Synthetic orders only. Exercise a coupon returned by order A and then used by order B.
const assert = require('node:assert/strict');
const { harness } = require('../2026-11-12-mock-orders/idempotency.cjs');

async function replayCallback(original) {
  const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
  const order = structuredClone(original);
  order.payment.mode = 'wechat';
  const env = fixture({ records: { orders: [order] } });
  const callback = env.load('cloudfunctions/refundCallback/index.js').main;
  const event = { out_trade_no: order.orderNo, out_refund_no: order.refunds[0].outRefundNo };
  env.setActor('');
  for (let i = 0; i < 3; i++) assert.equal((await callback(event)).errcode, 0);
  env.setActor('synthetic-resident');
  assert.equal((await callback(event)).errcode, 1);
  assert.equal(env.writes.length, 0);
}

async function check(firstPaid, secondPaid) {
  const h = harness();
  const now = Date.now();
  h.data.couponTemplates = [{ _id: 't', status: 'active', kind: 'amount_off', value: 100,
    maxOff: 100, threshold: 0, services: ['trash'], communityIds: 'all' }];
  h.data.coupons.push({ _id: 'c', openid: h.user.openid, templateId: 't', status: 'unused',
    validFrom: new Date(now - 86400000), validTo: new Date(now + 86400000) });
  Object.assign(h.context.pricing, { couponId: 'c', couponDiscount: 100, discount: 100, payAmount: 400 });
  const first = await h.create();
  const pay = order => h.actions.mockPay({ orderId: order._id }, h.auth);
  const cancel = order => h.actions.cancel({ orderId: order._id }, h.auth);
  if (firstPaid) await pay(first);
  await cancel(first);
  const original = h.current();
  assert.equal(h.data.coupons[0].status, 'unused');
  if (firstPaid) await replayCallback(original);
  const newRequest = { ...h.event, requestId: 'synthetic_second_order' };
  const second = await h.writer.create(newRequest, structuredClone(h.data.users[0]), h.context);
  if (secondPaid) await pay(second);
  assert.equal(h.data.coupons[0].orderId, second._id);
  assert.equal(h.data.coupons[0].status, secondPaid ? 'used' : 'locked');
  const secondState = () => h.data.orders.find(order => order._id === second._id);
  const before = structuredClone({ coupon: h.data.coupons[0], second: secondState(),
    refunds: original.refunds, users: h.data.users, ledger: h.data.pointsLedger });
  const writes = h.writes.length;
  for (let i = 0; i < 3; i++) {
    if (firstPaid) await h.pay.setRefundResult(first._id, original.refunds[0], 'success');
    else await h.pay.closeUnpaid(original, h.user.openid);
  }
  assert.deepEqual({ coupon: h.data.coupons[0], second: secondState(), refunds: h.current().refunds,
    users: h.data.users, ledger: h.data.pointsLedger }, before);
  const replayWrites = h.writes.slice(writes);
  assert.ok(replayWrites.every(([table, id]) => table === 'orders' && id === first._id));
  await cancel(second);
  assert.equal(h.data.coupons[0].status, 'unused');
  assert.equal(h.data.coupons[0].orderId, null);
  assert.equal(h.data.orders.length, 2);
  console.log('PASS', firstPaid ? '旧单退款重放' : '旧单关单重放', secondPaid ? '新单已核销' : '新单锁券', '旧单文档更新次数', replayWrites.length);
}

(async () => {
  for (const firstPaid of [false, true]) {
    for (const secondPaid of [false, true]) await check(firstPaid, secondPaid);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
