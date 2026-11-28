// Isolated page tests; no real identities, cloud writes or role changes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const clone = value => JSON.parse(JSON.stringify(value));
const choices = [{ _id: 'demo', name: '测试甲' }, { _id: 'home', name: '测试乙' }];
const dates = { startDate: '2028-02-29', endDate: '2028-02-29', deadlineDate: '2028-02-28',
  title: '合成活动', desc: '合成说明', location: '合成地点', fee: '0', capacity: '1' };
function setup(roles = ['resident', 'admin'], callback) {
  const r = runtime(callback || (async (name, action, data) => {
    if (action === 'listCommunities') return { list: choices, hasMore: false };
    if (action === 'getCommunity') return choices[1];
    if (action === 'create') return { eventId: 'event_fixture' };
    if (action === 'adminList') return { list: [{ _id: data.communityId + '_event' }] };
    return {};
  }));
  r.app.globalData.user = { roles, communityId: 'home' };
  r.wx.pageScrollTo = () => {};
  const p = r.instance('miniprogram/events/manage/manage.js');
  return { r, p };
}
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); } }
(async () => {
  await test('管理员默认本人小区，切换只改页面目标', async () => {
    const { r, p } = setup(); await p.load(); assert.equal(p.data.communityId, 'home');
    p.setData({ title: '保留草稿', attendees: [{ signupId: 'old' }], scanCode: 'old' });
    await p.chooseCommunity({ detail: { value: '0' } });
    assert.equal(p.data.communityId, 'demo'); assert.equal(p.data.list[0]._id, 'demo_event');
    assert.equal(r.app.globalData.user.communityId, 'home'); assert.equal(p.data.title, '保留草稿');
    assert.equal(p.data.attendees.length, 0); assert.equal(p.data.scanCode, '');
    await p.load(); assert.equal(p.data.communityId, 'demo');
  });
  await test('创建传所选小区并保持免费一人参数，发布后仍保持所选小区', async () => {
    const { r, p } = setup(); await p.load(); await p.chooseCommunity({ detail: { value: 0 } });
    p.setData(dates); await p.createActivity();
    const create = r.requests.find(x => x[1] === 'create')[2];
    assert.deepEqual(clone(create.communityIds), ['demo']); assert.equal(create.fee, 0); assert.equal(create.capacity, 1);
    assert.equal(p.data.communityId, 'demo'); assert.equal(p.data.error, '');
    assert.equal(r.requests.filter(x => x[1] === 'publish').length, 1);
  });
  for (const role of ['property', 'merchant']) await test(role + '只获取本区，不允许页面切换', async () => {
    const { r, p } = setup([role]); await p.load();
    await p.chooseCommunity({ detail: { value: 0 } });
    assert.equal(p.data.communityId, 'home'); assert.equal(p.data.isAdmin, false);
    assert(!r.requests.some(x => x[1] === 'listCommunities')); p.setData({ ...dates, communityId: 'demo' });
    await p.createActivity(); assert.deepEqual(clone(r.requests.find(x => x[1] === 'create')[2].communityIds), ['home']);
  });
  await test('普通住户拒绝管理加载且不能创建', async () => {
    const { r, p } = setup(['resident']); await p.load(); await p.createActivity();
    assert.equal(r.requests.length, 0); assert.equal(p.data.ready, false); assert(p.data.error.includes('仅管理员'));
  });
  await test('空小区列表不请求活动且不能创建', async () => {
    const { r, p } = setup(['admin'], async () => ({ list: [] })); await p.load(); await p.createActivity();
    assert.equal(r.requests.length, 1); assert.equal(p.data.ready, false); assert.equal(p.data.communityId, '');
  });
  await test('分页小区完整加载并匹配本人默认值', async () => {
    const offsets = []; const { p } = setup(['admin'], async (name, action, data) => {
      if (action === 'listCommunities') { offsets.push(data.offset); return { list: [choices[data.offset]], hasMore: data.offset === 0 }; }
      return { list: [] };
    }); await p.load(); assert.deepEqual(offsets, [0, 1]); assert.equal(p.data.communityId, 'home');
  });
  await test('切换加载失败清旧记录、禁创建，重试仍是目标小区且保留草稿', async () => {
    let fail = false; const { r, p } = setup(['admin'], async (name, action, data) => {
      if (action === 'listCommunities') return { list: choices };
      if (fail) throw Error('合成读取失败');
      return { list: [{ _id: data.communityId }] };
    }); await p.load(); p.setData({ title: '草稿' }); fail = true;
    await p.chooseCommunity({ detail: { value: 0 } }); const count = r.requests.length; await p.createActivity();
    assert.equal(r.requests.length, count); assert.equal(p.data.ready, false); assert.equal(p.data.list.length, 0);
    assert.equal(p.data.error, '合成读取失败'); fail = false; await p.load();
    assert.equal(p.data.communityId, 'demo'); assert.equal(p.data.ready, true); assert.equal(p.data.title, '草稿');
  });
  for (const state of [{ busy: true }, { loading: true }]) await test('忙碌或加载中不能切换 ' + JSON.stringify(state), async () => {
    const { r, p } = setup(); await p.load(); const count = r.requests.length; p.setData(state);
    await p.chooseCommunity({ detail: { value: 0 } }); assert.equal(r.requests.length, count); assert.equal(p.data.communityId, 'home');
  });
  await test('迟到旧列表不覆盖新小区结果', async () => {
    let resolveOld; const { p } = setup(['admin'], async (name, action, data) => {
      if (action === 'listCommunities') return { list: choices };
      if (data.communityId === 'home') return new Promise(resolve => { resolveOld = resolve; });
      return { list: [{ _id: 'new_demo' }] };
    }); const old = p.load(); await new Promise(setImmediate); p.setData({ communityId: 'demo' }); await p.load();
    resolveOld({ list: [{ _id: 'old_home' }] }); await old;
    assert.equal(p.data.list[0]._id, 'new_demo'); assert.equal(p.data.communityId, 'demo');
  });
  const report = { scope: 'Isolated frontend handlers, not live role or business acceptance', total: results.length,
    passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa26.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
