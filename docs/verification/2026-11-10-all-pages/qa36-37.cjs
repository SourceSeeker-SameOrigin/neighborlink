const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const event = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function setup(control = {}) {
  const downloads = [], opened = [];
  const r = runtime(async (name, action, data = {}) => {
    if (action === 'listCommunities') {
      if (control.listWait) await control.listWait;
      if (control.listFail) throw Error('合成列表失败');
      return { list: [{ _id: 'c1' }, { _id: 'c2' }], hasMore: false };
    }
    if (action === 'listProviders') return { list: [{ _id: 'p1' }], hasMore: false };
    if (action === 'adminList') return { list: [{ _id: 'm1' }], hasMore: false };
    if (action === 'getCommunity') {
      if (control.communityWait) await control.communityWait;
      if (control.communityFail) throw Error('合成小区失败');
      return { _id: data.communityId, stations: [{ code: 's1' }, { code: 's2' }] };
    }
    if (['exportCsv', 'exportSubsidyOrders', 'exportRecyclerStatement', 'exportStatement'].includes(action)) {
      if (control.exportWait) await control.exportWait;
      if (control.exportFail) throw Error('合成导出失败');
      return { tempFileURL: 'https://fixture.invalid/report.csv' };
    }
    throw Error('Unexpected action ' + action);
  });
  r.app.globalData.user = { _id: 'fixture', roles: control.roles || ['admin'], communityId: 'c1' };
  r.wx.downloadFile = options => { downloads.push(options); if (!control.holdDownload) options.success({ statusCode: 200, tempFilePath: 'synthetic.csv' }); };
  r.wx.openDocument = options => opened.push(options);
  const p = r.instance('miniprogram/admin/exports/exports.js');
  p.onLoad({ type: 'subsidy' });
  const exportCalls = () => r.requests.filter(x => x[1].startsWith('export'));
  return { r, p, downloads, opened, exportCalls };
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
}
(async () => {
  await test('QA36首次未就绪及列表失败均零导出请求', async () => {
    const { p, exportCalls } = setup({ listFail: true });
    await p.exportData(); await p.load(); await p.exportData();
    assert.equal(p.data.ready, false); assert.equal(p.data.loading, false);
    assert.equal(p.data.error, '合成列表失败'); assert.equal(exportCalls().length, 0);
  });
  await test('QA36无管理员资格零列表和导出请求', async () => {
    const { p, r } = setup({ roles: ['resident'] }); await p.load(); await p.exportData();
    assert.equal(p.data.ready, false); assert.equal(r.requests.length, 0);
  });
  await test('QA36重试仅读取并保留日期、类型、卖家草稿', async () => {
    const c = { listFail: true }, { p, exportCalls } = setup(c);
    p.setData({ from: '2026-10-01', to: '2026-10-20', typeIndex: 0, payeeIndex: 3, sellerOpenid: 'fixture_seller' });
    await p.load(); c.listFail = false; await p.load();
    assert.equal(p.data.ready, true); assert.equal(p.data.from, '2026-10-01');
    assert.equal(p.data.to, '2026-10-20'); assert.equal(p.data.typeIndex, 0);
    assert.equal(p.data.payeeIndex, 3); assert.equal(p.data.sellerOpenid, 'fixture_seller'); assert.equal(exportCalls().length, 0);
  });
  await test('QA36四类合法导出仍保持原接口和范围', async () => {
    const actions = ['exportCsv', 'exportSubsidyOrders', 'exportRecyclerStatement', 'exportStatement'];
    for (let i = 0; i < actions.length; i++) {
      const { p, exportCalls, opened } = setup(); await p.load(); p.select(event('typeIndex', i)); await p.exportData();
      assert.equal(exportCalls()[0][1], actions[i]); assert.equal(opened.length, 1);
      assert.equal(exportCalls()[0][2].from, p.data.from);
      if (i !== 1) assert.equal(exportCalls()[0][2].communityId, 'c1');
      if (i === 3) assert.equal(exportCalls()[0][2].stationCode, 's1');
    }
  });
  await test('QA36成功后重载失败不使用旧数据导出', async () => {
    const c = {}, { p, exportCalls } = setup(c); await p.load(); c.listFail = true;
    await p.load(); await p.exportData(); assert.equal(p.data.ready, false); assert.equal(exportCalls().length, 0);
  });
  await test('QA36小区读取中及失败均禁止导出，重试保留所选小区', async () => {
    const c = {}, { p, exportCalls } = setup(c); await p.load(); const gate = deferred();
    c.communityWait = gate.promise; c.communityFail = true;
    const pending = p.select(event('communityIndex', 1)); await p.exportData();
    assert.equal(p.data.ready, false); assert.equal(exportCalls().length, 0);
    gate.resolve(); await pending; assert.equal(p.data.error, '合成小区失败');
    c.communityFail = false; await p.load(); assert.equal(p.data.ready, true);
    assert.equal(p.data.communities[p.data.communityIndex]._id, 'c2'); assert.equal(exportCalls().length, 0);
  });
  await test('QA36同小区读取失败重试保留有效驿站草稿', async () => {
    const c = {}, { p } = setup(c); await p.load(); p.select(event('stationIndex', 1));
    c.communityFail = true; await p.load(); c.communityFail = false; await p.load();
    assert.equal(p.data.community.stations[p.data.stationIndex].code, 's2');
  });
  await test('QA36重复重载只发一轮读取', async () => {
    const gate = deferred(), { p, r } = setup({ listWait: gate.promise });
    const pending = p.load(); await p.load(); gate.resolve(); await pending;
    assert.equal(r.requests.filter(x => x[1] === 'listCommunities').length, 1);
  });
  await test('QA36列表响应离页后不更新也不继续读取小区', async () => {
    const gate = deferred(), { p, r } = setup({ listWait: gate.promise });
    const pending = p.load(); await Promise.resolve(); p.onUnload(); p.setData = () => { throw Error('late update'); };
    gate.resolve(); await pending; assert(!r.requests.some(x => x[1] === 'getCommunity'));
  });
  await test('QA36小区迟到成功失败均不更新已关闭页面', async () => {
    for (const fail of [false, true]) {
      const c = {}, { p } = setup(c); await p.load(); const gate = deferred();
      c.communityWait = gate.promise; c.communityFail = fail;
      const pending = p.select(event('communityIndex', 1)); p.onUnload(); p.setData = () => { throw Error('late update'); };
      gate.resolve(); await pending;
    }
  });
  await test('QA36导出期间重复点击和改条件被阻止', async () => {
    const c = {}, { p, exportCalls } = setup(c); await p.load(); const gate = deferred(); c.exportWait = gate.promise;
    const pending = p.exportData(); await p.exportData(); p.select(event('typeIndex', 3));
    assert.equal(p.data.typeIndex, 1); assert.equal(exportCalls().length, 1); gate.resolve(); await pending;
  });
  await test('QA36导出失败保留草稿，可明确重试', async () => {
    const c = { exportFail: true }, { p, exportCalls, opened } = setup(c); await p.load();
    const from = p.data.from; await p.exportData(); assert.equal(p.data.ready, true); assert.equal(p.data.from, from);
    c.exportFail = false; await p.exportData(); assert.equal(exportCalls().length, 2); assert.equal(opened.length, 1);
  });
  await test('QA36导出响应离页后不启动下载', async () => {
    const c = {}, { p, downloads } = setup(c); await p.load(); const gate = deferred(); c.exportWait = gate.promise;
    const pending = p.exportData(); p.onUnload(); p.setData = () => { throw Error('late update'); };
    gate.resolve(); await pending; assert.equal(downloads.length, 0);
  });
  await test('QA36下载中离页，迟到成功不打开文件', async () => {
    const { p, downloads, opened } = setup({ holdDownload: true }); await p.load();
    const pending = p.exportData(); for (let i = 0; i < 5 && !downloads.length; i++) await Promise.resolve();
    assert.equal(downloads.length, 1); p.onUnload(); p.setData = () => { throw Error('late update'); };
    downloads[0].success({ statusCode: 200, tempFilePath: 'synthetic.csv' }); await pending; assert.equal(opened.length, 0);
  });
  await test('QA37多卖家、同编号不同角色和小区行键唯一且重排稳定', async () => {
    const rows = [
      { payee: 'seller', communityId: 'c1', providerId: null, sellerOpenid: 'same' },
      { payee: 'seller', communityId: 'c1', providerId: null, sellerOpenid: 's2' },
      { payee: 'provider', communityId: 'c1', providerId: 'same' },
      { payee: 'merchant', communityId: 'c1', merchantId: 'same' },
      { payee: 'property', communityId: 'c1', providerId: null },
      { payee: 'seller', communityId: 'c2', providerId: null, sellerOpenid: 'same' }
    ].map(x => ({ ...x, total: 123, ledgerIds: ['fixture_ledger'] }));
    const r = runtime(async () => ({ rows })), p = r.instance('miniprogram/admin/settlements/settlements.js');
    r.app.globalData.user = { _id: 'fixture', roles: ['admin'] };
    p.visible = true; p._loadVersion = 1;
    p.readContext = { userId: 'fixture', isAdmin: true, version: 1 };
    p.setData({ ready: true, authorized: true, isAdmin: true, communities: [{ _id: 'c1', name: '合成小区' }], payeeIndex: 3 });
    await p.preview(); const first = p.data.preview.map(x => x.previewKey);
    assert.equal(new Set(first).size, rows.length); assert(p.data.preview.every(x => x.total === 123 && x.totalText === '1.23'));
    rows.reverse(); await p.preview(); assert.deepEqual(p.data.preview.map(x => x.previewKey), first.reverse());
    const template = fs.readFileSync('miniprogram/admin/settlements/settlements.wxml', 'utf8');
    assert(template.includes('wx:for="{{preview}}" wx:key="previewKey"'));
  });
  const report = { scope: 'Isolated synthetic data only; no cloud, files, roles, switches or financial writes', total: results.length, passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa36-37.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report)); if (report.passed !== report.total) process.exitCode = 1;
})();
