// Executes actual content entry against an in-memory fixture, never the live cloud.
const assert = require('assert');
const fs = require('fs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const results = [];
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); } }
const future = () => new Date(Date.now() + 2 * 86400000).toISOString();
function setup({ roles = ['resident', 'admin'], decision = 'pass', adPatch = {} } = {}) {
  const communityId = (adPatch.communityIds || ['demo_fixture'])[0];
  const image = adPatch.imageFileId || 'cloud://fixture.bucket/ads/u/fixture.jpg';
  return fixture({ local: true, roles, allowWrites: true, securityResult: { result: { suggest: decision } }, records: {
    communities: [{ _id: 'c', status: 'active', features: { notices: true } }, { _id: communityId, status: 'active' }],
    notices: [{ _id: 'n', communityId: 'c', status: 'live' }],
    ads: [{ _id: 'a', communityIds: [communityId], status: 'draft', price: 100, imageFileId: image,
      createdBy: 'actor', mediaOwnerOpenid: 'actor', moderationApprovedFileIds: [image] }]
  } });
}
const notice = () => ({ noticeId: 'n', communityId: 'c', title: '验收测试公告', body: '这是纯文字的合成测试内容。', endAt: future() });
const ad = () => ({ adId: 'a', title: '合成广告标题', slot: 'home_banner', imageFileId: 'cloud://fixture.bucket/ads/u/fixture.jpg',
  communityIds: ['demo_fixture'], startAt: new Date().toISOString(), endAt: future(), price: 100, status: 'draft',
  target: { type: 'page', path: '/shops/list/list' } });
(async () => {
  for (const patch of [{}, { title: '题'.repeat(80) }, { body: '文'.repeat(2000) }]) await test('合法公告及长度上限 ' + Object.keys(patch), async () => {
    const f = setup(), input = { ...notice(), ...patch }, result = await f.call('content', 'saveNotice', input);
    assert(result.ok, JSON.stringify(result)); assert.equal(f.data.notices[0].title, input.title); assert.equal(f.data.notices[0].body, input.body);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].table, 'notices');
  });
  for (const patch of [{ title: '' }, { title: '  ' }, { title: '题'.repeat(81) }, { body: '' }, { body: ' ' }, { body: '文'.repeat(2001) }]) await test('无效公告零写入 ' + Object.keys(patch) + ':' + Object.values(patch)[0].length, async () => {
    const f = setup(), result = await f.call('content', 'saveNotice', { ...notice(), ...patch });
    assert.equal(result.code, 'E_INVALID_PARAM'); assert.equal(f.writes.length, 0);
  });
  for (const patch of [{}, { title: '题'.repeat(80) }, { imageFileId: 'cloud://fixture.bucket/ads/u/' + 'a'.repeat(500 - 'cloud://fixture.bucket/ads/u/'.length) }, { communityIds: ['c'.repeat(100)] }]) await test('合法广告保留原图片审核与金额 ' + Object.keys(patch), async () => {
    const f = setup({ adPatch: patch }), input = { ...ad(), ...patch }, result = await f.call('content', 'saveAd', input);
    assert(result.ok, JSON.stringify(result)); assert.equal(f.data.ads[0].title, input.title); assert.equal(f.data.ads[0].imageFileId, input.imageFileId);
    assert.equal(f.data.ads[0].moderationApprovedFileIds[0], input.imageFileId); assert.equal(f.data.ads[0].price, 100);
    assert(f.writes.every(w => w.table === 'ads'));
  });
  for (const patch of [{ title: '' }, { title: ' ' }, { title: '题'.repeat(81) }, { imageFileId: '' }, { imageFileId: ' ' },
    { imageFileId: 'x'.repeat(501) }, { communityIds: [''] }, { communityIds: [' '] }, { communityIds: ['c'.repeat(101)] }]) await test('无效广告零写入 ' + Object.keys(patch) + ':' + String(Object.values(patch)[0]).length, async () => {
    const f = setup(), result = await f.call('content', 'saveAd', { ...ad(), ...patch });
    assert.equal(result.code, 'E_INVALID_PARAM'); assert.equal(f.writes.length, 0);
  });
  for (const action of ['saveNotice', 'saveAd']) {
    await test(action + '内容审核拒绝零写入', async () => {
      const f = setup({ decision: 'risky' }), result = await f.call('content', action, action === 'saveNotice' ? notice() : ad());
      assert.equal(result.code, 'E_BLOCKED'); assert.equal(f.writes.length, 0);
    });
    await test(action + '普通住户无权写入', async () => {
      const f = setup({ roles: ['resident'] }), result = await f.call('content', action, action === 'saveNotice' ? notice() : ad());
      assert.equal(result.code, 'E_FORBIDDEN'); assert.equal(f.writes.length, 0);
    });
  }
  const report = { scope: 'Isolated actual entry; ad uses existing unchanged synthetic media, no cloud/media/payment writes', total: results.length,
    passed: results.filter(r => r.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa28.json', JSON.stringify(report, null, 2) + '\n'); console.log(report);
  process.exitCode = report.total === report.passed ? 0 : 1;
})();
