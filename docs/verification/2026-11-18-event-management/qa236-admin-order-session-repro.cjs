// Actual admin order detail with synthetic administrators and intercepted reads.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const order = { _id: 'synthetic-order', status: 'pending_pay', kind: 'service',
  serviceCode: 'trash', communityId: 'synthetic-community',
  pricing: { payAmount: 500, goodsCap: 0 }, detail: { bags: 1 },
  slot: null, timeline: [], refunds: [] };
const admin = id => ({ _id: id, roles: ['admin'], communityId: 'synthetic-community' });

async function run(phase) {
  let resolveSession, resolveDetail;
  const env = runtime((_, action) => {
    assert.equal(action, 'detail');
    return phase === 'late-detail'
      ? new Promise(resolve => { resolveDetail = () => resolve(order); }) : order;
  });
  const first = admin('first'), second = admin('second');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance('miniprogram/admin/order/order.js');
  page.onLoad({ id: order._id });
  const pending = page.load();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-detail') {
    for (let i = 0; i < 10 && !resolveDetail; i += 1) await Promise.resolve();
    assert.equal(typeof resolveDetail, 'function', 'detail request must be in flight');
    env.app.globalData.user = second;
    resolveDetail();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, error: page.data.error,
    orderId: page.data.order?._id || '', readOnly: page.data.readOnly,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.orderId === order._id &&
      observed.readOnly === false && observed.requests.length === 1
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      !observed.orderId && observed.readOnly === true &&
      observed.requests.length === (phase === 'first-session' ? 0 : 1);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'first-session', 'late-detail']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing the decision record');
  console.log(JSON.stringify({ scope: 'P20 actual page; synthetic admins and order; cloud intercepted',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
