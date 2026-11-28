// Actual task page + production report validator; synthetic media only.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { CHECKLIST, cleanReport } = require('../../../cloudfunctions/_shared/vacant');
const assert = require('assert');
const fs = require('fs');
const results = [];
async function check(name, fn) {
  try { results.push({ name, pass: true, observed: await fn() }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
async function fixture(target) {
  const order = { _id: 'synthetic-vacant', serviceCode: 'vacant', status: 'in_service',
    featureEnabled: true, detail: {}, pricing: {}, slot: {} };
  const state = { uploads: 0, submitted: 0, accepted: 0 };
  const env = runtime(async (name, action, data) => {
    if (action === 'detail') return JSON.parse(JSON.stringify(order));
    if (action === 'recordReport') {
      state.submitted++;
      const report = cleanReport(data, order);
      state.accepted++;
      return report;
    }
    throw Error('Unexpected business operation');
  }, { media: { uploadPhotos: async folder => ['cloud://synthetic-env/' + folder + '/' + (++state.uploads) + '.jpg'] } });
  const page = env.instance('miniprogram/provider/task/task.js');
  page.onLoad({ id: order._id }); await page.onShow();
  for (const key of Object.keys(CHECKLIST)) {
    page.checklist({ currentTarget: { dataset: { key } }, detail: { value: ['done'] } });
    page.data.photoByItem[key] = key === target ? [] : ['cloud://synthetic-env/vacant/' + order._id + '/' + key + '/seed.jpg'];
  }
  return { page, env, order, state,
    upload: () => page.vacantPhoto({ currentTarget: { dataset: { key: target } } }) };
}
(async () => {
  for (const key of Object.keys(CHECKLIST)) for (const attempts of [1, 3, 4, 5]) {
    await check(key + '-attempts-' + attempts, async () => {
      const f = await fixture(key);
      for (let i = 0; i < attempts; i++) await f.upload();
      await f.page.submitVacantReport();
      const observed = { attempts, photos: f.page.data.photoByItem[key].length, ...f.state, error: f.page.data.error };
      assert.equal(observed.photos, Math.min(attempts, 3), JSON.stringify(observed));
      assert.equal(observed.accepted, 1, JSON.stringify(observed));
      return observed;
    });
  }
  for (const key of Object.keys(CHECKLIST)) {
    for (const count of [3, 4, 5]) await check(key + '-remove-from-' + count, async () => {
      const f = await fixture(key);
      const files = Array.from({ length: count }, (_, i) => 'cloud://synthetic-env/vacant/' + f.order._id + '/' + key + '/old-' + i + '.jpg');
      f.page.setData({ ['photoByItem.' + key]: files });
      const remove = () => f.page.removeVacantPhoto({ currentTarget: { dataset: { key, index: 0, file: f.page.data.photoByItem[key][0] } } });
      // Existing oversized drafts can be corrected; at the limit a replacement is possible.
      while (f.page.data.photoByItem[key].length > 2) await remove();
      await f.upload(); await f.page.submitVacantReport();
      assert.equal(f.state.accepted, 1); assert.equal(f.page.data.photoByItem[key].length, 3);
      assert.equal(f.state.uploads, 1); assert.equal(files.length, count, 'source array must not be mutated');
      return { accepted: f.state.accepted, uploads: f.state.uploads };
    });
    for (const count of [0, 4]) await check(key + '-invalid-submit-' + count, async () => {
      const f = await fixture(key);
      f.page.setData({ ['photoByItem.' + key]: Array.from({ length: count }, (_, i) => 'synthetic-' + i) });
      await f.page.submitVacantReport();
      assert.equal(f.state.submitted, 0); assert.ok(f.page.data.error.includes(CHECKLIST[key].replace('开窗通风30分钟', '开窗通风 30 分钟')));
      assert.equal(f.page.data.busy, false); return { submitted: 0, error: f.page.data.error };
    });
  }
  for (const boundary of ['hidden', 'unloaded', 'busy', 'uploading', 'loading', 'completed', 'disabled', 'wrong-key', 'wrong-index', 'old-file']) {
    await check('remove-guard-' + boundary, async () => {
      const f = await fixture('windows'); await f.upload();
      const event = { currentTarget: { dataset: { key: 'windows', index: 0, file: f.page.data.photoByItem.windows[0] } } };
      if (boundary === 'hidden') f.page.onHide();
      if (boundary === 'unloaded') f.page.onUnload();
      if (['busy', 'uploading', 'loading'].includes(boundary)) f.page.data[boundary] = true;
      if (boundary === 'completed') f.page.data.order.status = 'delivered';
      if (boundary === 'disabled') f.page.data.order.featureEnabled = false;
      if (boundary === 'wrong-key') event.currentTarget.dataset.key = 'unknown';
      if (boundary === 'wrong-index') event.currentTarget.dataset.index = -1;
      if (boundary === 'old-file') event.currentTarget.dataset.file = 'synthetic-replaced-file';
      const before = JSON.stringify(f.page.data.photoByItem);
      await f.page.removeVacantPhoto(event);
      assert.equal(JSON.stringify(f.page.data.photoByItem), before);
    });
  }
  for (const kind of ['identity', 'order']) await check('remove-after-' + kind + '-change-reloads-only', async () => {
    const f = await fixture('windows'); await f.upload();
    const files = f.page.data.photoByItem.windows;
    const reads = f.env.requests.length;
    if (kind === 'identity') f.env.app.globalData.user = { _id: 'synthetic-new-provider' };
    else f.page.orderId = 'synthetic-another-order';
    await f.page.removeVacantPhoto({ currentTarget: { dataset: { key: 'windows', index: 0, file: files[0] } } });
    assert.equal(files.length, 1); assert.equal(f.env.requests.length, reads + 1);
    assert.equal(f.env.requests.at(-1)[1], 'detail');
  });
  await check('photo-edit-template-contract-only', async () => {
    const source = fs.readFileSync('miniprogram/provider/task/task.wxml', 'utf8');
    assert.ok(source.includes('bindtap="removeVacantPhoto"'));
    assert.ok(source.includes('data-file="{{photo}}"'));
    assert.ok(source.includes('checked="{{checklist[item.key]}}"'));
    assert.ok(source.includes('photoByItem[item.key].length >= 3'));
    return { actualVisualVerified: false };
  });
  console.log(JSON.stringify({ scope: 'Actual page and production validator, synthetic files; no cloud writes',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
