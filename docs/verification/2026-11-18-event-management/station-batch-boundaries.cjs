// Actual P65 page; all cloud, camera, file upload and dialog calls are synthetic.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const PAGE = 'miniprogram/station/batch/batch.js';
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const batch = (id = 'batch-A') => ({ _id: id, status: 'assigned', startedAt: '2026-11-25T01:00:00Z', pendingCount: 1,
  deliveredCount: 0, skippedCount: 0, items: [{ _id: 'item-A', buildingName: '合成楼', unit: '1单元', room: '101', status: 'pending' }] });
async function setup() {
  const reads = [], uploads = [], modals = [], writes = [], calls = [], mutations = [], consents = [], notices = [];
  const state = { deferRead: false, rejectRead: false, deferUpload: false, deferMutation: false, deferConsent: false,
    consent: true, uploadCalls: 0, transformBatch: value => value };
  const env = runtime(async (name, action, data) => {
    calls.push({ action, data: structuredClone(data) });
    if (action === 'providerBatch') {
      if (state.deferRead) { const d = deferred(); reads.push(d); return d.promise; }
      if (state.rejectRead) throw Object.assign(Error('合成无权访问'), { code: 'E_FORBIDDEN' });
      return state.transformBatch(batch(data.batchId));
    }
    if (action === 'checkDoorDeliveryConsent') {
      if (state.deferConsent) { const d = deferred(); consents.push(d); return d.promise; }
      return { allowed: state.consent };
    }
    if (action === 'startBatch' || action === 'recordDelivery') {
      if (state.deferMutation) { const d = deferred(); mutations.push(d); return d.promise; }
      return { status: 'assigned' };
    }
    throw Error('Unexpected action ' + action);
  }, { media: { uploadPhotos: async () => {
    state.uploadCalls++;
    if (!state.deferUpload) return ['cloud://synthetic/station/batch-A/photo.jpg'];
    const d = deferred(); uploads.push(d); return d.promise;
  } } });
  env.app.globalData.user = { _id: 'provider-A', roles: ['provider'], communityId: 'community-A' };
  env.wx.showModal = o => modals.push(o);
  env.wx.showToast = o => notices.push(o.title);
  const page = env.instance(PAGE); page.onLoad({ id: 'batch-A' }); page.visible = true; await page.load();
  const setData = page.setData.bind(page); page.setData = p => { writes.push(structuredClone(p)); setData(p); };
  return { env, page, state, calls, reads, uploads, modals, writes, mutations, consents, notices };
}
async function boundary(s, kind) {
  if (kind === 'hide') s.page.onHide();
  if (kind === 'unload') s.page.onUnload();
  if (kind === 'user') s.env.app.globalData.user = { _id: 'provider-B', roles: ['provider'], communityId: 'community-A' };
  if (kind === 'batch') s.page.batchId = 'batch-B';
  if (kind === 'refresh') await s.page.load();
  if (kind === 'denied') { s.state.rejectRead = true; await s.page.load(); }
}
async function run() {
  const results = [], event = { currentTarget: { dataset: { id: 'item-A' } } };
  async function check(name, body) { const evidence = {}; try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (e) { results.push({ name, pass: false, evidence, error: e.message }); } }
  await check('normal-read', async e => { const s = await setup(); e.batchId = s.page.data.batch._id; assert.equal(e.batchId, 'batch-A'); });
  for (const action of ['start', 'delivered', 'failed', 'cancel']) await check('normal-' + action, async e => {
    const s = await setup(); if (action === 'start') s.page.data.batch.startedAt = null;
    const job = action === 'start' ? s.page.start() : action === 'delivered' ? s.page.delivered(event) : s.page.failed(event);
    await tick(); if (s.modals[0]) s.modals[0].success({ confirm: action !== 'cancel', content: '合成原因' }); await job;
    e.writes = s.calls.filter(c => ['startBatch', 'recordDelivery'].includes(c.action)); assert.equal(e.writes.length, action === 'cancel' ? 0 : 1);
    if (e.writes.length) assert.equal(e.writes[0].data.batchId, 'batch-A');
  });
  await check('denied-clears-previous-addresses', async e => { const s = await setup(); await boundary(s, 'denied');
    e.oldBatchRetained = !!s.page.data.batch; e.error = s.page.data.error; assert.equal(e.oldBatchRetained, false); });
  await check('read-order-newest-wins', async e => { const s = await setup(); s.state.deferRead = true;
    const a = s.page.load(); await tick(); const b = s.page.load(); await tick(); s.reads[1].resolve({ ...batch(), revision: 'new' }); await b;
    s.reads[0].resolve({ ...batch(), revision: 'old' }); await a; e.revision = s.page.data.batch?.revision; assert.equal(e.revision, 'new'); });
  for (const kind of ['hide', 'unload', 'user', 'batch']) await check('late-read-' + kind, async e => {
    const s = await setup(); s.state.deferRead = true; const job = s.page.load(); await tick(); await boundary(s, kind); const before = s.writes.length;
    s.reads[0].resolve(batch()); await job; e.uiWrites = s.writes.length - before; assert.equal(e.uiWrites, 0);
  });
  for (const kind of ['hide', 'unload', 'user', 'batch', 'denied']) await check('old-start-' + kind, async e => {
    const s = await setup(); s.page.data.batch.startedAt = null;
    await boundary(s, kind); await s.page.start(); e.calls = s.calls.filter(c => c.action === 'startBatch'); assert.equal(e.calls.length, 0);
  });
  for (const kind of ['hide', 'unload', 'user', 'batch', 'refresh']) await check('old-confirm-' + kind, async e => {
    const s = await setup(); const job = s.page.failed(event); await tick(); await boundary(s, kind);
    s.modals[0].success({ confirm: true, content: '合成原因' }); await job;
    e.calls = s.calls.filter(c => c.action === 'recordDelivery'); assert.equal(e.calls.length, 0);
  });
  for (const kind of ['hide', 'unload', 'user', 'batch', 'refresh']) await check('late-upload-' + kind, async e => {
    const s = await setup(); s.state.deferUpload = true; const job = s.page.delivered(event); await tick(); await boundary(s, kind);
    s.uploads[0].resolve(['cloud://synthetic/station/batch-A/photo.jpg']); await job;
    e.calls = s.calls.filter(c => c.action === 'recordDelivery'); assert.equal(e.calls.length, 0);
  });
  return { scope: 'actual page, synthetic responses; zero real cloud or native calls', pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results };
}
if (require.main === module) run().then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.fail ? 1 : 0; });
module.exports = { run, setup, tick, batch, boundary };
