// Actual P18/P25 pages; positive control for same-account administrator role revocation.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };
const community = { _id: 'community-a', name: '合成小区' };
const metrics = { serviceFeeTurnover: 500, actualIncome: 100, goodsReceived: 0,
  goodsRefunded: 0, goodsNet: 0, refundTotal: 0, complaintRate: 0, acceptRate15m: 10000,
  memberships: {}, orders: {}, extensions: { modules: [], payoutStatus: [] } };
const pages = [
  { id: 'P18', file: 'miniprogram/admin/dashboard/dashboard.js', delayed: 'dashboard' },
  { id: 'P25', file: 'miniprogram/admin/features/features.js', delayed: 'getFeatures' }
];

async function run(item, revoked) {
  let release;
  const env = runtime((name, action) => {
    let reply;
    if (name === 'catalog' && action === 'listCommunities') reply = { list: [community], hasMore: false };
    else if (name === 'admin' && action === 'notificationTemplates') reply = {};
    else if (name === 'admin' && action === 'dashboard') reply = metrics;
    else if (name === 'admin' && action === 'getFeatures')
      reply = { communityId: 'community-a', global: {}, community: {} };
    else throw Error(`unexpected read ${name}.${action}`);
    if (revoked && action === item.delayed) return new Promise(resolve => { release = () => resolve(reply); });
    return reply;
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance(item.file);
  const pending = page.load();
  if (revoked) {
    for (let i = 0; i < 40 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: revoked ? 'revoked-during-read' : 'normal',
    loading: page.data.loading, ready: page.data.ready, authorized: page.data.authorized,
    metrics: Boolean(page.data.metrics), items: page.data.items?.length || 0,
    error: page.data.error, reads: env.requests.map(request => request[1]) };
  const passed = revoked
    ? !observed.loading && !observed.ready && !observed.authorized &&
      !observed.metrics && !observed.items && /资料.*变化|身份.*变化|权限.*变化/.test(observed.error)
    : !observed.loading && observed.ready &&
      (item.id === 'P18' ? observed.authorized && observed.metrics : observed.items > 0);
  page.onHide();
  return { ...observed, passed };
}

async function main() {
  const results = [];
  for (const item of pages) {
    results.push(await run(item, false));
    results.push(await run(item, true));
  }
  console.log(JSON.stringify({ scope: 'P18/P25 actual pages; synthetic roles; zero cloud calls',
    passed: results.filter(result => result.passed).length, total: results.length, results }, null, 2));
  assert.ok(results.every(result => result.passed), 'role revocation control regressed');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
