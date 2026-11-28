// Offline integration of actual order handlers and shared payment/write code.
// Synthetic data only. Transactions serialize here; this is NOT a CloudBase concurrency test.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const clone = x => structuredClone(x);
// Optional in-memory mutations prove the checks detect broken guards; never edit source files.
const mutation = require.main === module ? process.argv[2] || null : null;
const mutations = {
  create_guard: ['orderWrite.js', 'if (existing) {', 'if (false) {'],
  payment_guard: ['paymentState.js', 'if (order.payment.paidAt) {', 'if (false) {'],
  refund_guard: ['refundState.js', 'if (existing) {', 'if (false) {']
};
if (mutation && !mutations[mutation]) throw Error('Unknown mutation');
let mutationApplied = false;

function harness() {
  const now = new Date();
  const user = { _id: 'synthetic-user', openid: 'synthetic-resident', roles: ['resident'],
    communityId: 'synthetic-community', buildingId: 'synthetic-building', unit: '测试单元',
    room: '测试房间', phone: '13800000000', firstPaidAt: null, paidOrderCount: 0, orderRevision: 0 };
  const community = { _id: user.communityId, status: 'active', prices: { trash: { single: 500 } },
    rates: { platform: .2, property: .05 }, cardPlans: [], dutyWindows: [{ start: '07:00', end: '00:00' }] };
  const config = { _id: 'global', payMode: 'mock', features: {}, templateIds: {} };
  const building = { _id: user.buildingId, communityId: user.communityId, name: '测试楼', units: [user.unit] };
  const data = { users: [clone(user)], communities: [community], buildings: [building], config: [config],
    orders: [], events: [], coupons: [], pointsLedger: [] };
  let queue = Promise.resolve(), failNext = false;
  const writes = [];
  const db = {
    command: {},
    runTransaction(work) {
      const run = queue.then(async () => {
        if (failNext) { failNext = false; throw Object.assign(Error('conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' }); }
        const saved = clone(data), before = writes.length;
        try { return await work(db); }
        catch (e) { Object.keys(data).forEach(k => delete data[k]); Object.assign(data, saved); writes.splice(before); throw e; }
      });
      queue = run.catch(() => {});
      return run;
    },
    collection(name) { return { doc(id) { return {
      async get() { return { data: clone((data[name] || []).find(x => x._id === id) || null) }; },
      async set({ data: value }) { const rows = data[name] ||= []; assert(!rows.some(x => x._id === id));
        rows.push({ _id: id, ...clone(value) }); writes.push([name, id, 'set']); },
      async update({ data: patch }) { const row = (data[name] || []).find(x => x._id === id); assert(row);
        Object.assign(row, clone(patch)); writes.push([name, id, 'update']); return { stats: { updated: 1 } }; },
      async remove() { data[name] = (data[name] || []).filter(x => x._id !== id); writes.push([name, id, 'remove']); }
    }; } }; }
  };
  const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);
  const server = { db, command: db.command,
    async get(name, id) { return clone((data[name] || []).find(x => x._id === id) || null); },
    async one(name, filter) { return clone((data[name] || []).find(x => matches(x, filter)) || null); },
    async all(name, filter = {}) { return clone((data[name] || []).filter(x => matches(x, filter))); },
    async config() { return clone(config); }, entry(actions) { return actions; } };
  const cloud = { init() {}, cloudPay: new Proxy({}, { get() { return () => { throw Error('Real payment forbidden'); }; } }),
    openapi: { subscribeMessage: { send() { throw Error('Notifications forbidden'); } } } };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file).replace(/\/[^/]+\/lib\/shared\//, '/_shared/');
    if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file).exports;
    const m = { exports: {} }; cache.set(file, m);
    function req(name) {
      if (name === 'wx-server-sdk') return cloud;
      if (name === 'crypto' || name === 'node:crypto') return require('node:crypto');
      if (name === 'https') return { request() { throw Error('Network forbidden'); } };
      if (/(?:^|\/)server$/.test(name)) return { createServer: () => server };
      if (!name.startsWith('.')) throw Error('Unexpected dependency ' + name);
      return load(path.resolve(path.dirname(file), name));
    }
    let source = fs.readFileSync(file, 'utf8');
    if (mutation && path.basename(file) === mutations[mutation][0]) {
      const [, from, to] = mutations[mutation];
      assert(source.includes(from), 'Mutation target missing');
      source = source.replace(from, to); mutationApplied = true;
    }
    vm.runInNewContext('(function(require,module,exports){' + source + '\n})',
      { Date, Buffer, URL, JSON, Map, Set, Promise, process: { env: { ALLOW_MOCK_PAY: 'true' } }, console: { error() {} } },
      { filename: file })(req, m, m.exports);
    return m.exports;
  }
  const shared = name => load(path.join(root, 'cloudfunctions/_shared', name));
  const writer = shared('orderWrite').createOrderWriter(server);
  const pay = shared('payFlow').createPayFlow(cloud, server);
  const actions = load(path.join(root, 'cloudfunctions/order/index')).main;
  const event = { requestId: 'synthetic_request_001', serviceCode: 'trash', communityId: user.communityId };
  const context = { community, building, config, now, onDutyCount: 1, slot: null,
    detail: { bags: 1, sorted: true, placement: 'door' }, note: 'synthetic-only',
    pricing: { listPrice: 500, discount: 400, payAmount: 100, goodsCap: 0, freeByMembership: false } };
  const auth = { user, openid: user.openid };
  return { data, writes, writer, pay, actions, event, context, user, auth,
    create: () => writer.create({ ...event, detail: context.detail, note: context.note, slot: context.slot }, user, context), conflict: () => { failNext = true; },
    current: () => clone(data.orders[0]), snapshot: () => JSON.stringify(data) };
}

const cases = [];
async function check(name, fn) {
  try { await fn(); cases.push({ name, passed: true }); }
  catch (e) { cases.push({ name, passed: false, error: e.message }); }
}
const code = expected => e => e.code === expected;
async function paid() { const h = harness(); const o = await h.create();
  await h.actions.mockPay({ orderId: o._id }, h.auth); return h; }

module.exports = { harness };

if (require.main === module) (async () => {
  await check('create: 25 identical retries produce one order and one revision', async () => {
    const h = harness(); const first = await h.create(); const n = h.writes.length;
    for (let i = 0; i < 25; i++) { const o = await h.create(); assert.equal(o._id, first._id); assert.equal(o.createdNow, false); }
    assert.equal(h.data.orders.length, 1); assert.equal(h.data.users[0].orderRevision, 1); assert.equal(h.writes.length, n);
  });
  await check('create: same request ID with changed details rejected without writes', async () => {
    const h = harness(); await h.create(); const before = h.snapshot(); h.context.detail.bags = 2;
    await assert.rejects(h.create, code('E_CONFLICT')); assert.equal(h.snapshot(), before);
  });
  await check('create: same request after closed or refunded returns original, never reopens', async () => {
    for (const state of ['closed', 'cancelled']) { const h = harness(); const o = await h.create();
      if (state === 'cancelled') await h.actions.mockPay({ orderId: o._id }, h.auth);
      await h.actions.cancel({ orderId: o._id }, h.auth); const before = h.snapshot();
      const again = await h.create(); assert.equal(again.status, state); assert.equal(h.snapshot(), before); }
  });
  await check('create: 20 overlapping callers under serialized transactions create once', async () => {
    const h = harness(); const rows = await Promise.all(Array.from({ length: 20 }, () => h.create()));
    assert.equal(new Set(rows.map(x => x._id)).size, 1); assert.equal(rows.filter(x => x.createdNow).length, 1);
    assert.equal(h.data.users[0].orderRevision, 1);
  });
  await check('payment: 25 repeated mockPay handlers do not change state/events/statistics', async () => {
    const h = await paid(); const before = h.snapshot(), n = h.writes.length;
    for (let i = 0; i < 25; i++) await h.actions.mockPay({ orderId: h.current()._id }, h.auth);
    assert.equal(h.snapshot(), before); assert.equal(h.writes.length, n);
    assert.equal(h.data.users[0].paidOrderCount, 1); assert.equal(h.data.events.length, 1); assert.equal(h.current().timeline.length, 2);
  });
  await check('payment: overlapping mockPay callers increment once in serialized fixture', async () => {
    const h = harness(); const o = await h.create(); await Promise.all(Array.from({ length: 20 }, () => h.actions.mockPay({ orderId: o._id }, h.auth)));
    assert.equal(h.data.users[0].paidOrderCount, 1); assert.equal(h.data.events.length, 1); assert.equal(h.current().timeline.length, 2);
  });
  await check('payment: altered transaction, amount and mode reject with unchanged state', async () => {
    const h = await paid(); const o = h.current(), before = h.snapshot();
    for (const patch of [{ transactionId: 'different' }, { amount: 101 }, { mode: 'wechat' }])
      await assert.rejects(() => h.pay.onPaid(o, { mode: 'mock', amount: 100, transactionId: 'mock_' + o._id, ...patch }), code('E_PAYMENT'));
    assert.equal(h.snapshot(), before);
  });
  await check('unpaid cancel: repeated public handler rejects, shared close stays no-op', async () => {
    const h = harness(); const o = await h.create(); await h.actions.cancel({ orderId: o._id }, h.auth);
    const before = h.snapshot(); await assert.rejects(() => h.actions.cancel({ orderId: o._id }, h.auth), code('E_BAD_STATE'));
    await h.pay.closeUnpaid(o, h.user.openid); assert.equal(h.snapshot(), before); assert.equal(h.data.users[0].paidOrderCount, 0);
  });
  await check('unpaid closed order: mockPay rejects without reopening', async () => {
    const h = harness(); const o = await h.create(); await h.actions.cancel({ orderId: o._id }, h.auth); const before = h.snapshot();
    await assert.rejects(() => h.actions.mockPay({ orderId: o._id }, h.auth)); assert.equal(h.snapshot(), before);
  });
  await check('refund: 25 repeated same-key requests preserve single refund and statistics', async () => {
    const h = await paid(); const o = h.current(); await h.actions.cancel({ orderId: o._id }, h.auth);
    const before = h.snapshot(), n = h.writes.length;
    for (let i = 0; i < 25; i++) await h.pay.requestRefund(o, 100, '住户取消订单', { key: 'cancel', to: 'cancelled', actor: h.user.openid });
    assert.equal(h.snapshot(), before); assert.equal(h.writes.length, n); assert.equal(h.current().refunds.length, 1);
    assert.equal(h.current().refunds[0].status, 'success'); assert.equal(h.data.users[0].paidOrderCount, 1);
  });
  await check('refund: repeated public cancel rejects without additional refund', async () => {
    const h = await paid(); const o = h.current(); await h.actions.cancel({ orderId: o._id }, h.auth); const before = h.snapshot();
    for (let i = 0; i < 5; i++) await assert.rejects(() => h.actions.cancel({ orderId: o._id }, h.auth), code('E_BAD_STATE'));
    assert.equal(h.snapshot(), before);
  });
  await check('refund: concurrent same-key reservation creates one refund under fixture serialization', async () => {
    const h = await paid(); const o = h.current();
    await Promise.all(Array.from({ length: 20 }, () => h.pay.requestRefund(o, 100, '住户取消订单', { key: 'cancel', to: 'cancelled', actor: h.user.openid })));
    assert.equal(h.current().refunds.length, 1); assert.equal(h.current().timeline.length, 3); assert.equal(h.data.users[0].paidOrderCount, 1);
  });
  await check('refunded order: duplicate payment returns cancelled without new writes', async () => {
    const h = await paid(); const o = h.current(); await h.actions.cancel({ orderId: o._id }, h.auth); const before = h.snapshot(), n = h.writes.length;
    const r = await h.actions.mockPay({ orderId: o._id }, h.auth); assert.equal(r.status, 'cancelled');
    assert.equal(h.snapshot(), before); assert.equal(h.writes.length, n);
  });
  await check('refund: changed amount or new key exceeding remaining amount rejects', async () => {
    const h = await paid(); const o = h.current(); await h.actions.cancel({ orderId: o._id }, h.auth); const before = h.snapshot();
    await assert.rejects(() => h.pay.requestRefund(o, 99, '测试', { key: 'cancel' }), code('E_CONFLICT'));
    await assert.rejects(() => h.pay.requestRefund(o, 100, '测试', { key: 'different' })); assert.equal(h.snapshot(), before);
  });
  await check('refund result: duplicate/late callbacks cannot downgrade success or double refund', async () => {
    const h = await paid(); const o = h.current(); await h.actions.cancel({ orderId: o._id }, h.auth); const refund = h.current().refunds[0];
    for (const state of ['success', 'failed', 'processing', 'success']) await h.pay.setRefundResult(o._id, refund, state);
    assert.equal(h.current().refunds.length, 1); assert.equal(h.current().refunds[0].status, 'success');
    assert.equal(h.current().timeline.length, 3); assert.equal(h.data.users[0].paidOrderCount, 1);
  });
  await check('identity: other resident cannot pay or cancel; zero writes', async () => {
    const h = harness(); const o = await h.create(), before = h.snapshot(); const other = { openid: 'other', user: { ...h.user, openid: 'other' } };
    for (const name of ['mockPay', 'cancel']) await assert.rejects(() => h.actions[name]({ orderId: o._id }, other), code('E_FORBIDDEN'));
    assert.equal(h.snapshot(), before);
  });
  for (const operation of ['create', 'payment', 'refund']) await check(operation + ': injected transaction conflict has no partial writes; retry succeeds', async () => {
    const h = operation === 'refund' ? await paid() : harness();
    if (operation === 'payment') await h.create();
    const run = operation === 'create' ? h.create : operation === 'payment'
      ? () => h.actions.mockPay({ orderId: h.current()._id }, h.auth)
      : () => h.actions.cancel({ orderId: h.current()._id }, h.auth);
    const before = h.snapshot(); h.conflict(); await assert.rejects(run, code('E_CONFLICT')); assert.equal(h.snapshot(), before);
    await run(); assert.equal(h.current().status, { create: 'pending_pay', payment: 'paid', refund: 'cancelled' }[operation]);
  });
  const result = { scope: 'offline actual handlers/shared code; synthetic serialized database, no cloud API or real money',
    limits: 'No CloudBase conflict isolation, real session identity, network retry or cloud idempotency claim',
    mutation, mutationApplied,
    passed: cases.filter(x => x.passed).length, total: cases.length, cases };
  console.log(JSON.stringify(result, null, 2)); if (result.passed !== result.total) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
