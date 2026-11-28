const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
function setup(control = {}) {
  const r = runtime(async (fn, action, data) => {
    if (action !== 'settlementPreview') throw Error('Unexpected business action ' + action);
    if (control.wait) await control.wait;
    if (control.fail) throw Error('合成预览失败');
    return { rows: [{ providerId: data.providerId, total: 123, ledgerIds: ['synthetic-ledger'] }] };
  });
  const p = r.instance('miniprogram/admin/settlements/settlements.js');
  r.app.globalData.user = { _id: 'fixture', roles: ['admin'] };
  p.visible = true; p._loadVersion = 1;
  p.readContext = { userId: 'fixture', isAdmin: true, version: 1 };
  p.setData({ ready: true, loading: false, authorized: true, isAdmin: true,
    communities: [{ _id: 'c1', name: '合成小区一' }, { _id: 'c2', name: '合成小区二' }],
    providers: [{ _id: 'p1' }, { _id: 'p2' }], merchants: [{ _id: 'm1' }, { _id: 'm2' }],
    from: '2026-11-01', to: '2026-11-10' });
  return { r, p };
}
const event = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); } catch (e) { results.push({ name, status: 'FAIL', error: e.message }); } }
(async () => {
  await test('预览金额与请求日期、小区快照一致', async () => {
    const { p, r } = setup(); await p.preview();
    assert.equal(p.data.preview[0].totalText, '1.23');
    assert.equal(p.data.previewRange.from, r.requests[0][2].from);
    assert.equal(p.data.previewRange.communityName, '合成小区一');
  });
  await test('四种选择条件变化立即清除预览且不调用业务', async () => {
    for (const field of ['communityIndex', 'payeeIndex', 'providerIndex', 'merchantIndex']) {
      const { p, r } = setup(); await p.preview(); const calls = r.requests.length;
      p.select(event(field, 1)); assert.equal(p.data.preview.length, 0); assert.equal(p.data.previewRange, null);
      assert.equal(r.requests.length, calls);
    }
  });
  await test('两种日期和卖家输入变化立即清除预览', async () => {
    for (const [field, value] of [['from', '2026-11-02'], ['to', '2026-11-09'], ['sellerOpenid', 'synthetic-seller']]) {
      const { p } = setup(); await p.preview(); p.input(event(field, value));
      assert.equal(p.data.preview.length, 0); assert.equal(p.data.previewRange, null);
    }
  });
  await test('相同条件事件不丢弃有效预览', async () => {
    const { p } = setup(); await p.preview(); p.input(event('from', '2026-11-01')); p.select(event('communityIndex', 0));
    assert.equal(p.data.preview.length, 1);
  });
  await test('预览中日期改变，迟到成功不恢复旧金额，忙碌可释放', async () => {
    let resolve; const { p } = setup({ wait: new Promise(r => resolve = r) }); const pending = p.preview();
    p.input(event('from', '2026-11-03')); resolve(); await pending;
    assert.equal(p.data.preview.length, 0); assert.equal(p.data.previewRange, null); assert.equal(p.data.busy, false);
  });
  await test('过期失败不覆盖新条件的提示', async () => {
    let resolve; const { p } = setup({ fail: true, wait: new Promise(r => resolve = r) }); const pending = p.preview();
    p.input(event('to', '2026-11-08')); p.setData({ error: '新条件提示' }); resolve(); await pending;
    assert.equal(p.data.error, '新条件提示'); assert.equal(p.data.preview.length, 0); assert.equal(p.data.busy, false);
  });
  await test('再次预览失败不保留上次金额，重试可恢复', async () => {
    const c = {}, { p } = setup(c); await p.preview(); c.fail = true; await p.preview();
    assert.equal(p.data.preview.length, 0); assert.equal(p.data.previewRange, null); assert.equal(p.data.error, '合成预览失败');
    c.fail = false; await p.preview(); assert.equal(p.data.preview.length, 1); assert.equal(p.data.error, '');
  });
  await test('离页后迟到预览不更新页面', async () => {
    let resolve; const { p } = setup({ wait: new Promise(r => resolve = r) }); const pending = p.preview();
    p.onUnload(); p.setData = () => { throw Error('late setData'); }; resolve(); await pending;
  });
  await test('重复预览只发一次，未就绪不发请求', async () => {
    let resolve; const { p, r } = setup({ wait: new Promise(r => resolve = r) }); const pending = p.preview();
    await p.preview(); assert.equal(r.requests.length, 1); resolve(); await pending;
    p.setData({ ready: false }); await p.preview(); assert.equal(r.requests.length, 1);
  });
  const report = { scope: 'Isolated synthetic frontend inputs; no cloud, settlement or payment writes', total: results.length, passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa35.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  if (report.passed !== report.total) process.exitCode = 1;
})();
