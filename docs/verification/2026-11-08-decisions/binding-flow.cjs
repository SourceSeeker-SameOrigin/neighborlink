// Isolated page-flow regression: no real cloud, identity, phone, or address writes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = process.cwd();
const results = [];
function runtime(call = async () => { throw Error('Unexpected API call'); }) {
  const store = {}, navigation = [], requests = [], cache = new Map();
  const app = { globalData: { user: { _id: 'fixture', roles: ['resident'] }, community: null },
    ensureSession: async () => app.globalData.user };
  const wx = { getStorageSync: key => store[key], removeStorageSync: key => delete store[key],
    navigateTo: o => navigation.push(['navigateTo', o.url]),
    redirectTo: o => navigation.push(['redirectTo', o.url]),
    switchTab: o => navigation.push(['switchTab', o.url]), showToast() {} };
  function load(file) {
    file = path.resolve(root, file); if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file);
    let definition; const module = { exports: {} };
    const requireLocal = id => {
      const target = path.resolve(path.dirname(file), id) + '.js';
      if (target === path.join(root, 'miniprogram/utils/api.js')) return { call: async (...args) => {
        requests.push(args); return call(...args);
      } };
      if (target === path.join(root, 'miniprogram/utils/payment.js')) return { pay: async () => { throw Error('No payment'); } };
      if (!id.startsWith('.')) throw Error('External dependencies forbidden');
      return load(path.resolve(path.dirname(file), id));
    };
    vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})',
      { wx, getApp: () => app, Page: value => { definition = value; }, Date, Promise, console,
        setTimeout: () => 1, clearTimeout() {} }, { filename: file })(requireLocal, module, module.exports);
    const value = definition || module.exports; cache.set(file, value); return value;
  }
  function instance(definition) {
    const page = typeof definition === 'string' ? load(definition) : definition;
    return { ...page, data: JSON.parse(JSON.stringify(page.data || {})), setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let target = this.data;
        while (parts.length > 1) { const part = parts.shift(); target = target[part] ||= {}; }
        target[parts[0]] = value;
      }
    } };
  }
  return { app, wx, store, navigation, requests, load, instance };
}
const homeFile = 'miniprogram/pages/index/index.js';
const bindFile = 'miniprogram/pages/bind/bind.js';
function form(page) {
  Object.assign(page.data, { communities: [{ _id: 'c' }], buildings: [{ _id: 'b' }], units: ['1'], room: '302', agreed: true });
}
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', actual: error.message }); }
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
(async () => {
  await check('Unbound launch and return stay home without community business reads', async () => {
    const r = runtime(), home = r.instance(homeFile);
    await home.load(); await home.load();
    assert.equal(r.navigation.length, 0, 'Home must not automatically reopen binding');
    assert.equal(r.requests.length, 0); assert.equal(home.data.needsBinding, true); assert.equal(home.data.loading, false);
    assert.equal(home.data.services.length, 4);
    assert(home.data.services.every(item => item.url === '/pages/bind/bind'));
  });
  await check('Missing either community or building remains unbound', async () => {
    for (const user of [{ communityId: 'c' }, { buildingId: 'b' }]) {
      const r = runtime(); r.app.globalData.user = user;
      const home = r.instance(homeFile); await home.load();
      assert.equal(home.data.needsBinding, true); assert.equal(r.navigation.length, 0); assert.equal(r.requests.length, 0);
    }
  });
  await check('Unbound home clears previously visible community data and extensions', async () => {
    const r = runtime(), home = r.instance(homeFile);
    r.app.globalData.community = { name: 'old' };
    Object.assign(home.data, { community: { name: 'old' }, notice: { title: 'old' }, ads: [{}], firstOrder: true, eventsEnabled: true });
    await home.load(); assert.equal(home.data.community, null); assert.equal(r.app.globalData.community, null);
    assert.equal(home.data.notice, null); assert.equal(home.data.ads.length, 0);
    assert.equal(home.data.firstOrder, false); assert.equal(home.data.eventsEnabled, false);
  });
  await check('Phone denial preserves typed form and never saves or marks authorization', async () => {
    const r = runtime(), bind = r.instance(bindFile); form(bind);
    await bind.phone({ detail: { errMsg: 'getPhoneNumber:fail user deny' } });
    assert(bind.data.phoneError.includes('未取得')); assert.equal(bind.data.room, '302'); assert.equal(bind.data.phone, '');
    await bind.save(); assert.equal(r.requests.length, 0); assert.equal(r.navigation.length, 0); assert(!r.app.globalData.user.phone);
  });
  await check('Failed code exchange preserves unbound profile and allows return home', async () => {
    const r = runtime(async () => { throw Error('授权服务暂不可用'); }); const bind = r.instance(bindFile); form(bind);
    await bind.phone({ detail: { code: 'synthetic-code' } });
    assert.equal(bind.data.phoneError, '授权服务暂不可用'); assert.equal(bind.data.authorizing, false);
    assert.equal(bind.data.phone, ''); assert.equal(bind.data.room, '302'); assert(!r.app.globalData.user.buildingId);
    bind.backHome(); const home = r.instance(homeFile); await home.load();
    assert.equal(r.navigation.length, 1); assert.equal(r.navigation[0][0], 'switchTab');
    assert.equal(r.navigation[0][1], '/pages/index/index'); assert.equal(home.data.needsBinding, true);
  });
  await check('Back after denial and repeated home onShow never reopen binding', async () => {
    const r = runtime(), home = r.instance(homeFile), bind = r.instance(bindFile);
    await bind.phone({ detail: {} }); bind.backHome();
    await home.onShow(); await home.onShow();
    assert.equal(r.navigation.length, 1); assert.equal(home.data.needsBinding, true);
  });
  await check('Concurrent authorization does not exchange the same gesture twice', async () => {
    const d = deferred(), r = runtime(() => d.promise), bind = r.instance(bindFile); form(bind);
    const first = bind.phone({ detail: { code: 'synthetic-code' } });
    const second = bind.phone({ detail: { code: 'synthetic-code' } });
    try {
      assert.equal(r.requests.length, 1); assert.equal(bind.data.authorizing, true);
      await bind.save(); assert.equal(r.requests.length, 1);
    } finally {
      d.resolve({ _id: 'fixture', phone: '138****0000', roles: ['resident'] });
      await Promise.all([first, second]);
    }
    assert.equal(bind.data.authorizing, false); assert.equal(bind.data.phoneError, '');
  });
  await check('Successful retry authorizes phone but does not imply address binding', async () => {
    let fail = true; const r = runtime(async () => { if (fail) throw Error('offline'); return { _id: 'fixture', phone: '138****0000' }; });
    const bind = r.instance(bindFile); form(bind);
    await bind.phone({ detail: { code: 'failed-code' } }); fail = false;
    await bind.phone({ detail: { code: 'valid-synthetic-code' } });
    assert.equal(bind.data.phoneError, ''); assert.equal(bind.data.phone, '138****0000');
    assert(!r.app.globalData.user.buildingId); assert.equal(r.navigation.length, 0);
  });
  await check('Successful server address response refreshes bound home; no extra redirect', async () => {
    const profile = { _id: 'fixture', roles: ['resident'], phone: '138****0000' };
    const r = runtime(async (name, action) => {
      if (action === 'bindPhone') return profile;
      if (action === 'setAddress') return { ...profile, communityId: 'c', buildingId: 'b', unit: '1', room: '302' };
      if (action === 'getCommunity') return { _id: 'c', name: '隔离测试小区', enabledFeatures: { recycle: true } };
      if (action === 'homeContent') return { notice: null, ads: [] };
      throw Error(name + ':' + action);
    });
    const bind = r.instance(bindFile); form(bind);
    await bind.phone({ detail: { code: 'synthetic-code' } }); await bind.save();
    assert.equal(r.navigation.length, 1); assert.equal(r.navigation[0][0], 'switchTab');
    const home = r.instance(homeFile); await home.onShow();
    assert.equal(home.data.needsBinding, false); assert.equal(home.data.community.name, '隔离测试小区');
    assert.equal(r.navigation.length, 1); assert(!home.data.services.some(item => item.url === '/pages/bind/bind'));
    assert.equal(r.requests.filter(x => x[1] === 'setAddress').length, 1); assert.equal(bind.data.saving, false);
  });
  await check('Failed address save never updates profile or leaves binding', async () => {
    const r = runtime(async () => { throw Error('门牌保存失败'); });
    r.app.globalData.user.phone = '138****0000'; const bind = r.instance(bindFile); form(bind); bind.data.phone = '138****0000';
    await bind.save(); assert.equal(bind.data.error, '门牌保存失败'); assert.equal(bind.data.saving, false);
    assert(!r.app.globalData.user.buildingId); assert.equal(r.navigation.length, 0); assert.equal(bind.data.room, '302');
  });
  await check('Direct service entry replaces itself with binding so Back cannot loop', async () => {
    const r = runtime(), page = r.instance(r.load('miniprogram/utils/service-form.js')('express'));
    await page.load(); assert.equal(r.navigation.length, 1); assert.equal(r.navigation[0][0], 'redirectTo');
    assert.equal(r.navigation[0][1], '/pages/bind/bind'); assert.equal(r.requests.length, 0);
  });
  await check('Direct membership entry replaces itself with binding so Back cannot loop', async () => {
    const r = runtime(), page = r.instance('miniprogram/pages/membership/index.js'); await page.load();
    assert.equal(r.navigation.length, 1); assert.equal(r.navigation[0][0], 'redirectTo'); assert.equal(r.requests.length, 0);
  });
  await check('Scanned building stays available for explicit binding after browsing home', async () => {
    const r = runtime(async (name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c', name: '示例' }], hasMore: false };
      if (action === 'resolveScene') return { communityId: 'c', buildingId: 'b3' };
      if (action === 'getCommunity') return { buildings: [{ _id: 'b1', units: ['1'] }, { _id: 'b3', units: ['1'] }] };
      throw Error(name + ':' + action);
    });
    r.store.scene = 'b=FIXTURE'; const home = r.instance(homeFile); await home.load();
    assert.equal(r.store.scene, 'b=FIXTURE'); assert.equal(r.navigation.length, 0);
    const bind = r.instance(bindFile); await bind.load(); assert.equal(bind.data.buildingIndex, 1);
  });
  const report = { total: results.length, passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length, scope: 'Isolated VM, synthetic API responses; no real phone authorization or cloud writes', results };
  const output = process.argv[2] || 'docs/verification/2026-11-08-decisions/binding-flow.json';
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failed ? 1 : 0;
})();
