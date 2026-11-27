// Reproduce pending QA188 using actual merchant pages and intercepted API calls.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { toFen } = require('../../../miniprogram/utils/money');

const merchant = { _id: 'merchant-user', roles: ['merchant'], merchantId: 'merchant-a' };
const calls = [];
const env = runtime(async (_name, action, data) => {
  if (action === 'myServices' || action === 'merchantOrders') return action === 'merchantOrders' ?
    { list: [{ _id: 'order-a', status: 'pending_quote', featureEnabled: true,
      detail: { category: 'repair' } }], hasMore: false } : { list: [], hasMore: false };
  calls.push({ action, data });
  return {};
});

(async () => {
  env.app.globalData.user = merchant;
  const services = env.instance('miniprogram/merchant/services/services.js');
  await services.onShow();
  assert.equal(services.data.ready, true);
  services.setData({ title: '合成固定价服务', price: '1.005', priceTypeIndex: 0 });
  await services.save();

  const orders = env.instance('miniprogram/merchant/orders/orders.js');
  await orders.onShow();
  assert.equal(orders.data.ready, true);
  orders.chooseQuote({ currentTarget: { dataset: { id: 'order-a' } } });
  orders.setData({ quoteAmount: '1.999', quoteDetail: '合成报价' });
  await orders.quote();

  const report = { scope: 'actual P56/P57 pages; API calls intercepted; no real service or quote',
    strictParserRejectsThreeDecimals: toFen('1.005') === null && toFen('1.999') === null,
    fixedPriceSentFen: calls.find(item => item.action === 'upsertService')?.data.price,
    quoteSentFen: calls.find(item => item.action === 'quoteBooking')?.data.amount };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.strictParserRejectsThreeDecimals, true);
  assert.equal(report.fixedPriceSentFen, 100);
  assert.equal(report.quoteSentFen, 200);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
