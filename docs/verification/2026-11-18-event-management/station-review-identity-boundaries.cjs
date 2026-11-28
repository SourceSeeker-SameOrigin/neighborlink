// Actual station-review page with synthetic identities and intercepted cloud writes.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const application = { _id: 'synthetic-application', stationName: '合成驿站' };
function fixture() {
  const env = runtime(async (name, action) => {
    if (action === 'listApplications') return { list: [application], hasMore: false };
    if (action === 'reviewApplication') return {};
    throw Error(`Unexpected API ${name}.${action}`);
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/stations/stations.js');
  return { env, page };
}
const event = { currentTarget: { dataset: { index: 0, status: 'approved' } } };
(async () => {
  const results = [];
  {
    const { env, page } = fixture();
    env.wx.showModal = options => options.success({ confirm: true });
    await page.onShow();
    await page.review(event);
    results.push({ case: 'current-admin-approval', pass: env.requests.filter(item => item[1] === 'reviewApplication').length === 1 });
  }
  {
    const { env, page } = fixture();
    env.wx.showModal = options => options.success({ confirm: true });
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.review(event);
    results.push({ case: 'old-button-after-identity-change', pass: !env.requests.some(item => item[1] === 'reviewApplication') });
  }
  {
    const { env, page } = fixture();
    let confirm;
    env.wx.showModal = options => { confirm = options.success; };
    await page.onShow();
    const review = page.review(event);
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    confirm({ confirm: true });
    await review;
    results.push({ case: 'old-confirm-after-identity-change', pass: !env.requests.some(item => item[1] === 'reviewApplication') });
  }
  {
    const { env, page } = fixture();
    let confirm;
    env.wx.showModal = options => { confirm = options.success; };
    await page.onShow();
    const review = page.review(event);
    page.onHide();
    confirm({ confirm: true });
    await review;
    results.push({ case: 'old-confirm-after-hide', pass: !env.requests.some(item => item[1] === 'reviewApplication') });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities and intercepted station calls',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
