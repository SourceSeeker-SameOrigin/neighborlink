// Actual admin coupon page with synthetic users and intercepted cloud calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const template = { _id: 'synthetic-template', name: '联调样券', kind: 'amount_off', issueMode: 'claim',
  services: ['all'], communityIds: 'all', status: 'active' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/coupons/coupons.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => ({ list: [template] }));
    await page.load();
    results.push({ case: 'normal-admin-read', pass: page.data.rows.length === 1 });
  }
  {
    const { env, page } = fixture(async () => ({ list: [template] }));
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.load();
    results.push({ case: 'denied-recheck-clears-old-template', pass: page.data.rows.length === 0,
      observed: { rows: page.data.rows.length, error: page.data.error } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'adminTemplates' ? wait.promise : { list: [template] });
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve({ list: [template] });
    await read;
    results.push({ case: 'late-template-after-identity-change', pass: page.data.rows.length === 0,
      observed: { rows: page.data.rows.length } });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'adminTemplates' ? { list: [template] } : {});
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.toggleStatus({ currentTarget: { dataset: { index: 0 } } });
    results.push({ case: 'old-toggle-after-identity-change', pass: !env.requests.some(request => request[1] === 'saveTemplate'),
      observed: { saveCalls: env.requests.filter(request => request[1] === 'saveTemplate').length } });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'adminTemplates' ? { list: [template] } : {});
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.save();
    results.push({ case: 'old-save-after-identity-change', pass: !env.requests.some(request => request[1] === 'saveTemplate'),
      observed: { saveCalls: env.requests.filter(request => request[1] === 'saveTemplate').length } });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'adminTemplates' ? { list: [template] } :
      { issued: 1, duplicates: 0, failures: [] });
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.issue();
    results.push({ case: 'old-issue-after-identity-change', pass: !env.requests.some(request => request[1] === 'manualIssue'),
      observed: { issueCalls: env.requests.filter(request => request[1] === 'manualIssue').length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; all coupon calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
