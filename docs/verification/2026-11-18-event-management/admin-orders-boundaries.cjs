// Actual admin order list with synthetic users and intercepted calls/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const order = { _id: 'synthetic-order', pricing: { payAmount: 500, goodsCap: 0 }, createdAt: '2026-11-27T00:00:00Z' };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/orders/orders.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => ({ list: [order], hasMore: false, readOnly: false }));
    await page.onShow();
    results.push({ case: 'normal-admin-read', pass: page.data.rows.length === 1 });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'listOrders' ? wait.promise : {});
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve({ list: [order], hasMore: false, readOnly: false });
    await read;
    results.push({ case: 'late-orders-after-identity-change', pass: page.data.rows.length === 0,
      observed: { rows: page.data.rows.length } });
  }
  {
    const wait = deferred();
    const { page } = fixture(async (name, action) => action === 'listOrders' ? wait.promise : {});
    const read = page.onShow();
    await pause();
    page.onHide();
    wait.resolve({ list: [order], hasMore: false, readOnly: false });
    await read;
    results.push({ case: 'late-orders-after-hide', pass: page.data.rows.length === 0 });
  }
  {
    const { env, page } = fixture(async () => ({ list: [order], hasMore: false, readOnly: false }));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    page.open({ currentTarget: { dataset: { id: order._id } } });
    results.push({ case: 'old-card-after-identity-change', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const { env, page } = fixture(async () => ({ list: [order], hasMore: false, readOnly: false }));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    results.push({ case: 'old-admin-export-link-after-identity-change', pass: page.data.isAdmin !== true,
      observed: { isAdmin: page.data.isAdmin } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; all CloudBase and navigation calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
