// Actual community configuration page with synthetic users and intercepted APIs.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const community = { _id: 'synthetic-community', name: '联调小区', prices: {}, rates: {}, buildings: [] };
const reply = { community, communities: [community], global: { hotline: 'synthetic' } };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/community/community.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => reply);
    await page.load();
    results.push({ case: 'normal-admin-read', pass: page.data.authorized && page.data.community?._id === community._id });
  }
  {
    const { env, page } = fixture(async () => reply);
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.load();
    results.push({ case: 'denied-recheck-clears-old-community', pass: !page.data.authorized && !page.data.community,
      observed: { authorized: page.data.authorized, community: page.data.community?._id } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'managementConfig' ? wait.promise : {});
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve(reply);
    await read;
    results.push({ case: 'late-config-after-identity-change', pass: !page.data.authorized && !page.data.community,
      observed: { authorized: page.data.authorized, community: page.data.community?._id } });
  }
  {
    const { env, page } = fixture(async () => reply);
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.saveGlobal();
    results.push({ case: 'old-global-save-after-identity-change', pass: !env.requests.some(request => request[1] === 'updateConfig'),
      observed: { updateCalls: env.requests.filter(request => request[1] === 'updateConfig').length } });
  }
  {
    const { env, page } = fixture(async () => reply);
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.saveCommunity();
    results.push({ case: 'old-community-save-after-identity-change', pass: !env.requests.some(request => request[1] === 'updateCommunity'),
      observed: { updateCalls: env.requests.filter(request => request[1] === 'updateCommunity').length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; all CloudBase calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
