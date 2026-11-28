// Actual page handlers with isolated identities/API responses; no real binding writes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('./page-fixture.cjs');
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); }
}
(async () => {
  for (const module of ['board', 'idle']) {
    const file = `miniprogram/${module}/list/list.js`;
    const rows = module === 'board' ? 'posts' : 'list';
    await check(`${module}: incomplete binding clears old content without API calls or redirect`, async () => {
      for (const user of [{}, { communityId: 'c' }, { buildingId: 'b' }]) {
        const r = runtime(), p = r.instance(file);
        r.app.globalData.user = user;
        p.data[rows] = [{ _id: 'old' }]; p.data.hasMore = true;
        p.data.federationEnabled = true;
        await p.onShow();
        assert(p.data.needsBinding); assert.equal(p.data.loading, false);
        assert.equal(p.data.error, ''); assert.equal(p.data[rows].length, 0);
        assert.equal(p.data.hasMore, false); assert.equal(p.data.federationEnabled, false);
        assert.equal(r.requests.length, 0); assert.equal(r.navigation.length, 0);
      }
    });
    await check(`${module}: explicit bind and cancelled return do not create a navigation loop`, async () => {
      const r = runtime(), p = r.instance(file);
      await p.onShow(); p.bindAddress();
      assert.deepEqual(r.navigation, [['navigateTo', '/pages/bind/bind']]);
      await p.onShow();
      assert.equal(r.navigation.length, 1); assert(p.data.needsBinding);
      assert.equal(r.requests.length, 0);
    });
    await check(`${module}: failed save preserves unbound state; successful save refreshes next entry`, async () => {
      let failSave = true;
      const r = runtime(async (name, action) => {
        if (action === 'setAddress') {
          if (failSave) throw Error('保存失败');
          return { communityId: 'c', buildingId: 'b', roles: ['resident'] };
        }
        if (action === 'getCommunity') return { enabledFeatures: { board: true, idle: true, federation: false } };
        if (action === 'adsForSlot') return { ads: [] };
        if (action === 'list') return { list: [], hasMore: false };
        throw Error('Unexpected ' + name + '.' + action);
      });
      const p = r.instance(file), bind = r.instance('miniprogram/pages/bind/bind.js');
      Object.assign(bind.data, { agreed: true, manualPhone: '13800000000', room: '测试',
        communities: [{ _id: 'c' }], communityIndex: 0, buildings: [{ _id: 'b' }],
        buildingIndex: 0, units: ['1'], unitIndex: 0 });
      await bind.save(); assert.equal(bind.data.error, '保存失败');
      await p.onShow(); assert(p.data.needsBinding); assert.equal(r.navigation.length, 0);
      failSave = false; await bind.save();
      assert.deepEqual(r.navigation, [['switchTab', '/pages/index/index']]);
      await p.onShow(); assert.equal(p.data.needsBinding, false);
      assert.equal(p.data.error, ''); assert.equal(p.data.loading, false);
      assert(r.requests.some(([name, action]) => name === module && action === 'list'));
      p.create(); assert(r.navigation.at(-1)[1].startsWith(`/${module}/create/create`));
    });
    await check(`${module}: bound but feature disabled keeps original error and skips list`, async () => {
      const r = runtime(async () => ({ enabledFeatures: { board: false, idle: false } }));
      r.app.globalData.user = { communityId: 'c', buildingId: 'b' };
      const p = r.instance(file); await p.onShow();
      assert.equal(p.data.needsBinding, false); assert(p.data.error.includes('暂未开放'));
      assert.equal(r.requests.length, 1); assert.equal(r.requests[0][1], 'getCommunity');
    });
    await check(`${module}: login failure remains retryable and does not show business controls`, async () => {
      const r = runtime(), p = r.instance(file);
      r.app.ensureSession = async () => { throw Error('登录失败'); };
      await p.onShow(); assert.equal(p.data.error, '登录失败');
      assert.equal(p.data.loading, false); assert.equal(r.requests.length, 0);
      r.app.ensureSession = async () => ({});
      await p.onShow(); assert.equal(p.data.error, ''); assert(p.data.needsBinding);
    });
  }
  const report = { scope: 'isolated real page handlers; synthetic binding only, no cloud writes',
    total: results.length, passed: results.filter(r => r.status === 'PASS').length, results };
  fs.writeFileSync('docs/verification/2026-11-09-remediation/list-binding.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.total === report.passed ? 0 : 1;
})();
