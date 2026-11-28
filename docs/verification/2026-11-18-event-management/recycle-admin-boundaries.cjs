// Actual recycle reconciliation entry with synthetic identities and intercepted APIs/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const community = { _id: 'synthetic-community', name: '联调小区' };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', communityId: community._id, roles: ['admin'] };
  const page = env.instance('miniprogram/admin/recycle/recycle.js');
  page.setData({ from: '2026-11-01', to: '2026-11-27' });
  return { env, page };
};

(async () => {
  const results = [];
  {
    const { env, page } = fixture(async () => ({ list: [community], hasMore: false }));
    await page.load();
    page.openExports();
    results.push({ case: 'normal-admin-navigation', pass: page.data.ready && env.navigation.length === 1 });
  }
  {
    const { env, page } = fixture(async () => ({ list: [community], hasMore: false }));
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    page.openExports();
    results.push({ case: 'old-export-after-identity-change', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async () => wait.promise);
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve({ list: [community], hasMore: false });
    await read;
    results.push({ case: 'late-communities-after-identity-change', pass: !page.data.ready && page.data.communities.length === 0,
      observed: { ready: page.data.ready, communities: page.data.communities.length } });
  }
  {
    const { env, page } = fixture(async () => ({ list: [community], hasMore: false }));
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.load();
    results.push({ case: 'denied-recheck-clears-community', pass: !page.data.ready && page.data.communities.length === 0,
      observed: { ready: page.data.ready, communities: page.data.communities.length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities; all APIs and navigation intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
