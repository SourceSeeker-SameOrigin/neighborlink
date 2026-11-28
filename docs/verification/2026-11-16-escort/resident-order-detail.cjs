// Run from the project root. Only synthetic sessions and orders are used.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('./resident-shops.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}

async function verify(type) {
  const { db, call } = setup(1, type);
  const main = db.load('cloudfunctions/order/index.js').main;
  let pending, offline = false, paid = 0;
  const env = runtime((...args) => client.call(...args), { payment: { pay: async () => { paid++; } } });
  const client = env.load('miniprogram/utils/api.js');
  env.wx.showLoading = env.wx.hideLoading = () => {};
  env.wx.cloud = { callFunction: async ({ data }) => {
    if (offline) throw Error('模拟断网');
    const result = await main(data);
    if (pending && pending.action === data.action) {
      const { started, release } = pending;
      pending = null;
      started.resolve();
      await release.promise;
    }
    return { result };
  } };
  const bookingEnv = runtime(call);
  bookingEnv.app.globalData.user = db.data.users[0];
  const booking = bookingEnv.instance('miniprogram/shops/booking/booking.js');
  booking.onLoad({ serviceId: 's000' });
  await booking.onShow();
  booking.input({ detail: { value: '合成需求' } });
  await booking.submit();
  assert.equal(db.data.orders.length, 1);
  const orderId = db.data.orders[0]._id;
  const page = env.instance('miniprogram/pages/orders/detail.js');
  page.onLoad({ id: orderId });
  await page.onShow();
  assert.equal(page.data.order._id, orderId);
  const fields = Object.fromEntries(page.data.detailRows.map(row => [row.label,row.value]));
  assert.equal(fields['类别'], '维修');
  assert.equal(fields['服务名称'], '同名服务');
  assert.equal(fields['计价方式'], type === 'quote' ? '报价制' : '固定价');
  if (type === 'quote') {
    assert.equal(page.data.order.status, 'pending_quote');
    assert.equal(page.data.order.canPay, false);
    db.setActor('staff');
    await call('merchant', 'quoteBooking', { orderId, amount: 730, detail: '合成报价' });
    db.setActor('actor');
    await page.load();
  }
  assert.equal(page.data.amount, type === 'quote' ? '7.30' : '5.00');
  const started = deferred(), release = deferred();
  pending = { action: 'detail', started, release };
  const first = page.load();
  assert.equal(page.data.order, null);
  await started.promise;
  db.setActor('staff');
  await page.load();
  assert.ok(page.data.error);
  assert.equal(page.data.order, null);
  release.resolve();
  await first;
  assert.equal(page.data.order, null);
  assert.equal(page.data.detailRows.length, 0);
  assert.equal(env.navigation.length, 0);
  const count = env.requests.length;
  await page.pay();
  await page.cancel();
  assert.equal(env.requests.length, count);
  db.setActor('actor');
  await page.load();
  assert.equal(page.data.order._id, orderId);
  offline = true;
  await page.load();
  assert.equal(page.data.error, '模拟断网');
  assert.equal(page.data.order, null);
  offline = false;
  await page.load();
  let confirm;
  env.wx.showModal = options => { confirm = options.success; };
  const cancelling = page.cancel();
  page.onHide();
  await page.onShow();
  confirm({confirm: true});
  await cancelling;
  assert.equal(env.requests.filter(([, action]) => action === 'cancel').length, 0);
  const startingPay = deferred(), releasingPay = deferred();
  pending = { action: 'retryPayment', started: startingPay, release: releasingPay };
  const paying = page.pay();
  await startingPay.promise;
  page.onUnload();
  releasingPay.resolve();
  await paying;
  assert.equal(paid, 0);
  assert.equal(page.data.order, null);
  assert.equal(db.data.orders.length, 1);
  console.log(type, '报价、重新鉴权、断网、旧响应和离页操作检查通过');
}
(async () => { await verify('fixed'); await verify('quote'); })().catch(error => {console.error(error); process.exitCode=1;});
