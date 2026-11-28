// Actual frontend handlers with synthetic cloud responses. No network or real writes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function test(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', message: e.message }); }
}
async function setup() {
  const mode = { failRead: false, failWrite: false, wrongCommunity: false, deferRead: null };
  const c = { _id: 'fixture', name: '云端名称', prices: {}, rates: {}, buildings: [] };
  let nextId = 0;
  const r = runtime(async (name, action, data) => {
    if (action === 'managementConfig') {
      if (mode.deferRead) await mode.deferRead;
      if (mode.failRead) throw Error('合成刷新失败');
      return { community: { ...c, _id: mode.wrongCommunity ? 'other' : c._id },
        communities: [{ _id: 'other', name: '另一小区' }, c], global: {} };
    }
    if (mode.failWrite) throw Error('合成保存失败');
    if (action === 'upsertBuilding') {
      const buildingId = data.buildingId || 'fixture_b' + (++nextId);
      c.buildings = [{ _id: buildingId, name: data.name, units: data.units }];
      return { buildingId };
    }
    return { communityId: c._id };
  });
  r.app.globalData.user = { _id: 'synthetic-admin', roles: ['admin'] };
  const p = r.instance('miniprogram/admin/community/community.js'), scrolls = [];
  const setData = p.setData;
  p.setData = function (patch, done) { setData.call(this, patch); if (done) done(); };
  r.wx.pageScrollTo = o => { assert(p.data.error || p.data.refreshError); scrolls.push(o); };
  await p.load(); r.requests.length = 0;
  p.setData({ name: '小区草稿', buildingName: '楼栋草稿', buildingUnits: '1单元', hotline: '全局草稿' });
  return { r, p, mode, scrolls, writes: () => r.requests.filter(x => x[1] !== 'managementConfig') };
}
(async () => {
  for (const method of ['addBuilding', 'saveCommunity']) {
    await test(method + '写成功读失败明确区分，保存按钮不再写入，重试只读', async () => {
      const { p, mode, writes, r, scrolls } = await setup(); mode.failRead = true;
      await p[method](); assert.equal(writes().length, 1); assert.equal(p.data.error, '');
      assert(p.data.refreshError.startsWith('已保存，刷新失败')); assert.equal(p.data.refreshCommunityId, 'fixture');
      if (method === 'addBuilding') assert.equal(p.data.buildingId, 'fixture_b1');
      for (const save of ['addBuilding', 'saveCommunity', 'saveGlobal']) await p[save]();
      assert.equal(writes().length, 1);
      await p.retrySavedRefresh(); assert.equal(writes().length, 1); assert.equal(r.requests.length, 3);
      assert.equal(p.data.saving, false); assert.equal(scrolls.length, 2);
      mode.failRead = false; await p.retrySavedRefresh();
      assert.equal(writes().length, 1); assert.equal(p.data.refreshError, ''); assert.equal(p.data.refreshCommunityId, '');
      assert.equal(p.data.name, '小区草稿'); assert.equal(p.data.buildingName, '楼栋草稿');
      assert.equal(p.data.buildingUnits, '1单元'); assert.equal(p.data.hotline, '全局草稿');
      assert.equal(p.data.communityIndex, 1);
    });
  }
  await test('刷新恢复后再次保存楼栋使用已返回ID；显式新建才清空', async () => {
    const { p, mode, writes } = await setup(); mode.failRead = true; await p.addBuilding();
    mode.failRead = false; await p.retrySavedRefresh(); p.setData({ buildingName: '修改草稿' }); await p.addBuilding();
    assert.equal(writes().length, 2); assert.equal(writes()[1][2].buildingId, 'fixture_b1');
    assert.equal(p.data.buildingId, 'fixture_b1'); p.newBuilding(); assert.equal(p.data.buildingId, '');
  });
  await test('直接保存及刷新成功保留其他三类草稿', async () => {
    const { p, writes } = await setup(); await p.addBuilding();
    assert.equal(p.data.refreshError, ''); assert.equal(p.data.name, '小区草稿'); assert.equal(p.data.hotline, '全局草稿');
    assert.equal(p.data.buildingId, 'fixture_b1'); assert.equal(p.data.community.buildings.length, 1);
    await p.saveCommunity(); assert.equal(writes().length, 2); assert.equal(p.data.buildingId, 'fixture_b1');
    assert.equal(p.data.buildingName, '楼栋草稿'); assert.equal(p.data.name, '小区草稿');
  });
  await test('写入失败仍属QA15，不进入已保存刷新状态', async () => {
    const { p, mode, r } = await setup(); mode.failWrite = true; await p.addBuilding();
    assert.equal(p.data.error, '合成保存失败'); assert.equal(p.data.refreshError, '');
    assert.equal(p.data.refreshCommunityId, ''); assert.equal(p.data.buildingId, '');
    assert.equal(r.requests.length, 1); await p.retrySavedRefresh(); assert.equal(r.requests.length, 1);
  });
  await test('重复点击刷新及保存仅执行一次读取', async () => {
    const { p, mode, r, writes } = await setup(); mode.failRead = true; await p.addBuilding();
    mode.failRead = false; let resolve;
    mode.deferRead = new Promise(r => { resolve = r; });
    const first = p.retrySavedRefresh(); await new Promise(setImmediate);
    await p.retrySavedRefresh(); await p.addBuilding(); await p.saveCommunity(); await p.saveGlobal();
    assert.equal(r.requests.length, 3); assert.equal(writes().length, 1);
    resolve(); await first; assert.equal(p.data.saving, false);
  });
  await test('迟到回读不覆盖其他小区', async () => {
    const { p, mode } = await setup(); let resolve;
    mode.deferRead = new Promise(r => { resolve = r; });
    const refresh = p.refreshSavedCommunity('fixture'); await new Promise(setImmediate);
    p.setData({ community: { _id: 'other' }, name: '另一小区草稿', refreshCommunityId: '', refreshError: '' });
    resolve(); await refresh; assert.equal(p.data.community._id, 'other'); assert.equal(p.data.name, '另一小区草稿');
  });
  await test('回读小区不匹配仍可只读重试且不覆盖草稿', async () => {
    const { p, mode } = await setup(); mode.wrongCommunity = true; await p.addBuilding();
    assert.equal(p.data.community._id, 'fixture'); assert(p.data.refreshError); assert.equal(p.data.name, '小区草稿');
    assert.equal(p.data.buildingId, 'fixture_b1');
  });
  await test('无权限或无待刷新记录不发请求', async () => {
    const { p, r } = await setup(); await p.retrySavedRefresh(); assert.equal(r.requests.length, 0);
    p.setData({ authorized: false, refreshCommunityId: 'fixture' }); await p.retrySavedRefresh(); assert.equal(r.requests.length, 0);
  });
  await test('模板提供只读重试，待刷新时禁用三个保存按钮', () => {
    const xml = fs.readFileSync('miniprogram/admin/community/community.wxml', 'utf8');
    assert(xml.includes('bindtap="retrySavedRefresh"')); assert(xml.includes('重试刷新（不重复保存）'));
    for (const action of ['saveCommunity', 'saveGlobal', 'addBuilding'])
      assert(xml.includes('bindtap="' + action + '" disabled="{{saving || refreshCommunityId}}"'));
  });
  const report = { scope: 'Isolated actual frontend handlers, synthetic responses only; no live cloud writes',
    total: results.length, passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa16.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
