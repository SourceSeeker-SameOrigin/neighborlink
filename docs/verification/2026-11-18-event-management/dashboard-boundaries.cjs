// Actual admin dashboard page with synthetic identities and intercepted reads.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const community = { _id: 'synthetic-community', name: '联调小区' };
const metrics = { serviceFeeTurnover: 500, actualIncome: 100, goodsReceived: 0, goodsRefunded: 0,
  goodsNet: 0, refundTotal: 0, complaintRate: 0, acceptRate15m: 10000, memberships: {}, orders: {},
  extensions: { modules: [], payoutStatus: [] } };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', communityId: community._id, roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/dashboard/dashboard.js') };
};
const reply = (name, action) => action === 'listCommunities' ? { list: [community], hasMore: false } :
  action === 'notificationTemplates' ? {} : metrics;

(async () => {
  const results = [];
  {
    const { page } = fixture(reply);
    await page.load();
    results.push({ case: 'normal-admin-read', pass: page.data.ready && page.data.metrics.actualYuan === '1.00' });
  }
  {
    const wait = deferred();
    const { env, page } = fixture((name, action) => action === 'dashboard' ? wait.promise : reply(name, action));
    const load = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: community._id, roles: ['resident'] };
    wait.resolve(metrics);
    await load;
    results.push({ case: 'late-metrics-after-identity-change', pass: !page.data.ready && !page.data.authorized,
      observed: { ready: page.data.ready, authorized: page.data.authorized } });
  }
  {
    const { env, page } = fixture(reply);
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', communityId: community._id, roles: ['resident'] };
    await page.refresh();
    results.push({ case: 'old-refresh-after-identity-change', pass: env.requests.filter(request => request[1] === 'dashboard').length === 1,
      observed: { dashboardCalls: env.requests.filter(request => request[1] === 'dashboard').length } });
  }
  {
    const wait = deferred();
    const { page } = fixture((name, action) => action === 'dashboard' ? wait.promise : reply(name, action));
    const load = page.load();
    await pause();
    page.onHide?.();
    wait.resolve(metrics);
    await load;
    results.push({ case: 'late-metrics-after-hide', pass: !page.data.ready && !page.data.authorized,
      observed: { ready: page.data.ready, authorized: page.data.authorized } });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities; all CloudBase reads intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
