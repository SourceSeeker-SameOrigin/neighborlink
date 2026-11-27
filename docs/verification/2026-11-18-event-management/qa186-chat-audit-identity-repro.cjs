// Reproduce pending QA186 with the actual P27 page and intercepted CloudBase calls.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'admin-a', roles: ['admin'] };
const resident = { _id: 'resident-b', roles: ['resident'] };
const env = runtime(async (_name, action, data) => action === 'adminPull' ? {
  list: data.afterId ? [{ _id: 'message-b', content: '合成续页正文' }] :
    [{ _id: 'message-a', content: '合成审计正文', fileId: 'https://example.invalid/synthetic-image' }],
  lastId: data.afterId ? 'message-b' : 'message-a', hasMore: !data.afterId
} : {});
const previews = [];
env.wx.previewImage = options => previews.push(options);

(async () => {
  env.app.globalData.user = admin;
  const page = env.instance('miniprogram/admin/chat/chat.js');
  page.onLoad({ caseType: 'report', reportId: 'synthetic-report' });
  await page.onShow();
  assert.equal(page.data.messages.length, 1);
  const before = env.requests.length;
  env.app.globalData.user = resident;
  await page.preview({ currentTarget: { dataset: { url: 'https://example.invalid/synthetic-image' } } });
  await page.loadMore();
  const report = {
    scope: 'actual P27 page, synthetic identities and image; no real CloudBase calls',
    stalePreviewCount: previews.length,
    staleReadCalls: env.requests.slice(before).map(request => request[1]),
    oldTextStillVisible: page.data.messages.some(item => item.content === '合成审计正文')
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.stalePreviewCount, 1);
  assert.deepEqual(report.staleReadCalls, ['adminPull']);
  assert.equal(report.oldTextStillVisible, true);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
