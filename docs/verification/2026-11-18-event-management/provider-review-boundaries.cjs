// Actual provider-review page with synthetic identities and intercepted admin calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const row = { _id: 'synthetic-provider', status: 'pending', certs: [] };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/providers/providers.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => ({ list: [row], hasMore: false }));
    await page.onShow();
    results.push({ case: 'normal-admin-read', pass: page.data.rows.length === 1 });
  }
  {
    const { env, page } = fixture(async () => ({ list: [row], hasMore: false }));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.review({ currentTarget: { dataset: { index: 0, level: 2 } } });
    results.push({ case: 'old-review-after-identity-change', pass: !env.requests.some(request => request[1] === 'reviewProvider'),
      observed: { reviewCalls: env.requests.filter(request => request[1] === 'reviewProvider').length } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'listProviders' ? wait.promise : {});
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve({ list: [row], hasMore: false });
    await read;
    results.push({ case: 'late-list-after-identity-change', pass: page.data.rows.length === 0,
      observed: { rows: page.data.rows.length } });
  }
  {
    const wait = deferred();
    const { page } = fixture(async (name, action) => action === 'listProviders' ? wait.promise : {});
    const read = page.onShow();
    await pause();
    page.onHide();
    wait.resolve({ list: [row], hasMore: false });
    await read;
    results.push({ case: 'late-list-after-hide', pass: page.data.rows.length === 0 });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities; all admin calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
