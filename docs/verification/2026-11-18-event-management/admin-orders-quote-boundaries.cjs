// Actual admin orders page and server list mapping; no CloudBase calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { listView } = require('../../../cloudfunctions/_shared/orderData');

const order = (id, status, payAmount) => listView({ _id: id, orderNo: id,
  kind: 'merchant', serviceCode: 'merchant', communityId: 'synthetic-community',
  detail: { title: '合成维修服务' }, status,
  pricing: { payAmount, goodsCap: 0 }, address: { buildingName: '合成楼栋' },
  createdAt: new Date('2026-11-27T02:00:00Z') });
const run = async rows => {
  const env = runtime(async (name, action) => {
    if (name !== 'admin' || action !== 'listOrders') throw new Error('Unexpected API call');
    return { list: rows, hasMore: false, readOnly: false };
  });
  env.app.globalData.user = { _id: 'admin-a', communityId: 'synthetic-community', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/orders/orders.js');
  await page.load(true);
  return page.data.rows[0];
};

(async () => {
  const fixed = await run([order('fixed', 'pending_pay', 500)]);
  const unquoted = await run([order('quote', 'pending_quote', 0)]);
  const quoted = await run([order('quoted', 'pending_pay', 700)]);
  const results = [
    { case: 'fixed-price-still-shows-amount', pass: fixed.amount === '5.00', observed: fixed.amount },
    { case: 'unquoted-shows-pending-quote-instead-of-zero', pass: unquoted.amount !== '0.00',
      observed: { status: unquoted.status, amount: unquoted.amount, renderedTemplate: `¥${unquoted.amount}` } },
    { case: 'quoted-shows-actual-amount', pass: quoted.amount === '7.00', observed: quoted.amount }
  ];
  const summary = { scope: 'actual page and listView; synthetic admin and orders; intercepted cloud reads',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.fail) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
