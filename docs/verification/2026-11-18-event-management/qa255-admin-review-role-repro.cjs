// Actual P21/P26/P30/P33 pages; synthetic administrator role revocation; all cloud reads intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const cases = [
  { id: 'P21', file: 'miniprogram/admin/providers/providers.js', action: 'listProviders',
    reply: { list: [{ _id: 'synthetic-provider', status: 'pending', certs: [] }], hasMore: false }, field: 'rows' },
  { id: 'P26', file: 'miniprogram/admin/reports/reports.js', action: 'listReports',
    reply: { list: [{ _id: 'synthetic-report', targetType: 'message', status: 'pending' }], hasMore: false }, field: 'rows' },
  { id: 'P30', file: 'miniprogram/admin/merchants/merchants.js', action: 'adminList',
    reply: { list: [{ _id: 'synthetic-merchant', status: 'pending' }], hasMore: false }, field: 'list' },
  { id: 'P33', file: 'miniprogram/admin/stations/stations.js', action: 'listApplications',
    reply: { list: [{ _id: 'synthetic-station', status: 'pending' }], hasMore: false }, field: 'rows' }
];
const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };

async function run(item, revoked) {
  let release;
  const env = runtime((_name, action) => {
    assert.equal(action, item.action, `unexpected call ${action}`);
    if (revoked) return new Promise(resolve => { release = () => resolve(item.reply); });
    return item.reply;
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance(item.file);
  const pending = page.onShow();
  if (revoked) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} list read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: revoked ? 'revoked-during-read' : 'normal',
    loading: page.data.loading, ready: page.data.ready, rows: page.data[item.field].length,
    error: page.data.error, reads: env.requests.map(request => request[1]) };
  const desired = revoked
    ? !observed.loading && observed.rows === 0 &&
      (item.id !== 'P30' || observed.ready === false) &&
      /身份.*变化|权限.*变化|无权/.test(observed.error)
    : !observed.loading && observed.rows === 1 &&
      (item.id !== 'P30' || observed.ready === true);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of cases) {
    results.push(await run(item, false));
    results.push(await run(item, true));
  }
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P21/P26/P30/P33 actual pages; synthetic role change; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 4, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
