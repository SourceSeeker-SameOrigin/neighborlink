// Actual P19/P20 pages; synthetic order and same-account privilege revocation.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };
const order = { _id: 'synthetic-order', status: 'pending_pay', kind: 'service',
  serviceCode: 'trash', communityId: 'community-a', pricing: { payAmount: 500, goodsCap: 0 },
  detail: { bags: 1 }, slot: null, timeline: [], refunds: [] };
const pages = [
  { id: 'P19', file: 'miniprogram/admin/orders/orders.js', action: 'listOrders',
    reply: { list: [order], hasMore: false, readOnly: false }, field: 'rows' },
  { id: 'P20', file: 'miniprogram/admin/order/order.js', action: 'detail',
    reply: order, field: 'order' }
];

async function run(item, revoked) {
  let release;
  const env = runtime((name, action) => {
    assert.equal(action, item.action, `unexpected call ${name}.${action}`);
    if (revoked) return new Promise(resolve => { release = () => resolve(item.reply); });
    return item.reply;
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance(item.file);
  if (item.id === 'P20') page.onLoad({ id: order._id });
  const pending = item.id === 'P20' ? page.load() : page.onShow();
  if (revoked) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} order read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: revoked ? 'revoked-during-read' : 'normal',
    loading: page.data.loading, visibleOrders: item.id === 'P19' ? page.data.rows.length : Number(Boolean(page.data.order)),
    readOnly: page.data.readOnly, error: page.data.error,
    reads: env.requests.map(request => request[1]) };
  const desired = revoked
    ? !observed.loading && observed.visibleOrders === 0 && observed.readOnly === true &&
      /身份.*变化|权限.*变化|无权/.test(observed.error)
    : !observed.loading && observed.visibleOrders === 1 && observed.readOnly === false;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of pages) {
    results.push(await run(item, false));
    results.push(await run(item, true));
  }
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P19/P20 actual pages; synthetic order; zero cloud calls',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
