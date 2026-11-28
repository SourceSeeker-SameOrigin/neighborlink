const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const event = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
function setup(control = {}) {
  const r = runtime(async (name, action, data = {}) => {
    if (action === 'listCommunities') {
      if (control.listFail) throw Error('合成读取失败');
      return { list: [{ _id: 'c1' }, { _id: 'c2' }], hasMore: false };
    }
    if (action === 'listProviders') return { list: control.emptyProvider ? [] : [{ _id: 'p1' }], hasMore: false };
    if (action === 'adminList') return { list: control.emptyMerchant ? [] : [{ _id: 'm1' }], hasMore: false };
    if (action === 'getCommunity') {
      if (control.communityFail) throw Error('合成小区读取失败');
      return { _id: data.communityId, stations: control.emptyStation ? [] : [{ code: 's1' }, { code: 's2' }] };
    }
    if (action.startsWith('export')) {
      if (control.exportFail) throw Error('该功能暂未开放');
      return { tempFileURL: 'https://fixture.invalid/synthetic.csv' };
    }
    throw Error('unexpected ' + action);
  });
  r.app.globalData.user = { roles: ['admin'], communityId: 'c1' };
  r.wx.downloadFile = o => control.downloadFail ? o.fail(Error('合成下载失败')) : o.success({ statusCode: 200, tempFilePath: 'synthetic.csv' });
  r.wx.openDocument = () => {};
  const p = r.instance('miniprogram/admin/exports/exports.js'); p.onLoad({});
  const exports = () => r.requests.filter(x => x[1].startsWith('export'));
  return { p, r, exports };
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
}
(async () => {
  await test('录屏路径：无服务员明确拒绝，改物业清旧错但不自动导出', async () => {
    const { p, exports } = setup({ emptyProvider: true }); await p.load(); await p.exportData();
    assert.equal(p.data.errorKind, 'validation'); assert(p.data.error.includes('服务员')); assert.equal(exports().length, 0);
    p.select(event('payeeIndex', 1)); assert.equal(p.data.error, ''); assert.equal(p.data.errorKind, ''); assert.equal(exports().length, 0);
    await p.exportData(); assert.equal(exports()[0][2].payee, 'property');
  });
  await test('无商家、无驿站、缺小区、非法日期分别指出原因且零导出', async () => {
    for (const kind of ['merchant', 'station', 'community', 'date']) {
      const { p, exports } = setup({ emptyMerchant: true, emptyStation: true }); await p.load();
      if (kind === 'merchant') p.select(event('payeeIndex', 2));
      if (kind === 'station') p.select(event('typeIndex', 3));
      if (kind === 'community') p.setData({ communities: [] });
      if (kind === 'date') p.select(event('from', '2099-01-01'));
      await p.exportData(); assert.equal(p.data.errorKind, 'validation');
      assert(p.data.error.includes({ merchant: '商家', station: '驿站', community: '小区', date: '日期' }[kind]));
      assert.equal(exports().length, 0);
    }
  });
  await test('列表失败的重新加载仅读取且保留草稿', async () => {
    const c = { listFail: true }, { p, exports } = setup(c);
    p.setData({ from: '2026-10-01', to: '2026-10-20', sellerOpenid: 'synthetic_seller', payeeIndex: 3 });
    await p.load(); assert.equal(p.data.errorKind, 'load'); assert.equal(p.data.ready, false);
    c.listFail = false; await p.load(); assert.equal(p.data.error, ''); assert.equal(p.data.errorKind, '');
    assert.equal(p.data.from, '2026-10-01'); assert.equal(p.data.sellerOpenid, 'synthetic_seller'); assert.equal(exports().length, 0);
  });
  await test('小区失败重试保持目标且不导出', async () => {
    const c = {}, { p, exports } = setup(c); await p.load(); c.communityFail = true;
    await p.select(event('communityIndex', 1)); assert.equal(p.data.errorKind, 'load');
    c.communityFail = false; await p.load(); assert.equal(p.data.community._id, 'c2'); assert.equal(p.data.errorKind, ''); assert.equal(exports().length, 0);
  });
  await test('每种请求条件变化清过期导出错误，同值保留错误', async () => {
    for (const [field, value] of Object.entries({ typeIndex: 1, payeeIndex: 3, providerIndex: 1, merchantIndex: 1, stationIndex: 1, from: '2026-10-01', to: '2026-10-20', sellerOpenid: 'synthetic_seller' })) {
      const { p, exports } = setup(); await p.load(); p.setData({ error: '旧导出失败', errorKind: 'export' });
      const change = field === 'sellerOpenid' ? 'input' : 'select';
      p[change](event(field, p.data[field])); assert.equal(p.data.error, '旧导出失败');
      p[change](event(field, value)); assert.equal(p.data.error, ''); assert.equal(p.data.errorKind, ''); assert.equal(exports().length, 0);
    }
  });
  await test('导出失败由原按钮重试，草稿和接口参数保留', async () => {
    const c = { exportFail: true }, { p, exports } = setup(c); await p.load(); p.select(event('payeeIndex', 3)); p.input(event('sellerOpenid', 'synthetic_seller'));
    await p.exportData(); assert.equal(p.data.errorKind, 'export'); assert.equal(p.data.ready, true);
    const first = JSON.stringify(exports()[0][2]); c.exportFail = false; await p.exportData();
    assert.equal(exports().length, 2); assert.equal(JSON.stringify(exports()[1][2]), first); assert.equal(p.data.errorKind, '');
  });
  await test('下载失败归导出错误，重试不清草稿', async () => {
    const c = { downloadFail: true }, { p, exports } = setup(c); await p.load(); await p.exportData();
    assert.equal(p.data.errorKind, 'export'); assert.equal(p.data.error, '合成下载失败'); const from = p.data.from;
    c.downloadFail = false; await p.exportData(); assert.equal(p.data.from, from); assert.equal(exports().length, 2); assert.equal(p.data.error, '');
  });
  await test('读取未就绪、忙碌和离页时不可用改条件清错误', async () => {
    for (const state of ['unready', 'busy', 'closed']) {
      const { p } = setup(); await p.load(); p.setData({ error: '保留错误', errorKind: 'export' });
      if (state === 'unready') p.setData({ ready: false });
      if (state === 'busy') p.setData({ busy: true });
      if (state === 'closed') p.onUnload();
      p.select(event('payeeIndex', 3)); p.input(event('sellerOpenid', 'changed'));
      assert.equal(p.data.payeeIndex, 0); assert.equal(p.data.sellerOpenid, ''); assert.equal(p.data.error, '保留错误');
    }
  });
  await test('模板仅加载错误显示重新加载；选择器保留忙碌保护与箭头', async () => {
    const s = fs.readFileSync('miniprogram/admin/exports/exports.wxml', 'utf8');
    assert(/button wx:if="\{\{errorKind === 'load'\}\}"[^>]*bindtap="load">重新加载/.test(s));
    assert.equal((s.match(/<picker /g) || []).length, 8);
    assert.equal((s.match(/<picker disabled="\{\{busy[^"]*\}\}"/g) || []).length, 8);
    assert.equal((s.match(/class="export-arrow"/g) || []).length, 8);
    for (const label of ['导出类型','小区','收款对象','服务员','商家','驿站','开始日期','结束日期','卖家编号（OpenID，选填）']) assert(s.includes('<view class="label">' + label + '</view>'));
    assert(s.includes('wx:if="{{ready && !loading}}"'));
  });
  const report = { scope: 'Synthetic isolated cases and template structure only; not real cloud or visual acceptance', total: results.length, passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa38-39.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report)); if (report.passed !== report.total) process.exitCode = 1;
})();
