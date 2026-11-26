// Actual P23 page with synthetic identities, poster URLs, and intercepted native APIs.
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const results = [];
const poster = { tempFileURL: 'https://example.invalid/synthetic-poster.png', scene: 'r=synthetic' };
const wait = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture(handler) {
  const env = runtime(async (name, action, data) => {
    if (action === 'listCommunities') return { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
    if (action === 'listProviders') return { list: [{ _id: 'provider-a', realName: '合成服务员' },
      { _id: 'provider-b', realName: '合成服务员B' }], hasMore: false };
    if (action === 'getCommunity') return { buildings: [{ _id: 'building-a', name: '合成楼栋' }] };
    if (action === 'genPoster') return handler ? handler(data) : poster;
    throw Error('Unexpected ' + action);
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/posters/posters.js');
  const events = { downloads: 0, saves: 0, previews: 0, toasts: 0 };
  let download, album;
  env.wx.downloadFile = options => { events.downloads++; download = options; };
  env.wx.saveImageToPhotosAlbum = options => { events.saves++; album = options; };
  env.wx.previewImage = () => { events.previews++; };
  env.wx.showToast = () => { events.toasts++; };
  return { env, page, events, download: () => download, album: () => album };
}

async function ready(f) {
  await f.page.load();
  assert.equal(f.page.data.ready, true);
  assert.equal(f.page.data.communityReady, true);
}
const providerEvent = { currentTarget: { dataset: { type: 'provider' } } };
async function generated(f) { await ready(f); await f.page.generate(providerEvent); assert(f.page.data.poster); }
async function test(name, body) {
  try { await body(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}

(async () => {
  await test('current admin can generate and save after native callback', async () => {
    const f = fixture(); await generated(f); f.page.save();
    assert.equal(f.events.downloads, 1);
    f.download().success({ statusCode: 200, tempFilePath: 'synthetic-file' });
    assert.equal(f.events.saves, 1);
    f.album().success({}); assert.equal(f.events.toasts, 1);
  });
  await test('identity change blocks old generate action', async () => {
    const f = fixture(); await ready(f);
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    await f.page.generate(providerEvent);
    assert.equal(f.env.requests.filter(row => row[1] === 'genPoster').length, 0);
  });
  await test('malformed poster result cannot be saved', async () => {
    const f = fixture(() => ({ scene: 'r=synthetic' })); await ready(f);
    await f.page.generate(providerEvent); f.page.save();
    assert.equal(f.page.data.poster, null);
    assert.equal(f.events.downloads, 0);
    assert(f.page.data.error.includes('海报码暂不可用'));
  });
  await test('identity change rejects late generated poster', async () => {
    const pending = wait(); const f = fixture(() => pending.promise); await ready(f);
    const task = f.page.generate(providerEvent); await tick();
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    pending.resolve(poster); await task;
    assert.equal(f.page.data.poster, null);
  });
  await test('hide rejects late generated poster', async () => {
    const pending = wait(); const f = fixture(() => pending.promise); await ready(f);
    const task = f.page.generate(providerEvent); await tick();
    f.page.onHide(); pending.resolve(poster); await task;
    assert.equal(f.page.data.poster, null);
  });
  await test('target change releases busy state and ignores old result', async () => {
    const pending = wait(); const f = fixture(() => pending.promise); await ready(f);
    const task = f.page.generate(providerEvent); await tick();
    f.page.providerChange({ detail: { value: 1 } });
    assert.equal(f.page.data.busy, false);
    pending.resolve(poster); await task;
    assert.equal(f.page.data.poster, null);
    assert.equal(f.page.data.providerIndex, 1);
  });
  await test('identity change during generation allows fresh read', async () => {
    const pending = wait(); const f = fixture(() => pending.promise); await ready(f);
    const task = f.page.generate(providerEvent); await tick();
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    pending.resolve(poster); await task; await tick();
    assert.equal(f.page.data.busy, false);
    assert.equal(f.page.ownerId, 'admin-b');
    assert.equal(f.page.data.poster, null);
  });
  await test('current preview opens only while still visible', async () => {
    const f = fixture(); await generated(f);
    await f.page.preview(); assert.equal(f.events.previews, 1);
    const late = f.page.preview(); f.page.onHide(); await late;
    assert.equal(f.events.previews, 1);
  });
  await test('identity change clears old poster before save', async () => {
    const f = fixture(); await generated(f);
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    f.page.save(); await tick();
    assert.equal(f.events.downloads, 0);
    assert.equal(f.page.data.poster, null);
  });
  await test('unload blocks direct save and preview', async () => {
    const f = fixture(); await generated(f); f.page.onUnload();
    f.page.save(); f.page.preview(); await tick();
    assert.equal(f.events.downloads, 0); assert.equal(f.events.previews, 0);
  });
  for (const kind of ['hide', 'identity', 'target']) {
    await test(kind + ' rejects late download before album save', async () => {
      const f = fixture(); await generated(f); f.page.save();
      if (kind === 'hide') f.page.onHide();
      if (kind === 'identity') f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
      if (kind === 'target') f.page.providerChange({ detail: { value: 1 } });
      f.download().success({ statusCode: 200, tempFilePath: 'synthetic-file' });
      assert.equal(f.events.saves, 0);
    });
  }
  await test('unload ignores late album result', async () => {
    const f = fixture(); await generated(f); f.page.save();
    f.download().success({ statusCode: 200, tempFilePath: 'synthetic-file' });
    assert.equal(f.events.saves, 1);
    f.page.onUnload(); f.album().success({});
    assert.equal(f.events.toasts, 0);
  });
  await test('target change ignores late album failure', async () => {
    const f = fixture(); await generated(f); f.page.save();
    f.download().success({ statusCode: 200, tempFilePath: 'synthetic-file' });
    f.page.providerChange({ detail: { value: 1 } });
    f.album().fail({ errMsg: 'synthetic failure' });
    assert.equal(f.page.data.error, '');
  });
  const failed = results.filter(row => !row.pass);
  console.log(JSON.stringify({ scope: 'actual P23 page, synthetic identities and intercepted native APIs; no real cloud or album write',
    total: results.length, passed: results.length - failed.length, cases: results, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
