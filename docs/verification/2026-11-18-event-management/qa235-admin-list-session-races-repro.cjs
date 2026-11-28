// Actual admin list pages with synthetic identities and intercepted reads.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P19', 'admin/orders/orders', 'listOrders'],
  ['P21', 'admin/providers/providers', 'listProviders'],
  ['P26', 'admin/reports/reports', 'listReports'],
  ['P27', 'admin/chat/chat', 'adminPull'],
  ['P30', 'admin/merchants/merchants', 'adminList'],
  ['P33', 'admin/stations/stations', 'listApplications']
];
const admin = (id, communityId) => ({ _id: id, communityId, roles: ['admin'] });
const empty = { list: [], hasMore: false, readOnly: false };

async function run(pageCase, phase) {
  const [pageId, path, action] = pageCase;
  let resolveSession, finishRead;
  const env = runtime((_, actual) => {
    assert.equal(actual, action, `${pageId} must use its expected list endpoint`);
    return phase === 'late-read' ? new Promise(resolve => { finishRead = () => resolve(empty); }) : empty;
  });
  const first = admin('first', 'community-a');
  const second = admin('second', 'community-b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  if (pageId === 'P27') page.onLoad({ caseType: 'complaint', orderId: 'synthetic-order' });
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-read') {
    for (let i = 0; i < 10 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must begin the list read`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading,
    error: page.data.error, requests: env.requests.map(request => request[1]),
    visibleRows: (page.data.rows || page.data.list || page.data.messages || []).length };
  const desired = phase === 'normal'
    ? !observed.loading && observed.error === '' && observed.requests.length === 1
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.visibleRows === 0 && observed.requests.length === (phase === 'first-session' ? 0 : 1);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of pages) {
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(item, phase));
  }
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 18);
  assert.equal(failed.length, 11, 'reproduction baseline changed; inspect before updating decision record');
  console.log(JSON.stringify({ scope: 'six actual admin list pages; synthetic administrators; cloud intercepted',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
