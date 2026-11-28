// The actual export page runs with synthetic accounts and intercepted cloud/file APIs.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const community = { _id: 'synthetic-community', name: '联调小区', stations: [] };
function fixture(exportReply = { tempFileURL: 'https://example.invalid/synthetic.csv' }) {
  const env = runtime(async (name, action) => {
    if (action === 'listCommunities') return { list: [community], hasMore: false };
    if (action === 'listProviders' || action === 'adminList') return { list: [], hasMore: false };
    if (action === 'getCommunity') return community;
    if (action === 'exportSubsidyOrders') return exportReply;
    throw Error(`Unexpected API: ${name}.${action}`);
  });
  env.app.globalData.user = { _id: 'admin-a', communityId: community._id, roles: ['admin'] };
  let downloads = 0, opened = 0;
  env.wx.downloadFile = options => { downloads++; options.success({ statusCode: 200, tempFilePath: '/tmp/synthetic.csv' }); };
  env.wx.openDocument = () => { opened++; };
  const page = env.instance('miniprogram/admin/exports/exports.js');
  page.onLoad({ type: 'subsidy' });
  return { env, page, counts: () => ({ downloads, opened }) };
}

(async () => {
  const results = [];
  {
    const { page, counts } = fixture();
    await page.onShow();
    await page.exportData();
    results.push({ case: 'current-admin-can-export', pass: counts().opened === 1 });
  }
  {
    const { env, page, counts } = fixture();
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.exportData();
    results.push({ case: 'old-admin-button-cannot-export',
      pass: !env.requests.some(item => item[1] === 'exportSubsidyOrders') && counts().opened === 0 });
  }
  {
    const wait = deferred();
    const { env, page, counts } = fixture(wait.promise);
    await page.onShow();
    const exportTask = page.exportData();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve({ tempFileURL: 'https://example.invalid/synthetic.csv' });
    await exportTask;
    results.push({ case: 'late-export-result-does-not-download', pass: counts().downloads === 0 && counts().opened === 0 });
  }
  {
    const wait = deferred();
    const { page, counts } = fixture(wait.promise);
    await page.onShow();
    const exportTask = page.exportData();
    await pause();
    page.onHide();
    wait.resolve({ tempFileURL: 'https://example.invalid/synthetic.csv' });
    await exportTask;
    results.push({ case: 'late-export-after-hide-does-not-download', pass: counts().downloads === 0 && counts().opened === 0 });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities and intercepted APIs; no real CSV or cloud calls',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
