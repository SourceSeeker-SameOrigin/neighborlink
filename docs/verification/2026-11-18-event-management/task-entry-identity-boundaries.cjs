// Diagnostic: actual pages and entry helper, synthetic identity and credential only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: e.message }); }
}
async function fixture(kind) {
  const reads = [];
  const env = runtime(async (n, a, d) => {
    if (a === 'revealEntry') return new Promise((resolve, reject) => reads.push({ resolve, reject, data: d }));
    if (a === 'listVisits') return { list: [{ _id: 'synthetic-visit', status: 'pending' }], status: 'in_service', entryMode: 'password' };
    if (a === 'detail') return { serviceCode: 'vacant', status: 'in_service', featureEnabled: true, detail: { entry: 'password' }, pricing: {}, slot: {} };
    throw Error('Unexpected call');
  }, { media: {} });
  env.app.globalData.user = { _id: 'synthetic-provider-a' };
  const page = env.instance(kind === 'pet' ? 'miniprogram/pet/work.js' : 'miniprogram/provider/task/task.js');
  page.onLoad({ id: 'synthetic-order-a' }); await page.onShow();
  return { env, page, reads, reveal: () => kind === 'pet' ? page.reveal({ currentTarget: { dataset: { id: 'synthetic-visit' } } }) : page.revealEntry() };
}
(async () => {
  for (const kind of ['pet', 'vacant']) {
    for (const outcome of ['success', 'failure']) for (const boundary of ['same', 'hidden', 'changed-user', 'changed-order']) {
      await check(kind + '-response-' + outcome + '-' + boundary, async () => {
        const f = await fixture(kind), pending = f.reveal(); assert.equal(f.reads.length, 1);
        if (boundary === 'hidden') f.page.onHide();
        if (boundary === 'changed-user') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
        if (boundary === 'changed-order') f.page.orderId = 'synthetic-order-b';
        if (outcome === 'success') f.reads[0].resolve({ entry: 'synthetic-not-a-real-secret' });
        else f.reads[0].reject(Error('synthetic denied'));
        await pending;
        assert.equal(Boolean(f.page.data.entryPassword), boundary === 'same' && outcome === 'success', 'credential display must match original identity and task');
        assert.equal(Boolean(f.page.data.error), boundary === 'same' && outcome === 'failure', 'old errors must not affect new task');
        if (boundary.startsWith('changed')) {
          assert.equal(f.reads.length, 1, 'refresh must not automatically read credential');
          assert.equal(f.page.data.readingEntry, false);
          assert.equal(f.page.taskContext.userId, f.env.app.globalData.user._id);
          assert.equal(f.page.taskContext.orderId, f.page.orderId);
          const next = f.reveal(); assert.equal(f.reads.length, 2);
          assert.equal(f.reads[1].data.orderId, f.page.orderId);
          f.reads[1].resolve({ entry: 'synthetic-current' }); await next;
          assert.equal(f.page.data.entryPassword, 'synthetic-current');
        }
      });
    }
    for (const boundary of ['changed-user', 'changed-order']) {
      await check(kind + '-start-' + boundary, async () => {
        const f = await fixture(kind);
        f.page.data.entryPassword = 'synthetic-old';
        if (boundary === 'changed-user') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
        else f.page.orderId = 'synthetic-order-b';
        const pending = f.reveal();
        for (const read of f.reads) read.resolve({ entry: 'synthetic-not-a-real-secret' });
        await pending;
        assert.equal(f.reads.length, 0, 'stale task must not request credential');
        assert.equal(f.page.data.entryPassword, '');
      });
    }
  }
  for (const boundary of ['changed-user', 'changed-order']) for (const outcome of ['success', 'failure']) {
    await check('pet-list-' + boundary + '-' + outcome, async () => {
      let complete;
      const env = runtime((n, a) => {
        assert.equal(a, 'listVisits');
        return new Promise((resolve, reject) => { complete = { resolve, reject }; });
      }, { media: {} });
      env.app.globalData.user = { _id: 'synthetic-provider-a' };
      const p = env.instance('miniprogram/pet/work.js'); p.onLoad({ id: 'synthetic-order-a' });
      const pending = p.onShow(); for (let i = 0; i < 8; i++) await Promise.resolve();
      if (boundary === 'changed-user') env.app.globalData.user = { _id: 'synthetic-provider-b' };
      else p.orderId = 'synthetic-order-b';
      if (outcome === 'success') complete.resolve({ list: [{ _id: 'old-visit', status: 'pending' }], entryMode: 'password' });
      else complete.reject(Error('old list error'));
      await pending;
      assert.equal(p.data.visits.length, 0); assert.equal(p.data.error, ''); assert.equal(p.taskContext, null);
    });
  }
  console.log(JSON.stringify({ scope: 'synthetic identity and credential; no cloud reads', pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results }, null, 2));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})();
