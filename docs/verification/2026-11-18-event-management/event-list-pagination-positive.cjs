// Actual P48 page and event.list with 21 synthetic activities; no CloudBase writes.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const now = Date.now();
const events = Array.from({ length: 21 }, (_, index) => ({
  _id: 'event-' + String(index + 1).padStart(2, '0'), communityIds: ['c'],
  scope: 'community', organizerType: 'property', type: 'interest',
  title: '合成活动' + (index + 1), desc: '仅供分页检查', location: '测试区',
  status: 'published', capacity: 3, fee: 0, images: [],
  startAt: new Date(now + (index + 1) * 3600000),
  endAt: new Date(now + (index + 2) * 3600000),
  signupDeadline: new Date(now + 1800000), createdAt: new Date(now)
}));
const backend = fixture({ global: true, local: true, orderedQueries: true,
  records: { events } });
const ui = runtime(async (name, action, input) => {
  const response = await backend.call(name, action, input);
  if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
  return response.data;
});
ui.app.globalData.user = backend.data.users[0];

(async () => {
  const page = ui.instance('miniprogram/events/list/list.js');
  await page.onShow();
  assert.equal(page.data.list.length, 20);
  assert.equal(page.data.hasMore, true);
  await page.onReachBottom();
  assert.equal(page.data.list.length, 21);
  assert.equal(page.data.list[20]._id, 'event-21');
  assert.equal(page.data.hasMore, false);
  assert.equal(new Set(page.data.list.map(item => item._id)).size, 21);
  page.onHide();
  await page.onShow();
  assert.equal(page.data.list.length, 20);
  assert.equal(new Set(page.data.list.map(item => item._id)).size, 20);
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P48 and event.list; synthetic activities',
    firstPage: 20, afterMore: 21, lastSecondPageId: 'event-21',
    afterReturn: page.data.list.length, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
