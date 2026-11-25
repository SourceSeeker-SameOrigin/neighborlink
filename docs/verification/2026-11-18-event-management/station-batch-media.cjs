// Synthetic system-media lifecycle and API callbacks; no camera, cloud or file writes.
const assert = require('node:assert/strict');
const { setup, tick, batch, boundary } = require('./station-batch-boundaries.cjs');
const event = { currentTarget: { dataset: { id: 'item-A' } } };
const files = ['cloud://synthetic/station/batch-A/photo.jpg'];
const records = s => s.calls.filter(c => c.action === 'recordDelivery');
async function run() {
  const results = [];
  async function check(name, body) { const evidence = {}; try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (e) { results.push({ name, pass: false, evidence, error: e.message }); } }
  for (const order of ['result-first', 'show-first']) await check('normal-camera-return-' + order, async e => {
    const s = await setup(); s.state.deferUpload = true; const job = s.page.delivered(event); await tick(); s.page.onHide();
    if (order === 'result-first') { s.uploads[0].resolve(files); await job; assert.equal(records(s).length, 0); await s.page.onShow(); }
    else { await s.page.onShow(); s.uploads[0].resolve(files); await job; }
    e.records = records(s); assert.equal(e.records.length, 1); assert.equal(e.records[0].data.batchId, 'batch-A');
    assert.equal(s.page.data.busy, false); assert.equal(s.page.data.ready, true);
  });
  for (const kind of ['user', 'batch', 'denied']) await check('camera-return-recheck-' + kind, async e => {
    const s = await setup(); s.state.deferUpload = true; const job = s.page.delivered(event); await tick(); s.page.onHide();
    await boundary(s, kind); s.uploads[0].resolve(files); await job; await s.page.onShow();
    e.records = records(s).length; e.busy = s.page.data.busy; assert.equal(e.records, 0); assert.equal(e.busy, false);
  });
  for (const status of ['delivered', 'failed', 'skipped', 'missing']) await check('camera-return-item-' + status, async e => {
    const s = await setup(); s.state.deferUpload = true; const job = s.page.delivered(event); await tick(); s.page.onHide();
    s.state.transformBatch = b => ({ ...b, items: status === 'missing' ? [] : b.items.map(i => ({ ...i, status })) });
    s.uploads[0].resolve(files); await job; await s.page.onShow(); e.records = records(s).length;
    assert.equal(e.records, 0); assert.equal(s.page.data.busy, false);
  });
  for (const outcome of ['cancel', 'error', 'empty']) await check('media-' + outcome, async e => {
    const s = await setup(); s.state.deferUpload = true; const job = s.page.delivered(event); await tick();
    if (outcome === 'empty') s.uploads[0].resolve([]); else s.uploads[0].reject(Error(outcome === 'cancel' ? 'chooseMedia:fail cancel' : '合成上传失败'));
    await job; e.error = s.page.data.error; assert.equal(records(s).length, 0); assert.equal(s.page.data.busy, false);
    assert.equal(!!e.error, outcome !== 'cancel');
  });
  await check('consent-withdrawn-before-camera', async e => {
    const s = await setup(); s.state.consent = false; await s.page.delivered(event);
    e.uploads = s.state.uploadCalls; e.records = records(s).length; assert.equal(e.uploads, 0); assert.equal(e.records, 0);
  });
  for (const kind of ['hide', 'unload', 'user', 'batch', 'refresh']) await check('late-consent-' + kind, async e => {
    const s = await setup(); s.state.deferConsent = true; const job = s.page.delivered(event); await tick(); await boundary(s, kind);
    s.consents[0].resolve({ allowed: true }); await job; e.uploads = s.state.uploadCalls; assert.equal(e.uploads, 0); assert.equal(records(s).length, 0);
  });
  for (const outcome of ['success', 'error']) for (const kind of ['hide', 'unload', 'refresh']) await check('late-submit-' + outcome + '-' + kind, async e => {
    const s = await setup(); s.state.deferMutation = true; const job = s.page.failed(event); s.modals[0].success({ confirm: true }); await tick();
    await boundary(s, kind); const before = s.writes.length;
    if (outcome === 'success') s.mutations[0].resolve({ status: 'skipped' }); else s.mutations[0].reject(Error('合成迟到失败'));
    await job; e.uiWrites = s.writes.length - before; e.toasts = s.notices.length; assert.equal(e.uiWrites, 0); assert.equal(e.toasts, 0);
  });
  await check('double-confirm-opens-once', async e => {
    const s = await setup(); const a = s.page.failed(event), b = s.page.failed(event); e.modals = s.modals.length;
    s.modals[0].success({ confirm: true }); await Promise.all([a, b]); e.records = records(s).length; assert.equal(e.modals, 1); assert.equal(e.records, 1);
  });
  await check('double-camera-opens-once', async e => {
    const s = await setup(); s.state.deferUpload = true; const a = s.page.delivered(event), b = s.page.delivered(event); await tick();
    e.uploads = s.state.uploadCalls; s.uploads[0].resolve(files); await Promise.all([a, b]); e.records = records(s).length;
    assert.equal(e.uploads, 1); assert.equal(e.records, 1);
  });
  await check('wrong-batch-response-is-unusable', async e => {
    const s = await setup(); s.state.transformBatch = () => batch('other'); await s.page.load();
    e.ready = s.page.data.ready; e.batch = s.page.data.batch; assert.equal(e.ready, false); assert.equal(e.batch, null);
  });
  await check('failed-reload-then-successful-retry', async e => {
    const s = await setup(); s.state.rejectRead = true; await s.page.load(); assert.equal(s.page.data.batch, null);
    s.state.rejectRead = false; await s.page.load(); e.ready = s.page.data.ready; assert.equal(e.ready, true); assert.equal(s.page.data.error, '');
  });
  return { scope: 'synthetic lifecycle and intercepted API/media only', pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results };
}
if (require.main === module) run().then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.fail ? 1 : 0; });
