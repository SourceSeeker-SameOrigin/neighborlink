const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const rows = (id, hasMore = false) => ({ list: [{ _id: id, createdAt: 1795000000000 }], hasMore });

async function claimWhileAway(name, action, fail) {
  const pending = deferred();
  let reads = 0, writes = 0, toasts = 0;
  const r = runtime(async (_, method) => {
    if (method === action) { writes++; return pending.promise; }
    assert.equal(method, name); reads++;
    return rows('read-' + reads);
  });
  r.wx.showToast = () => { toasts++; };
  const p = r.instance('miniprogram/coupons/' + name + '/' + name + '.js');
  const submit = () => name === 'mine' ? p.retryWelcome() : p.claim({ currentTarget: { dataset: { id: 'sample' } } });
  await p.onShow();
  const submission = submit();
  await submit();
  p.onHide();
  const returned = p.onShow();
  await tick();
  assert.equal(reads, 1);
  await submit();
  if (fail) pending.reject(Error('旧申请失败')); else pending.resolve({});
  await Promise.all([returned, submission]);
  assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(toasts, 0);
  assert.equal(p.data.list[0]._id, 'read-2');
  assert.equal(p.data.error, ''); assert.equal(p.data.retryError || '', '');
  assert.equal(p.data.busy || p.data.retrying || false, false);
}

async function pages() {
  const pending = deferred();
  const offsets = [];
  const r = runtime(async (_, action, data) => {
    assert.equal(action, 'listNotices'); offsets.push(data.offset);
    if (offsets.length === 1) return { ...rows('old', true), nextOffset: 1 };
    if (offsets.length === 2) return pending.promise;
    if (offsets.length === 3) return { ...rows('new', true), nextOffset: 1 };
    return rows('next');
  });
  const p = r.instance('miniprogram/notices/list/list.js');
  await p.onShow();
  const append = p.loadMore();
  await p.loadMore();
  await tick();
  p.onHide(); await p.onShow();
  pending.resolve(rows('late', true)); await append;
  await p.loadMore();
  assert.deepEqual(offsets, [0, 1, 0, 1]);
  assert.equal(p.data.list.map(item => item._id).join(','), 'new,next');
  assert.equal(p.data.offset, 2); assert.equal(p.data.hasMore, false);
}
(async () => {
  for (const fail of [false, true]) {
    await claimWhileAway('center', 'claim', fail);
    await claimWhileAway('mine', 'retryWelcomeCoupons', fail);
  }
  await pages();
  console.log('5/5: coupon return with pending success/failure, duplicate taps and notice pagination');
})().catch(error => { console.error(error); process.exitCode = 1; });
