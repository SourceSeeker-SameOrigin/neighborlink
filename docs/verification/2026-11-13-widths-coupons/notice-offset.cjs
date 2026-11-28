const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function verify(count, hidden, expired, legacy) {
  const notices = Array.from({ length: count }, (_, i) => ({
    _id: 'notice' + i, communityId: 'c', status: 'live', createdAt: Date.now() - i,
    moderationHidden: i < hidden, endAt: i >= hidden && i < hidden + expired ? '2020-01-01T00:00:00Z' : null
  }));
  const cloud = fixture({ local: true, roles: ['resident', 'admin'], records: {
    communities: [{ _id: 'c', status: 'active' }], notices
  } });
  const offsets = [];
  const env = runtime(async (name, action, args) => {
    offsets.push(args.offset);
    const reply = await cloud.call(name, action, args);
    assert.equal(reply.ok, true);
    const data = reply.data;
    assert.equal(data.nextOffset, Math.min(args.offset + 20, count));
    if (legacy) delete data.nextOffset;
    return data;
  });
  env.app.globalData.user.communityId = 'c';
  const page = env.instance('miniprogram/notices/list/list.js');
  await page.onShow();
  for (let i = 0; i <= Math.ceil(count / 20) && page.data.hasMore; i++) await page.loadMore();
  assert.equal(page.data.hasMore, false);
  assert.equal(page.data.error, '');
  assert.deepEqual(Array.from(page.data.list, row => row._id), notices.slice(hidden + expired).map(row => row._id));
  assert.deepEqual(offsets, Array.from({ length: Math.floor(count / 20) + 1 }, (_, i) => i * 20));
  assert.equal(cloud.writes.length, 0);
}
(async () => {
  for (const legacy of [false, true]) {
    for (const args of [[0,0,0],[20,0,0],[24,1,0],[24,20,0],[24,0,20],[24,10,10],[44,20,20],[20,20,0]]) {
      await verify(...args, legacy);
    }
  }
  console.log('16/16：实际公告处理函数与页面，包含新旧协议、空批次、连续两批过滤、整页末页。');
})().catch(error => { console.error(error); process.exitCode = 1; });
