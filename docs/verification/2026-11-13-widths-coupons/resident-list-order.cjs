const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const tick = () => new Promise(setImmediate);
const modules = ['board', 'idle', 'shops', 'chat', 'events'];

function setup(module) {
  const pending = [];
  const env = runtime(async (name, action) => {
    if (action === 'getCommunity') return { enabledFeatures: { federation: true, board: true, idle: true } };
    if (action === 'adsForSlot') return { ads: [] };
    assert.ok(['list', 'listForCommunity'].includes(action), action);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  });
  Object.assign(env.app.globalData.user, { communityId: 'demo', buildingId: 'demo-building' });
  return { page: env.instance('miniprogram/' + module + '/list/list.js'), pending };
}
function rows(id) {
  return { list: [{ _id: id, conversationId: id, price: 100, createdAt: 1794550000000, startAt: 1794550000000 }],
    hasMore: false, unreadTotal: id === 'new' ? 7 : 1 };
}
async function probe(module) {
  const result = {};
  for (const scenario of ['olderSuccess', 'olderError', 'afterHide', 'afterUnload']) {
    const { page, pending } = setup(module);
    const first = page.load(true);
    await tick(); assert.equal(pending.length, 1);
    if (scenario.startsWith('older')) {
      const second = page.load(true);
      await tick(); assert.equal(pending.length, 2);
      pending[1].resolve(rows('new')); await second;
      if (scenario === 'olderError') pending[0].reject(Error('旧读取失败'));
      else pending[0].resolve(rows('old'));
      await first;
      const id = (page.data.posts || page.data.list)[0]?._id;
      result[scenario] = id === 'new' && !page.data.error && (module !== 'chat' || page.data.unreadTotal === 7);
    } else {
      page[scenario === 'afterHide' ? 'onHide' : 'onUnload']?.();
      let writes = 0;
      const set = page.setData.bind(page);
      page.setData = data => { writes++; set(data); };
      pending[0].resolve(rows('late')); await first;
      result[scenario] = writes === 0;
    }
  }
  return result;
}
(async () => {
  let passed = 0;
  for (const module of modules) {
    const r = await probe(module); passed += Object.values(r).filter(Boolean).length;
    console.log(module, JSON.stringify(r));
  }
  console.log('通过 ' + passed + '/20'); if (passed !== 20) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });

async function paging(module) {
  const calls = [];
  let pending, features = true;
  const env = runtime(async (name, action, data) => {
    if (action === 'getCommunity') return { enabledFeatures: { board: true, idle: true, federation: features } };
    if (action === 'adsForSlot') return { ads: [] };
    calls.push(data);
    if (calls.length === 2) return new Promise(resolve => { pending = resolve; });
    return { ...rows('page-' + calls.length), hasMore: true };
  });
  const user = env.app.globalData.user;
  Object.assign(user, { communityId: 'A', buildingId: 'building' });
  const p = env.instance('miniprogram/' + module + '/list/list.js');
  const more = () => module === 'events' ? p.onReachBottom() : p.more();
  await p.onShow();
  const second = more(); await tick(); await more();
  assert.deepEqual(calls.map(v => v.offset), [0, 1]);
  p.onHide(); user.communityId = 'B'; await p.onShow();
  pending(rows('late-page')); await second;
  assert.equal((p.data.posts || p.data.list)[0]._id, 'page-3');
  assert.equal(calls[2].offset, 0);
  await more();
  assert.equal((p.data.posts || p.data.list).length, 2);
  if (module !== 'events') {
    const choose = module === 'board' ? 'chooseScope' : 'scope';
    p[choose]({ currentTarget: { dataset: { scope: 'federation' } } });
    await tick();
    assert.equal(calls.at(-1).scope, 'federation'); assert.equal(calls.at(-1).offset, 0);
    features = false; await p.onShow();
    assert.equal(calls.at(-1).scope, 'community');
    assert.equal(p.data.scope, 'community');
  }
}
async function lateAd(module, fail) {
  let release, options;
  const env = runtime(async (name, action, data, opt) => {
    if (action === 'getCommunity') return { enabledFeatures: { board: true } };
    if (action === 'adsForSlot') {
      options = opt;
      return new Promise((resolve, reject) => { release = () => fail ? reject(Error('旧广告')) : resolve({ ads: [{ _id: 'old-ad' }] }); });
    }
    throw Error('离页后不应读取列表');
  });
  Object.assign(env.app.globalData.user, { communityId: 'A', buildingId: 'b' });
  const p = env.instance('miniprogram/' + module + '/list/list.js');
  const read = p.onShow(); await tick(); p.onHide();
  let writes = 0;
  p.setData = () => { writes++; };
  assert.equal(options.isActive(), false);
  release(); await read;
  assert.equal(writes, 0);
  assert.equal(env.requests.some(([,action]) => ['list','listForCommunity'].includes(action)), false);
}
(async () => {
  for (const module of ['board','idle','events']) await paging(module);
  for (const module of ['board','shops']) for (const fail of [false,true]) await lateAd(module,fail);
  console.log('7/7：分页、连续翻页、切换小区、筛选与广告离页成功/失败');
})().catch(error => { console.error(error); process.exitCode = 1; });
