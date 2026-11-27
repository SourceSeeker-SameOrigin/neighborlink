// Isolated real page methods, synthetic API responses; no live configuration writes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function test(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); }
}
async function setup() {
  let writeFails = true, readFails = false;
  const c = { _id: 'fixture', name: '合成小区', prices: {}, rates: {}, buildings: [] };
  const r = runtime(async (name, action) => {
    if (action === 'managementConfig') {
      if (readFails) throw Error('合成加载失败');
      return { communities: [c], community: c, global: {} };
    }
    if (writeFails) throw Error('合成保存失败');
    return {};
  });
  r.app.globalData.user = { _id: 'synthetic-admin', roles: ['admin'] };
  const p = r.instance('miniprogram/admin/community/community.js'), scrolls = [];
  const setData = p.setData;
  p.setData = function (patch, done) { setData.call(this, patch); if (done) done(); };
  r.wx.pageScrollTo = options => { assert(p.data.error); scrolls.push(options); };
  await p.load(); r.requests.length = 0;
  p.setData({ name: '未保存名称', buildingName: '未保存楼栋', buildingUnits: '1单元', hotline: '合成热线草稿' });
  return { r, p, scrolls, writesSucceed: () => { writeFails = false; }, readsFail: value => { readFails = value; } };
}
(async () => {
  for (const [method, action] of [['saveCommunity', 'updateCommunity'], ['saveGlobal', 'updateConfig'], ['addBuilding', 'upsertBuilding']]) {
    await test(method + '失败保留三类输入、滚顶、隐藏重载；原按钮可重试', async () => {
      const { r, p, scrolls, writesSucceed } = await setup();
      await p[method]();
      assert.equal(p.data.error, '合成保存失败'); assert.equal(p.data.canReload, false); assert.equal(p.data.saving, false);
      for (const [key, value] of Object.entries({ name: '未保存名称', buildingName: '未保存楼栋', buildingUnits: '1单元', hotline: '合成热线草稿' })) assert.equal(p.data[key], value);
      assert.deepEqual(r.requests.map(x => x[1]), [action]); assert.deepEqual(scrolls.map(x => x.scrollTop), [0]);
      writesSucceed(); await p[method]();
      assert.equal(p.data.error, ''); assert.equal(p.data.canReload, false); assert.equal(p.data.saving, false);
      const writes = r.requests.filter(x => x[1] === action); assert.equal(writes.length, 2);
      assert.equal(JSON.stringify(writes[0][2]), JSON.stringify(writes[1][2]));
      assert.equal(p.data.hotline, '合成热线草稿'); assert.equal(scrolls.length, 1);
    });
  }
  await test('小区本地费率校验失败无API写入且保留输入', async () => {
    const { r, p, scrolls } = await setup(); p.setData({ platformRate: '0.2', propertyRate: '' });
    await p.saveCommunity(); assert.equal(r.requests.length, 0); assert(p.data.error.includes('同时填写'));
    assert.equal(p.data.platformRate, '0.2'); assert.equal(p.data.canReload, false); assert.equal(scrolls.length, 1);
  });
  await test('全局本地数字校验失败无API写入', async () => {
    const { r, p, scrolls } = await setup(); p.setData({ globalRows: [{ key: 'fixture', label: '合成数字', value: 'bad' }] });
    await p.saveGlobal(); assert.equal(r.requests.length, 0); assert.equal(p.data.globalRows[0].value, 'bad');
    assert.equal(p.data.canReload, false); assert.equal(scrolls.length, 1);
  });
  await test('加载失败保留重载入口并可恢复', async () => {
    const { p, readsFail, scrolls } = await setup(); readsFail(true); await p.load();
    assert.equal(p.data.canReload, true); assert.equal(p.data.error, '合成加载失败');
    readsFail(false); await p.load(); assert.equal(p.data.error, ''); assert.equal(p.data.canReload, false);
    assert.equal(scrolls.length, 0);
  });
  await test('切换加载失败显示重载而不当作保存失败', async () => {
    const { p, readsFail } = await setup(); readsFail(true);
    await p.chooseCommunity({ detail: { value: '0' } });
    assert.equal(p.data.canReload, true); assert.equal(p.data.name, '未保存名称'); assert.equal(p.data.loading, false);
  });
  await test('三类保存忙碌和无权限时不发请求', async () => {
    const { r, p, scrolls } = await setup();
    for (const state of [{ saving: true }, { saving: false, authorized: false }]) {
      p.setData(state); for (const method of ['saveCommunity', 'saveGlobal', 'addBuilding']) await p[method]();
    }
    assert.equal(r.requests.length, 0); assert.equal(scrolls.length, 0);
  });
  await test('模板仅加载错误提供重新加载', () => {
    const xml = fs.readFileSync('miniprogram/admin/community/community.wxml', 'utf8');
    assert(xml.includes('<button wx:if="{{canReload}}" bindtap="load" disabled="{{saving}}">重新加载</button>'));
  });
  const report = { scope: 'Isolated frontend regression; no live cloud writes', total: results.length,
    passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa15.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
