// Verify QA185 with the actual P50 page and intercepted CloudBase calls.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'admin-a', roles: ['admin'], communityId: 'community-a' };
const resident = { _id: 'resident-b', roles: ['resident'], communityId: 'community-b' };
const env = runtime(async (_name, action, data) => {
  if (action === 'listCommunities') return { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
  if (action === 'adminList') return data.offset ?
    { list: [{ _id: 'older-event', status: 'published', title: '旧活动' }], hasMore: false } :
    { list: [{ _id: 'event-a', status: 'published', title: '管理员 A 的活动' }], hasMore: true };
  if (action === 'listSignups') return { list: [{ _id: 'signup-a', userId: 'synthetic-user' }], hasMore: false };
  return {};
});

(async () => {
  env.app.globalData.user = admin;
  const page = env.instance('miniprogram/events/manage/manage.js');
  await page.onShow();
  assert.equal(page.data.ready, true);
  const before = env.requests.length;
  env.app.globalData.user = resident;
  await page.loadMoreEvents();
  await page.showSignups({ currentTarget: { dataset: { id: 'event-a' } } });
  const staleCalls = env.requests.slice(before).map(request => request[1]);
  const report = { scope: 'actual P50 page, synthetic identities; all CloudBase calls intercepted',
    staleCalls, oldListStillVisible: page.data.list.some(item => item._id === 'event-a'),
    oldPageAppended: page.data.list.some(item => item._id === 'older-event'),
    oldRosterVisible: page.data.attendees.some(item => item._id === 'signup-a') };
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(staleCalls, []);
  assert.equal(report.oldListStillVisible, false);
  assert.equal(report.oldPageAppended, false);
  assert.equal(report.oldRosterVisible, false);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
