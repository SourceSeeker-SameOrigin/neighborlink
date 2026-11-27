// Reproduce the pending QA184 boundary with actual P60 page code and isolated data.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('../2026-11-16-escort/resident-shops.cjs');

async function fixture() {
  const { db, call } = setup(1, 'quote');
  const env = runtime(call);
  const [residentA, residentB] = db.data.users;
  env.app.globalData.user = residentA;
  const page = env.instance('miniprogram/shops/booking/booking.js');
  page.onLoad({ serviceId: 's000' });
  await page.onShow();
  assert.equal(page.data.ready, true);
  assert.equal(page.userId, residentA._id);
  return { db, env, page, residentA, residentB };
}

(async () => {
  const submit = await fixture();
  submit.page.input({ detail: { value: '仅用于隔离复现的预约需求' } });
  submit.env.app.globalData.user = submit.residentB;
  await submit.page.submit();
  const staleCreateCalls = submit.env.requests.filter(request => request[1] === 'createBooking').length;

  const navigate = await fixture();
  navigate.page.orderId = 'synthetic-old-order';
  navigate.page.setData({ recovery: 'found' });
  navigate.env.app.globalData.user = navigate.residentB;
  navigate.page.openOrder();
  const staleOrderNavigations = navigate.env.navigation.filter(([, url]) =>
    url === '/pages/orders/detail?id=synthetic-old-order').length;

  const report = { scope: 'actual P60 page, synthetic users and isolated database; no CloudBase call',
    staleCreateCalls, staleOrderNavigations, isolatedOrders: submit.db.data.orders.length };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(staleCreateCalls, 1);
  assert.equal(staleOrderNavigations, 1);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
