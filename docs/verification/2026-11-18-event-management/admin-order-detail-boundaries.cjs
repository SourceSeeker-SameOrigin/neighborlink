// Actual admin order detail with synthetic users and intercepted read/write calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const order = { _id: 'synthetic-order', status: 'paid', kind: 'service', serviceCode: 'trash', communityId: 'synthetic-community',
  pricing: { payAmount: 500, goodsCap: 0 }, detail: { bags: 1 }, slot: null, timeline: [], refunds: [] };
const provider = { _id: 'synthetic-provider', name: '测试服务员' };
const reply = (name, action) => action === 'detail' ? order : action === 'listProviders' ?
  { list: [provider], hasMore: false } : {};
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/order/order.js');
  page.onLoad({ id: order._id });
  return { env, page };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(reply);
    await page.load();
    results.push({ case: 'normal-admin-read', pass: page.data.order?._id === order._id && page.data.readOnly === false });
  }
  {
    const wait = deferred();
    const { env, page } = fixture((name, action) => action === 'detail' ? wait.promise : reply(name, action));
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    wait.resolve(order);
    await read;
    results.push({ case: 'late-detail-after-identity-change', pass: !page.data.order && page.data.readOnly,
      observed: { order: page.data.order?._id, readOnly: page.data.readOnly } });
  }
  {
    let fail = false;
    const { page } = fixture((name, action) => action === 'detail' && fail ? Promise.reject(Error('读取被拒')) : reply(name, action));
    await page.load();
    fail = true;
    await page.load();
    results.push({ case: 'failed-recheck-clears-old-detail', pass: !page.data.order && page.data.readOnly,
      observed: { order: page.data.order?._id, readOnly: page.data.readOnly } });
  }
  {
    const { env, page } = fixture(reply);
    await page.load();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.assign();
    results.push({ case: 'old-assign-after-identity-change', pass: !env.requests.some(request => request[1] === 'assign'),
      observed: { assignCalls: env.requests.filter(request => request[1] === 'assign').length } });
  }
  {
    const { env, page } = fixture(reply);
    env.wx.showModal = options => options.success({ confirm: true });
    await page.load();
    const cancel = page.cancel();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await cancel;
    results.push({ case: 'old-cancel-confirm-after-identity-change', pass: !env.requests.some(request => request[1] === 'forceCancel'),
      observed: { cancelCalls: env.requests.filter(request => request[1] === 'forceCancel').length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users and order; all CloudBase calls intercepted',
    pass: results.filter(result => result.pass).length, fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
