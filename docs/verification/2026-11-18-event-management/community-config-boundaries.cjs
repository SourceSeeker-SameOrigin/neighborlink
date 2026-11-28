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
  {
    const { page } = fixture(async () => reply);
    await page.load();
    page.input({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '本人草稿' } });
    page.onHide(); await page.onShow();
    results.push({ case: 'same-admin-return-keeps-community-draft',
      pass: page.data.authorized && page.data.community?._id === community._id && page.data.name === '本人草稿' });
  }
  {
    const oldRead = deferred();
    let reads = 0;
    const oldCommunity = { ...community, name: '管理员 A 的旧回读' };
    const newCommunity = { ...community, name: '管理员 B 的当前回读' };
    const { env, page } = fixture(async (_name, action) => {
      if (action !== 'managementConfig') return {};
      reads += 1;
      if (reads === 2) return oldRead.promise;
      return { ...reply, community: reads === 1 ? oldCommunity : newCommunity };
    });
    await page.load();
    const pending = page.refreshSavedCommunity(community._id);
    env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    await page.load();
    oldRead.resolve({ ...reply, community: oldCommunity });
    await pending;
    results.push({ case: 'old-save-readback-cannot-overwrite-new-admin',
      pass: page.ownerId === 'admin-b' && page.data.community?.name === newCommunity.name &&
        page.data.authorized && !page.data.refreshCommunityId });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; all CloudBase calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
