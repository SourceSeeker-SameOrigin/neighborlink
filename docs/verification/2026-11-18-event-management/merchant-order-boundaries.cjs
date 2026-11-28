// Actual merchant order page; synthetic identities, orders, media and callbacks only.
// No cloud calls, camera, uploads, payments or real order changes.
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const order = (id = 'order-a', status = 'paid', category = 'repair') => ({ _id: id, status, featureEnabled: true,
  detail: { category }, pricing: { payAmount: 500 }, address: { buildingName: '合成楼栋', unit: '合成单元', room: '测试门牌' }, note: '合成需求' });
const event = (id = 'order-a', action = 'accept') => ({ currentTarget: { dataset: { id, action } } });
function fixture(status = 'paid', category = 'repair') {
  let handler = async (n, a) => a === 'merchantOrders' ? { list: [order('order-a', status, category)], hasMore: false } : {};
  let upload = async () => ['cloud://synthetic/merchant-orders/order-a/photo.jpg'];
  let uploads = 0;
  const env = runtime((...args) => handler(...args), { media: { uploadPhotos: async (...args) => { uploads++; return upload(...args); } } });
  env.app.globalData.user = { _id: 'merchant-user-a', roles: ['merchant'], merchantId: 'merchant-a' };
  const page = env.instance('miniprogram/merchant/orders/orders.js');
  page.visible = true;
  return { env, page, use: fn => { handler = fn; }, media: fn => { upload = fn; }, uploads: () => uploads };
}
async function boundary(f, type) {
  if (type === 'hidden') f.page.onHide?.();
  if (type === 'unloaded') f.page.onUnload?.();
  if (type === 'user') f.env.app.globalData.user = { _id: 'merchant-user-b', roles: ['merchant'], merchantId: 'merchant-b' };
  if (type === 'refresh') await f.page.load();
  if (type === 'read-failed') {
    f.use(async () => { throw Object.assign(Error('合成无权读取'), { code: 'E_FORBIDDEN' }); });
    await f.page.load();
    f.use(async (n, a) => a === 'merchantOrders' ? { list: [], hasMore: false } : {});
  }
}
async function check(name, body) {
  let evidence;
  try { await body(value => { evidence = value; }); results.push({ name, pass: true, evidence }); }
  catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
}
const writes = (f, action) => f.env.requests.filter(r => r[1] === action).length;
(async () => {
  await check('read-normal', async record => {
    const f = fixture(); await f.page.load();
    record({ rows: f.page.data.list.length, loading: f.page.data.loading });
    assert.equal(f.page.data.list.length, 1); assert.equal(f.page.data.loading, false);
  });
  await check('read-denied-clears-old-order', async record => {
    const f = fixture(); await f.page.load(); await boundary(f, 'read-failed');
    record({ rows: f.page.data.list.length, error: f.page.data.error }); assert.equal(f.page.data.list.length, 0);
  });
  await check('read-latest-result-wins', async record => {
    const f = fixture(), wait = deferred(); let count = 0;
    f.use(async () => ++count === 1 ? wait.promise : { list: [order('new')] });
    const old = f.page.load(); await flush(); await f.page.load(); wait.resolve({ list: [order('old')] }); await old;
    record({ id: f.page.data.list[0]?._id }); assert.equal(f.page.data.list[0]._id, 'new');
  });
  for (const leave of ['hidden', 'unloaded']) await check('read-late-' + leave, async record => {
    const f = fixture(), wait = deferred(); f.use(async () => wait.promise);
    const op = f.page.load(); await boundary(f, leave);
    let updates = 0; const set = f.page.setData; f.page.setData = function(p) { updates++; set.call(this, p); };
    wait.resolve({ list: [order()] }); await op;
    record({ updates }); assert.equal(updates, 0);
  });
  for (const action of ['quoteBooking', 'merchantTransition', 'completeBooking']) {
    for (const state of ['same-page', 'user', 'hidden', 'unloaded', 'read-failed']) {
      await check(action + '-entry-' + state, async record => {
        const f = fixture(action === 'quoteBooking' ? 'pending_quote' : action === 'completeBooking' ? 'in_service' : 'paid');
        await f.page.load();
        if (action === 'quoteBooking') { f.page.chooseQuote(event()); f.page.setData({ quoteAmount: '5', quoteDetail: '合成报价' }); }
        await boundary(f, state);
        if (action === 'quoteBooking') await f.page.quote();
        else if (action === 'merchantTransition') await f.page.transition(event());
        else await f.page.complete(event());
        record({ writes: writes(f, action), uploads: f.uploads() });
        assert.equal(writes(f, action), state === 'same-page' ? 1 : 0);
        if (action === 'completeBooking') assert.equal(f.uploads(), state === 'same-page' ? 1 : 0);
      });
    }
  }
  for (const kind of ['locksmith-confirm', 'completion-upload']) {
    for (const state of ['same-page', 'user', 'hidden', 'unloaded', 'refresh']) {
      await check(kind + '-late-' + state, async record => {
        const f = fixture(kind === 'locksmith-confirm' ? 'accepted' : 'in_service', 'locksmith'), wait = deferred();
        await f.page.load(); let modal;
        f.env.wx.showModal = o => { modal = o; }; f.media(() => wait.promise);
        const op = kind === 'locksmith-confirm' ? f.page.transition(event('order-a', 'start')) : f.page.complete(event());
        await flush(); await boundary(f, state);
        if (kind === 'locksmith-confirm') modal.success({ confirm: true });
        else wait.resolve(['cloud://synthetic/merchant-orders/order-a/photo.jpg']);
        await op;
        const action = kind === 'locksmith-confirm' ? 'merchantTransition' : 'completeBooking';
        record({ writes: writes(f, action), currentUser: f.env.app.globalData.user._id });
        assert.equal(writes(f, action), state === 'same-page' ? 1 : 0);
      });
    }
  }
  await check('locksmith-cancel-zero-write', async record => {
    const f = fixture('accepted', 'locksmith'); await f.page.load();
    f.env.wx.showModal = o => o.success({ confirm: false }); await f.page.transition(event('order-a', 'start'));
    record({ writes: writes(f, 'merchantTransition') }); assert.equal(writes(f, 'merchantTransition'), 0);
  });
  await check('complete-double-click', async record => {
    const f = fixture('in_service'), wait = deferred(); await f.page.load(); f.media(() => wait.promise);
    const first = f.page.complete(event()); const second = f.page.complete(event());
    await flush(); wait.resolve(['cloud://synthetic/merchant-orders/order-a/photo.jpg']); await Promise.all([first, second]);
    record({ uploads: f.uploads(), writes: writes(f, 'completeBooking') });
    assert.equal(writes(f, 'completeBooking'), 1); assert.equal(f.uploads(), 1);
  });
  for (const action of ['quoteBooking', 'merchantTransition', 'completeBooking']) await check(action + '-late-error-after-hide', async record => {
    const f = fixture(action === 'quoteBooking' ? 'pending_quote' : action === 'completeBooking' ? 'in_service' : 'paid'), wait = deferred();
    await f.page.load(); f.use(async (n, a) => a === action ? wait.promise : { list: [order('order-a', action === 'quoteBooking' ? 'pending_quote' : action === 'completeBooking' ? 'in_service' : 'paid')] });
    f.page.chooseQuote(event()); f.page.setData({ quoteAmount: '5' });
    const op = action === 'quoteBooking' ? f.page.quote() : action === 'completeBooking' ? f.page.complete(event()) : f.page.transition(event());
    await flush(); assert.equal(writes(f, action), 1); await boundary(f, 'hidden');
    let updates = 0; const set = f.page.setData; f.page.setData = function(p) { updates++; set.call(this, p); };
    wait.reject(Error('合成旧操作失败')); await op;
    record({ updates, error: f.page.data.error }); assert.equal(updates, 0);
  });
  for (const timing of ['result-first', 'show-first']) for (const outcome of ['success', 'cancel', 'failure']) {
    await check('native-return-' + timing + '-' + outcome, async record => {
      const f = fixture('in_service'), wait = deferred(); await f.page.onShow(); f.media(() => wait.promise);
      const op = f.page.complete(event()); await flush(); f.page.onHide();
      if (timing === 'show-first') await f.page.onShow();
      if (outcome === 'success') wait.resolve(['cloud://synthetic/merchant-orders/order-a/photo.jpg']);
      else wait.reject(Error(outcome === 'cancel' ? 'chooseMedia:fail cancel' : '合成上传失败'));
      await op;
      if (timing === 'result-first') await f.page.onShow();
      record({ writes: writes(f, 'completeBooking'), busy: f.page.data.busy, ready: f.page.data.ready, error: f.page.data.error });
      assert.equal(writes(f, 'completeBooking'), outcome === 'success' ? 1 : 0);
      assert.equal(f.page.data.busy, false); assert.equal(f.page.data.ready, true);
      assert.equal(!!f.page.data.error, outcome === 'failure');
    });
  }
  for (const change of ['user', 'merchant', 'status', 'feature', 'category', 'missing', 'denied', 'unloaded', 'manual-refresh']) {
    await check('native-return-invalid-' + change, async record => {
      const f = fixture('in_service'), wait = deferred(); await f.page.onShow(); f.media(() => wait.promise);
      const op = f.page.complete(event()); await flush(); f.page.onHide();
      if (change === 'user') f.env.app.globalData.user = { _id: 'other', merchantId: 'other' };
      if (change === 'merchant') f.env.app.globalData.user.merchantId = 'other';
      f.use(async (n, a) => {
        if (a !== 'merchantOrders') return {};
        if (change === 'denied') throw Object.assign(Error('合成拒绝'), { code: 'E_FORBIDDEN' });
        const row = order('order-a', change === 'status' ? 'delivered' : 'in_service', change === 'category' ? 'locksmith' : 'repair');
        if (change === 'feature') row.featureEnabled = false;
        return { list: change === 'missing' ? [] : [row], hasMore: false };
      });
      if (change === 'unloaded') f.page.onUnload();
      else { await f.page.onShow(); if (change === 'manual-refresh') await f.page.load(); }
      wait.resolve(['cloud://synthetic/merchant-orders/order-a/photo.jpg']); await op;
      record({ writes: writes(f, 'completeBooking'), busy: f.page.data.busy, ready: f.page.data.ready });
      assert.equal(writes(f, 'completeBooking'), 0);
      if (change !== 'unloaded') assert.equal(f.page.data.busy, false);
    });
  }
  await check('native-second-page-revalidated', async record => {
    const f = fixture('in_service'), wait = deferred(), offsets = [];
    f.use(async (n, a, d) => {
      if (a !== 'merchantOrders') return {};
      offsets.push(d.offset);
      return d.offset ? { list: [order('order-a', 'in_service')], hasMore: false }
        : { list: Array.from({ length: 20 }, (_, i) => order('first-' + i, 'completed')), hasMore: true };
    });
    await f.page.onShow(); await f.page.more(); f.media(() => wait.promise);
    const op = f.page.complete(event()); await flush(); f.page.onHide(); await f.page.onShow();
    wait.resolve(['cloud://synthetic/merchant-orders/order-a/photo.jpg']); await op;
    record({ offsets, writes: writes(f, 'completeBooking'), busy: f.page.data.busy });
    assert.equal(writes(f, 'completeBooking'), 1); assert.equal(f.page.data.busy, false);
    assert.ok(offsets.filter(o => o === 20).length >= 2);
  });
  await check('page-failure-retry-same-offset', async record => {
    const f = fixture(), offsets = []; let fail = true;
    f.use(async (n, a, d) => {
      if (a !== 'merchantOrders') return {};
      offsets.push(d.offset);
      if (d.offset && fail) { fail = false; throw Error('合成续页失败'); }
      return d.offset ? { list: [order('second')], hasMore: false } : { list: [order()], hasMore: true };
    });
    await f.page.onShow(); await f.page.more();
    assert.equal(f.page.data.list.length, 1); assert.equal(f.page.data.pageError, true);
    await f.page.transition(event()); assert.equal(writes(f, 'merchantTransition'), 0);
    await f.page.retry();
    record({ offsets, count: f.page.data.list.length, ready: f.page.data.ready });
    assert.deepEqual(offsets, [0, 1, 1]); assert.equal(f.page.data.list.length, 2); assert.equal(f.page.data.ready, true);
  });
  for (const code of ['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND']) await check('page-denial-clears-' + code, async record => {
    const f = fixture();
    f.use(async (n, a, d) => { if (d.offset) throw Object.assign(Error('合成拒绝'), { code }); return { list: [order()], hasMore: true }; });
    await f.page.onShow(); await f.page.more();
    record({ rows: f.page.data.list.length, ready: f.page.data.ready, busy: f.page.data.busy });
    assert.equal(f.page.data.list.length, 0); assert.equal(f.page.data.ready, false);
  });
  for (const boundaryName of ['hidden', 'unloaded', 'refresh', 'user']) await check('late-next-page-' + boundaryName, async record => {
    const f = fixture(), wait = deferred();
    f.use(async (n, a, d) => d.offset ? wait.promise : { list: [order()], hasMore: true });
    await f.page.onShow(); const op = f.page.more(); await flush(); await boundary(f, boundaryName);
    const before = JSON.stringify(f.page.data);
    wait.resolve({ list: [order('old-second')], hasMore: false }); await op;
    record({ unchanged: JSON.stringify(f.page.data) === before }); assert.equal(JSON.stringify(f.page.data), before);
  });
  for (const type of ['invalid-status', 'disabled', 'unknown-order', 'invalid-action']) await check('entry-rejects-' + type, async record => {
    const f = fixture('completed'); await f.page.onShow();
    if (type === 'disabled') { f.page.data.list[0].status = 'paid'; f.page.data.list[0].featureEnabled = false; }
    await f.page.transition(event(type === 'unknown-order' ? 'unknown' : 'order-a', type === 'invalid-action' ? 'anything' : 'accept'));
    record({ writes: writes(f, 'merchantTransition') }); assert.equal(writes(f, 'merchantTransition'), 0);
  });
  console.log(JSON.stringify({ scope: 'actual merchant order page; all writes, photos and modal callbacks intercepted; no live authorization claim',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
