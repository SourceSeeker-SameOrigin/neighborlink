// Local synthetic data and serialized transactions. Actual writer, mock payment,
// public cancel and refund-result handlers. No WeChat payment or cloud connection.
const assert = require('node:assert/strict');
const {
  harness
} = require('../2026-11-12-mock-orders/idempotency.cjs');
async function setup({
  goods = 0,
  paid = false
} = {}) {
  const h = harness();
  h.user.pointsBalance = h.data.users[0].pointsBalance = 200;
  Object.assign(h.context.pricing, {
    listPrice: 500,
    payAmount: 300,
    goodsCap: goods,
    discount: 200,
    couponId: 'coupon',
    couponDiscount: 100,
    pointsRedeemed: 100
  });
  if (goods) {
    h.event.serviceCode = 'buy';
    h.context.detail = {
      shop: '测试店',
      items: '测试商品',
      goodsCap: goods
    };
  }
  h.data.couponTemplates = [{
    _id: 't',
    status: 'active',
    threshold: 0,
    kind: 'amount_off',
    value: 100,
    maxOff: 100,
    services: ['all'],
    communityIds: 'all'
  }];
  h.data.coupons.push({
    _id: 'coupon',
    openid: h.user.openid,
    templateId: 't',
    status: 'unused',
    orderId: null,
    validFrom: new Date(Date.now() - 86400000),
    validTo: new Date(Date.now() + 86400000)
  });
  await h.create();
  const id = h.current()._id;
  if (paid) await h.actions.mockPay({
    orderId: id
  }, h.auth);
  return h;
}
const coupon = h => h.data.coupons[0];
const balance = h => h.data.users[0].pointsBalance;
const restored = h => h.data.pointsLedger.filter(x => x.reason === 'refund').reduce((n, x) => n + x.delta, 0);
const results = [];
async function run(label, work) {
  try {
    await work();
    results.push({
      label,
      ok: true
    });
  } catch (e) {
    results.push({
      label,
      ok: false,
      detail: e.message
    });
  }
}
async function cancel(h) {
  await h.actions.cancel({
    orderId: h.current()._id
  }, h.auth);
}
function seedCallbacks(h, parts) {
  // Inject provider notifications at the boundary after refund reservation and before callback.
  const records = parts.map(([service, goods], i) => ({
    key: 'part-' + i,
    outRefundNo: h.current().orderNo + 'R' + (i + 1),
    amount: service + goods,
    serviceAmount: service,
    goodsAmount: goods,
    status: 'processing',
    at: new Date(1700000000000 + i * 1000)
  }));
  h.data.orders[0].refunds = structuredClone(records);
  return records;
}
async function main() {
  await run('创建订单锁券并扣积分；同一创建请求重放零额外写入', async () => {
    const h = await setup();
    assert.equal(coupon(h).status, 'locked');
    assert.equal(coupon(h).orderId, h.current()._id);
    assert.equal(balance(h), 100);
    const before = h.snapshot();
    await h.create();
    assert.equal(h.snapshot(), before);
  });
  for (const expired of [false, true]) await run('未付款取消释放券和积分；券' + (expired ? '已过期' : '仍有效'), async () => {
    const h = await setup();
    if (expired) coupon(h).validTo = new Date(0);
    await cancel(h);
    assert.equal(h.current().status, 'closed');
    assert.equal(coupon(h).status, expired ? 'expired' : 'unused');
    assert.equal(coupon(h).orderId, null);
    assert.equal(balance(h), 200);
    await h.pay.closeUnpaid(h.current(), h.user.openid);
    assert.equal(restored(h), 100);
  });
  await run('模拟支付核销一次；重复通知不再扣券或积分', async () => {
    const h = await setup({
      paid: true
    });
    assert.equal(coupon(h).status, 'used');
    assert.equal(balance(h), 100);
    const before = h.snapshot();
    await h.actions.mockPay({
      orderId: h.current()._id
    }, h.auth);
    assert.equal(h.snapshot(), before);
  });
  for (const expired of [false, true]) await run('已付款全退，重复回调不再返还；券' + (expired ? '已过期' : '仍有效'), async () => {
    const h = await setup({
      paid: true
    });
    if (expired) coupon(h).validTo = new Date(0);
    await cancel(h);
    assert.equal(coupon(h).status, expired ? 'expired' : 'unused');
    assert.equal(balance(h), 200);
    const r = h.current().refunds[0];
    await h.pay.setRefundResult(h.current()._id, r, 'success');
    assert.equal(restored(h), 100);
  });
  await run('服务费全退但商品款尚差一分，补齐后才退券', async () => {
    const h = await setup({
      paid: true,
      goods: 200
    });
    await h.pay.requestRefund(h.current(), 499, '合成分项', {
      key: 'part1',
      parts: {
        service: 300,
        goods: 199
      }
    });
    assert.equal(coupon(h).status, 'used');
    assert.equal(balance(h), 200);
    await h.pay.requestRefund(h.current(), 1, '合成尾款', {
      key: 'part2',
      parts: {
        service: 0,
        goods: 1
      }
    });
    assert.equal(coupon(h).status, 'unused');
    assert.equal(restored(h), 100);
  });
  for (const reversed of [false, true]) await run((reversed ? '逆序' : '顺序') + '两笔回调，全额退款累计返还100积分及一张券', async () => {
    const h = await setup({
      paid: true
    });
    const id = h.current()._id;
    const records = seedCallbacks(h, [[100, 0], [200, 0]]);
    const [first, second] = reversed ? records.reverse() : records;
    await h.pay.setRefundResult(id, first, 'success');
    assert.equal(coupon(h).status, 'used');
    assert.equal(restored(h), Math.floor(100 * first.amount / 300));
    await h.pay.setRefundResult(id, first, 'success');
    await h.pay.setRefundResult(id, second, 'success');
    assert.equal(coupon(h).status, 'unused');
    assert.equal(restored(h), 100);
    assert.equal(balance(h), 200);
  });
  await run('旧记录仅存 goods_difference 和总额时，商品差额不返积分', async () => {
    const h = await setup({
      paid: true,
      goods: 200
    });
    const [first] = seedCallbacks(h, [[0, 200]]);
    const legacy = h.data.orders[0].refunds[0];
    legacy.key = 'goods_difference';
    delete legacy.goodsAmount;
    delete legacy.serviceAmount;
    await h.pay.setRefundResult(h.current()._id, first, 'success');
    assert.equal(coupon(h).status, 'used');
    assert.equal(restored(h), 0);
  });
  console.log(JSON.stringify({
    total: results.length,
    passed: results.filter(x => x.ok).length,
    results
  }, null, 2));
  if (results.some(x => !x.ok)) process.exitCode = 1;
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
