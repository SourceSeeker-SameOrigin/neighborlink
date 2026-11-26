// Isolated regression: synthetic IDs, no network/cloud writes or generated real files.
const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const source = 'miniprogram/admin/posters/posters.js';
const results = [];
const communities = [{ _id: 'a' }, { _id: 'b' }];
const providers = [{ _id: 'p1' }, { _id: 'p2' }];
const event = (type, id) => ({ currentTarget: { dataset: { type, id } } });
const select = value => ({ detail: { value } });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup(call = async (name, action, data) => {
  if (action === 'listCommunities') return { list: communities };
  if (action === 'listProviders') return { list: providers };
  if (action === 'getCommunity') return { buildings: [{ _id: data.communityId + '_building' }] };
  return { scene: 'synthetic', tempFileURL: 'fixture-only' };
}) {
  const r = runtime(call); r.app.globalData.user.roles = ['admin'];
  return { r, p: r.instance(source) };
}
function ready(p) { p.visible = true; p.ownerId = 'fixture'; p._loadVersion ||= 1;
  p._targetVersion = p._targetVersion || 0;
  p.setData({ ready: true, loading: false, communityReady: true,
  communities, providers, buildings: [{ _id: 'a_building' }] }); }
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); } }
(async () => {
  await test('空服务员生成显示中文，零API调用', async () => {
    const { r, p } = setup(); ready(p); p.data.providers = [];
    await p.generate(event('provider')); assert.equal(r.requests.length, 0); assert(p.data.error.includes('暂无可用服务员'));
  });
  for (const patch of [{ loading: true }, { ready: false }, { busy: true }]) await test('未就绪或忙碌禁止生成 ' + JSON.stringify(patch), async () => {
    const { r, p } = setup(); ready(p); p.setData(patch); await p.generate(event('building', 'a_building'));
    assert.equal(r.requests.length, 0);
  });
  await test('旧楼栋/未知类型/空目标不发生成请求', async () => {
    const { r, p } = setup(); ready(p);
    for (const e of [event('building', 'other_building'), event('building'), event('unknown')]) await p.generate(e);
    assert.equal(r.requests.length, 0);
  });
  await test('初始化失败后只读重试恢复，不自动生成', async () => {
    let fail = true;
    const { r, p } = setup(async (name, action) => {
      if (fail) throw Error('合成加载失败');
      return action === 'getCommunity' ? { buildings: [] } : { list: communities };
    });
    await p.load(); assert.equal(p.data.ready, false); assert.equal(p.data.retryAction, 'load');
    const count = r.requests.length; await p.generate(event('provider')); assert.equal(r.requests.length, count);
    fail = false; await p.retry(); assert.equal(p.data.ready, true); assert.equal(p.data.communityReady, true);
    assert.equal(p.data.error, ''); assert(!r.requests.some(x => x[1] === 'genPoster'));
  });
  await test('非管理员初始化拒绝且不能生成', async () => {
    const { r, p } = setup(); r.app.globalData.user.roles = ['resident']; await p.load(); await p.generate(event('provider'));
    assert.equal(r.requests.length, 0); assert(p.data.error.includes('只有运营管理员'));
  });
  await test('空小区与空服务员完成加载，但不发详情或生成', async () => {
    const { r, p } = setup(async () => ({ list: [] })); await p.load(); await p.generate(event('building'));
    await p.generate(event('provider')); assert.equal(p.data.loading, false); assert.equal(p.data.communityReady, false);
    assert.equal(r.requests.length, 2);
  });
  for (const oldFails of [false, true]) await test('快速选A再B：旧' + (oldFails ? '失败' : '成功') + '不覆盖B', async () => {
    const waits = {}; const { p } = setup((name, action, data) => (waits[data.communityId] = deferred()).promise); ready(p);
    p.data.poster = { scene: 'old' };
    const a = p.changeCommunity(select(0)); const b = p.changeCommunity(select(1));
    assert.equal(p.data.communityIndex, 1); assert.equal(p.data.buildings.length, 0); assert.equal(p.data.poster, null);
    waits.b.resolve({ buildings: [{ _id: 'b_building' }] }); await b;
    oldFails ? waits.a.reject(Error('旧失败')) : waits.a.resolve({ buildings: [{ _id: 'a_building' }] }); await a;
    assert.equal(p.data.communityIndex, 1); assert.equal(p.data.buildings[0]._id, 'b_building');
    assert.equal(p.data.error, ''); assert.equal(p.data.communityLoading, false);
  });
  await test('切换失败可见、清旧楼栋，只读重试保持目标B', async () => {
    let fail = true; const { r, p } = setup(async () => { if (fail) throw Error('合成断网'); return { buildings: [{ _id: 'b_building' }] }; }); ready(p);
    await p.changeCommunity(select(1)); assert.equal(p.data.error, '合成断网'); assert.equal(p.data.buildings.length, 0);
    assert.equal(p.data.retryAction, 'community'); const count = r.requests.length;
    await p.generate(event('building', 'a_building')); assert.equal(r.requests.length, count);
    fail = false; await p.retry(); assert.equal(p.data.communityIndex, 1); assert.equal(p.data.buildings[0]._id, 'b_building');
    assert(r.requests.every(x => x[1] === 'getCommunity' && x[2].communityId === 'b'));
  });
  await test('有效楼栋和服务员请求传对应编号', async () => {
    const { r, p } = setup(); await p.load(); await p.generate(event('building', 'a_building'));
    assert.equal(r.requests.at(-1)[2].buildingId, 'a_building'); assert.equal(p.data.poster.scene, 'synthetic');
    p.providerChange(select(1)); assert.equal(p.data.poster, null); await p.generate(event('provider'));
    assert.equal(r.requests.at(-1)[2].providerId, 'p2'); assert.equal(p.data.busy, false);
  });
  await test('生成失败可见，明确重试后恢复，旧海报清除', async () => {
    let fail = true; const { p } = setup(async () => { if (fail) throw Error('合成生成失败');
      return { scene: 'new', tempFileURL: 'https://example.invalid/new.png' }; }); ready(p);
    p.data.poster = { scene: 'old' }; await p.generate(event('provider'));
    assert.equal(p.data.error, '合成生成失败'); assert.equal(p.data.poster, null); assert.equal(p.data.busy, false);
    fail = false; await p.generate(event('provider')); assert.equal(p.data.poster.scene, 'new'); assert.equal(p.data.error, '');
  });
  for (const errorResult of [false, true]) await test('生成中换服务员，迟到' + (errorResult ? '错误' : '海报') + '不显示', async () => {
    const wait = deferred(); const { r, p } = setup(() => wait.promise); ready(p);
    const result = p.generate(event('provider')); await p.generate(event('provider')); assert.equal(r.requests.length, 1);
    p.providerChange(select(1)); errorResult ? wait.reject(Error('旧对象失败')) : wait.resolve({ scene: 'old' }); await result;
    assert.equal(p.data.poster, null); assert.equal(p.data.error, ''); assert.equal(p.data.busy, false);
  });
  await test('生成中换小区，旧楼栋海报不能出现在新小区', async () => {
    const wait = deferred(); const { p } = setup(async (name, action) => action === 'genPoster' ? wait.promise : { buildings: [{ _id: 'b_building' }] }); ready(p);
    const generate = p.generate(event('building', 'a_building')); await p.changeCommunity(select(1));
    wait.resolve({ scene: 'old_building' }); await generate;
    assert.equal(p.data.communityIndex, 1); assert.equal(p.data.poster, null);
  });
  for (const action of ['load', 'changeCommunity', 'generate']) await test('离页后'+action+'迟到不更新页面', async () => {
    const wait = deferred(); const { p } = setup(() => wait.promise); if (action !== 'load') ready(p);
    const call = action === 'generate' ? p.generate(event('provider')) : action === 'changeCommunity' ? p.changeCommunity(select(1)) : p.load();
    await Promise.resolve(); p.onUnload(); let writes = 0; p.setData = () => { writes++; };
    wait.resolve({ list: communities, buildings: [], scene: 'late' }); await call; assert.equal(writes, 0);
  });
  const report = { scope: 'Isolated VM only, not real cloud generation or visual acceptance', total: results.length,
    passed: results.filter(x=>x.status==='PASS').length, results };
  fs.writeFileSync(__dirname+'/qa32.json', JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
  if (report.passed !== report.total) process.exitCode = 1;
})();
