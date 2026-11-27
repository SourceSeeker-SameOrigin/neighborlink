// Actual P29 page with intercepted content API and synthetic records only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(action) {
  const records = [];
  let calls = 0;
  const env = runtime(async (name, operation, payload) => {
    if (operation === 'listCommunities') return { list: [{ _id: 'c1', name: '合成小区' }], hasMore: false };
    if (operation === 'getCommunity') return { _id: 'c1', status: 'active' };
    if (operation === 'listNotices' || operation === 'listAds') return { list: records.filter(row => row.action === operation) };
    assert.equal(name, 'content');
    assert.equal(operation, action);
    calls++;
    assert.equal(payload.noticeId || payload.adId, undefined);
    records.push({ action: action === 'saveNotice' ? 'listNotices' : 'listAds',
      _id: `synthetic-${records.length + 1}`, ...payload });
    if (calls === 1) throw Error('合成响应丢失，内容已保存');
    return action === 'saveNotice' ? { noticeId: records.at(-1)._id } : { adId: records.at(-1)._id };
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'], communityId: 'c1' };
  const page = env.instance('miniprogram/admin/content/content.js');
  await page.onLoad();
  if (action === 'saveNotice') page.setData({ title: '合成公告', body: '仅限隔离测试', endAt: '2027-01-01' });
  else page.setData({ adTitle: '合成广告', adImage: 'synthetic-file', adStart: '2027-01-01',
    adEnd: '2027-01-02', adPrice: '1.00' });
  await page[action]();
  assert.equal(records.length, 1);
  assert.equal(page.data.authorized, false);
  await page.load();
  assert.equal(page.data.authorized, true);
  await page[action]();
  assert.equal(records.length, 2);
  return { action, blockedBeforeReadback: true, afterReadbackRetry: records.length, calls };
}

(async () => {
  const cases = [await scenario('saveNotice'), await scenario('saveAd')];
  console.log(JSON.stringify({ scope: 'actual P29 page; synthetic writes only', cases }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
