// Actual admin orders page and server list mapping; no CloudBase calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { listView } = require('../../../cloudfunctions/_shared/orderData');
const { orderView } = require('../../../cloudfunctions/_shared/views');

const order = (id, status, payAmount) => ({ _id: id, orderNo: id,
  kind: 'merchant', serviceCode: 'merchant', communityId: 'synthetic-community',
  detail: { title: '合成维修服务' }, status,
  pricing: { payAmount, goodsCap: 0 }, address: { buildingName: '合成楼栋', unit: '1', room: '101' },
  userOpenid: 'synthetic-resident', userPhone: '13800000000',
  note: '', photos: [], refunds: [], timeline: [{ status, at: new Date('2026-11-27T02:00:00Z') }],
  createdAt: new Date('2026-11-27T02:00:00Z') });
const run = async rows => {
  const env = runtime(async (name, action) => {
    if (name !== 'admin' || action !== 'listOrders') throw new Error('Unexpected API call');
    return { list: rows.map(listView), hasMore: false, readOnly: false };
  });
  env.app.globalData.user = { _id: 'admin-a', communityId: 'synthetic-community', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/orders/orders.js');
  await page.load(true);
  return page.data.rows[0];
};
const runDetail = async source => {
  const admin = { _id: 'admin-a', openid: 'admin-a', communityId: 'synthetic-community', roles: ['admin'] };
  const view = orderView(source, admin, null, { phoneVisibleHoursAfterDone: 24 }, new Date('2026-11-27T03:00:00Z'));
  const env = runtime(async (name, action) => {
    if (name !== 'order' || action !== 'detail') throw new Error('Unexpected API call');
    return view;
  });
  env.app.globalData.user = admin;
  const page = env.instance('miniprogram/admin/order/order.js');
  page.onLoad({ id: source._id });
  await page.load();
  return { status: page.data.order.status, amount: page.data.amount };
};

(async () => {
  const fixed = await run([order('fixed', 'pending_pay', 500)]);
  const unquoted = await run([order('quote', 'pending_quote', 0)]);
  const quoted = await run([order('quoted', 'pending_pay', 700)]);
  const unquotedDetail = await runDetail(order('quote-detail', 'pending_quote', 0));
  const results = [
    { case: 'fixed-price-still-shows-amount', pass: fixed.amount === '5.00', observed: fixed.amount },
    { case: 'unquoted-shows-pending-quote-instead-of-zero', pass: unquoted.amount !== '0.00',
      observed: { status: unquoted.status, amount: unquoted.amount, renderedTemplate: `¥${unquoted.amount}` } },
    { case: 'unquoted-detail-shows-pending-quote-instead-of-zero', pass: unquotedDetail.amount !== '0.00',
      observed: { ...unquotedDetail, renderedTemplate: `订单金额 ¥${unquotedDetail.amount}` } },
    { case: 'quoted-shows-actual-amount', pass: quoted.amount === '7.00', observed: quoted.amount }
  ];
  const summary = { scope: 'actual admin list/detail pages and server views; synthetic admin and orders; intercepted cloud reads',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.fail) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
