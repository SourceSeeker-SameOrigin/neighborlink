// Isolated frontend tests only. No live cloud requests or activity publishing.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const dates = { startDate: '2028-02-29', endDate: '2028-02-29', deadlineDate: '2028-02-28' };
function setup(call) {
  const r = runtime(call), scrolls = [];
  const p = r.instance('miniprogram/events/manage/manage.js');
  const setData = p.setData;
  p.setData = function (patch, done) { setData.call(this, patch); if (done) done(); };
  r.wx.pageScrollTo = options => { assert(p.data.error); scrolls.push(options); };
  r.app.globalData.user = { _id: 'qa14-user', roles: ['property'], communityId: 'fixture_community' };
  p.userId = 'qa14-user'; p.storageKey = 'event-creation:qa14-user';
  p.setData({ ready: true, loading: false, communityId: 'fixture_community', ...dates, title: '合成草稿', desc: '保留说明', location: '合成地点', fee: '12.34' });
  return { r, p, scrolls };
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', message: e.message }); }
}
(async () => {
  for (const field of Object.keys(dates)) await test('缺少日期保留输入、拒绝请求并滚动 ' + field, async () => {
    const { r, p, scrolls } = setup(); p.setData({ [field]: '' });
    await p.createActivity();
    assert.equal(r.requests.length, 0); assert(p.data.error.startsWith('请选择'));
    assert.equal(p.data.errorFromForm, true); assert.equal(p.data.busy, false);
    assert.equal(p.data.title, '合成草稿'); assert.equal(p.data.fee, '12.34');
    assert.deepEqual(scrolls.map(o => o.scrollTop), [0]);
  });
  await test('非法日期拒绝并滚动', async () => {
    const { r, p, scrolls } = setup(); p.setData({ startDate: '2027-02-29' }); await p.createActivity();
    assert.equal(r.requests.length, 0); assert(p.data.error.includes('不存在')); assert.equal(scrolls.length, 1);
  });
  await test('服务端拒绝保留草稿且不自动发布重试', async () => {
    const { r, p, scrolls } = setup(async () => { throw Error('合成拒绝'); });
    await p.createActivity(); assert.equal(r.requests.length, 1); assert.equal(r.requests[0][1], 'create');
    assert.equal(p.data.error, '合成拒绝'); assert.equal(p.data.location, '合成地点');
    assert.equal(p.data.startDate, dates.startDate); assert.equal(p.data.errorFromForm, true); assert.equal(scrolls.length, 1);
  });
  await test('忙碌时不重复请求或滚动', async () => {
    const { r, p, scrolls } = setup(); p.setData({ busy: true }); await p.createActivity();
    assert.equal(r.requests.length, 0); assert.equal(scrolls.length, 0);
  });
  await test('列表失败仍可重试，成功后清除错误并保留草稿', async () => {
    let fail = true;
    const { p, scrolls } = setup(async () => { if (fail) throw Error('列表失败'); return { _id: 'fixture_community', list: [] }; });
    p.setData({ errorFromForm: true }); await p.load();
    assert.equal(p.data.errorFromForm, false); assert.equal(p.data.error, '列表失败');
    fail = false; await p.load(); assert.equal(p.data.error, ''); assert.equal(p.data.title, '合成草稿');
    assert.equal(scrolls.length, 0);
  });
  await test('其他操作错误恢复原重试展示', async () => {
    const { p } = setup(); p.setData({ errorFromForm: true, list: [{ _id: 'fixture', status: 'published' }] });
    await p.checkin({ currentTarget: { dataset: { id: 'fixture' } } });
    assert.equal(p.data.errorFromForm, false); assert.equal(p.data.error, '请先扫描活动签到码');
  });
  await test('模板只在非表单错误显示列表重试', () => {
    const xml = fs.readFileSync('miniprogram/events/manage/manage.wxml', 'utf8');
    assert(xml.includes('<button wx:if="{{!errorFromForm}}" bindtap="load">重试</button>'));
  });
  const report = { scope: 'Isolated actual frontend methods; no live business acceptance', total: results.length,
    passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa14.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
