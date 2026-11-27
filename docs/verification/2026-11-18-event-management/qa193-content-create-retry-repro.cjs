// Actual P29 page with intercepted content API and synthetic records only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

async function scenario(action) {
  const records = [];
  let calls = 0;
  const env = runtime(async (name, operation, payload) => {
    if (operation === 'listCommunities') return { list: [{ _id: 'c1', name: '合成小区' }], hasMore: false };
    if (operation === 'getCommunity') return { _id: 'c1', status: 'active' };
    if (operation === 'listNotices' || operation === 'listAds') return { list: records.filter(row => row.action === operation) };
    assert.equal(name, 'content');
    if (operation === 'lookupCreate') return { recordId: records.find(row => row.requestId === payload.requestId)?._id || null };
    assert.equal(operation, action);
    calls++;
    assert.equal(payload.noticeId || payload.adId, undefined);
    let record = records.find(row => row.requestId === payload.requestId);
    if (!record) {
      record = { action: action === 'saveNotice' ? 'listNotices' : 'listAds',
        _id: `synthetic-${records.length + 1}`, ...payload };
      records.push(record);
    }
    if (calls === 1) throw Error('合成响应丢失，内容已保存');
    return action === 'saveNotice' ? { noticeId: record._id } : { adId: record._id };
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
  assert.equal(page.data[action === 'saveNotice' ? 'createdNoticeId' : 'createdAdId'], records[0]._id);
  await page[action]();
  assert.equal(records.length, 1);
  page.onUnload();
  const reopened = env.instance('miniprogram/admin/content/content.js');
  await reopened.onLoad();
  await reopened[action]();
  assert.equal(records.length, 1);
  reopened.startNewCreate({ currentTarget: { dataset: { kind: action === 'saveNotice' ? 'notice' : 'ad' } } });
  if (action === 'saveNotice') reopened.setData({ title: '第二条公告', body: '仅限隔离测试', endAt: '2027-01-01' });
  else reopened.setData({ adTitle: '第二条广告', adImage: 'synthetic-file', adStart: '2027-01-01',
    adEnd: '2027-01-02', adPrice: '1.00' });
  await reopened[action]();
  assert.equal(records.length, 2);
  return { action, blockedBeforeReadback: true, afterReadbackRetry: 1, explicitNew: records.length, calls };
}

(async () => {
  const cases = [await scenario('saveNotice'), await scenario('saveAd')];
  const cloud = fixture({ roles: ['admin'], allowWrites: true,
    securityResult: { result: { suggest: 'pass' } } });
  const notice = { requestId: 'notice-request-01', communityId: 'c', title: '合成公告', body: '仅限隔离测试',
    endAt: '2026-12-01T23:59:59+08:00', pinned: false,
    imageFileId: 'cloud://offline/notices/u/test.jpg' };
  const firstNotice = await cloud.call('content', 'saveNotice', notice);
  assert.equal(firstNotice.ok, true, JSON.stringify(firstNotice));
  assert.equal(cloud.signed.length, 1);
  const savedNotice = cloud.data.notices.pop();
  cloud.faults.beforeTransaction = data => data.notices.push(savedNotice);
  const racedNotice = await cloud.call('content', 'saveNotice', notice);
  assert.equal(racedNotice.data.noticeId, firstNotice.data.noticeId);
  assert.equal(cloud.signed.length, 1, '并发公告重试不得再次提交图片审核');
  cloud.data.config[0].contentBlacklist = ['合成公告'];
  const replayNotice = await cloud.call('content', 'saveNotice', notice);
  assert.equal(cloud.signed.length, 1, '公告重试不得再次提交图片审核');
  const changedNotice = await cloud.call('content', 'saveNotice', { ...notice, title: '不同公告' });
  assert.equal(firstNotice.ok, true); assert.equal(replayNotice.data.noticeId, firstNotice.data.noticeId);
  assert.equal(changedNotice.code, 'E_CONFLICT'); assert.equal(cloud.data.notices.length, 1);
  cloud.data.config[0].contentBlacklist = [];
  const ad = { requestId: 'ad-request-01', title: '合成广告', imageFileId: 'cloud://offline/ads/u/test.jpg',
    slot: 'home_banner', communityIds: ['c'], startAt: '2026-12-01T00:00:00+08:00',
    endAt: '2026-12-02T00:00:00+08:00', target: { type: 'page', path: '/shops/list/list' },
    price: 100, status: 'draft' };
  const firstAd = await cloud.call('content', 'saveAd', ad);
  assert.equal(firstAd.ok, true, JSON.stringify(firstAd));
  assert.equal(cloud.signed.length, 2);
  const savedAd = cloud.data.ads.pop();
  cloud.faults.beforeTransaction = data => data.ads.push(savedAd);
  const racedAd = await cloud.call('content', 'saveAd', ad);
  assert.equal(racedAd.data.adId, firstAd.data.adId);
  assert.equal(cloud.signed.length, 2, '并发广告重试不得再次提交图片审核');
  cloud.data.config[0].contentBlacklist = ['合成广告'];
  const replayAd = await cloud.call('content', 'saveAd', ad);
  assert.equal(cloud.signed.length, 2, '广告重试不得再次提交图片审核');
  const changedAd = await cloud.call('content', 'saveAd', { ...ad, price: 200 });
  assert.equal(firstAd.ok, true, JSON.stringify(firstAd)); assert.equal(replayAd.data.adId, firstAd.data.adId);
  assert.equal(changedAd.code, 'E_CONFLICT'); assert.equal(cloud.data.ads.length, 1);
  const found = await cloud.call('content', 'lookupCreate', { kind: 'ad', requestId: ad.requestId });
  assert.equal(found.data.recordId, firstAd.data.adId);
  for (const [action, payload, collection, idKey] of [
    ['saveNotice', notice, 'notices', 'noticeId'], ['saveAd', ad, 'ads', 'adId']]) {
    const retryCloud = fixture({ roles: ['admin'], allowWrites: true,
      securityResult: { result: { suggest: 'pass' } } });
    const mediaCheck = retryCloud.cloud.openapi.security.mediaCheckAsync;
    retryCloud.cloud.openapi.security.mediaCheckAsync = async () => { throw Error('synthetic review outage'); };
    const first = await retryCloud.call('content', action, payload);
    assert.equal(first.ok, false);
    assert.equal(retryCloud.data[collection].length, 1);
    assert.equal(retryCloud.data[collection][0].moderationPendingFileIds.length, 0);
    retryCloud.cloud.openapi.security.mediaCheckAsync = mediaCheck;
    const recovered = await retryCloud.call('content', action, payload);
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.data[idKey], retryCloud.data[collection][0]._id);
    assert.equal(retryCloud.signed.length, 2, '图片审核失败后应只补送一次');
    await retryCloud.call('content', action, payload);
    assert.equal(retryCloud.signed.length, 2, '已补送的审核不应重复');
  }
  console.log(JSON.stringify({ scope: 'actual P29 page and content entry; synthetic writes only', cases,
    noticeReplay: firstNotice.data.noticeId === replayNotice.data.noticeId,
    adReplay: firstAd.data.adId === replayAd.data.adId,
    changedIntentRejected: [changedNotice.code, changedAd.code],
    adMediaOwnershipAccepted: firstAd.ok && cloud.data.mediaChecks.length > 0,
    reviewFailureRecovered: true }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
