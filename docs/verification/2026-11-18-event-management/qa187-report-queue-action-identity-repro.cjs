// Reproduce pending QA187 on the actual P26 page; no real CloudBase calls.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const row = { _id: 'synthetic-report', targetType: 'event', targetId: 'synthetic-event',
  communityId: 'community-a', authorUserId: 'synthetic-author', status: 'pending' };
const env = runtime(async (_name, action) => action === 'listReports' ?
  { list: [row], hasMore: false } : {});
const admin = { _id: 'admin-a', roles: ['admin'] };
const resident = { _id: 'resident-b', roles: ['resident'] };
const event = dataset => ({ currentTarget: { dataset } });

(async () => {
  env.app.globalData.user = admin;
  const page = env.instance('miniprogram/admin/reports/reports.js');
  await page.onShow();
  assert.equal(page.data.rows.length, 1);
  const start = env.requests.length;
  env.app.globalData.user = resident;
  page.openChat(event({ index: 0 }));
  await page.resolve(event({ index: 0, status: 'upheld' }));
  await page.moderate(event({ index: 0, kind: 'hide' }));
  await page.moderate(event({ index: 0, kind: 'mute' }));
  const staleActions = env.requests.slice(start).map(request => request[1]);
  const staleNavigation = env.navigation.map(item => item[1]);
  const afterSwitch = { staleActions, staleNavigation,
    oldRowsStillVisible: page.data.rows.some(item => item._id === row._id) };

  env.app.globalData.user = admin;
  const hidden = env.instance('miniprogram/admin/reports/reports.js');
  await hidden.onShow();
  hidden.onHide();
  const hiddenStart = env.requests.length;
  await hidden.resolve(event({ index: 0, status: 'dismissed' }));
  const hiddenActions = env.requests.slice(hiddenStart).map(request => request[1]);

  let releaseRead;
  const lateEnv = runtime(async (_name, action) => action === 'listReports' ?
    new Promise(resolve => { releaseRead = () => resolve({ list: [row], hasMore: false }); }) : {});
  lateEnv.app.globalData.user = admin;
  const latePage = lateEnv.instance('miniprogram/admin/reports/reports.js');
  const pendingRead = latePage.onShow();
  lateEnv.app.globalData.user = resident;
  releaseRead();
  await pendingRead;
  const oldReadFilledNewIdentity = latePage.data.rows.some(item => item._id === row._id);
  const report = { scope: 'actual P26 page, synthetic identities and report; API intercepted',
    ...afterSwitch, hiddenActions, oldReadFilledNewIdentity };
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(staleActions.filter(action => action !== 'listReports'),
    ['resolveReport', 'moderateContent', 'moderateUser']);
  assert.equal(staleNavigation.length, 1);
  assert.equal(afterSwitch.oldRowsStillVisible, true);
  assert.deepEqual(hiddenActions.filter(action => action !== 'listReports'), ['resolveReport']);
  assert.equal(oldReadFilledNewIdentity, true);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
