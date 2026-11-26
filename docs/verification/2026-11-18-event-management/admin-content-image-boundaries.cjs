// P29 image callbacks with synthetic identities and file IDs; no cloud upload.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const user = id => ({ _id: id, roles: ['admin'], communityId: 'c1' });
const tick = () => new Promise(setImmediate);
const event = field => ({ currentTarget: { dataset: { field } } });
function setup() {
  const r = runtime(async (_name, action, data) => {
    if (action === 'listCommunities') return { list: [{ _id: 'c1' }, { _id: 'c2' }], hasMore: false };
    if (action === 'listNotices' || action === 'listAds') return { list: [] };
    throw Error(action + JSON.stringify(data));
  });
  r.app.globalData.user = user('A');
  const p = r.instance('miniprogram/admin/content/content.js');
  let picker, uploads = 0;
  r.wx.chooseMedia = options => { picker = options; };
  r.wx.cloud = { uploadFile: async () => { uploads++; return { fileID: 'synthetic-photo' }; } };
  return { r, p, picker: () => picker, uploads: () => uploads,
    choose: () => picker.success({ tempFiles: [{ tempFilePath: '/synthetic/photo.jpg' }] }) };
}
async function waitPicker(s) {
  for (let n = 0; n < 10 && !s.picker(); n++) await tick();
  assert.ok(s.picker(), 'picker did not open');
}
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
(async () => {
  await check('same user image selection fills original ad field', async () => {
    const s = setup(); await s.p.load(); const pending = s.p.chooseImage(event('adImage'));
    await waitPicker(s); s.choose(); await pending;
    assert.equal(s.p.data.adImage, 'synthetic-photo'); assert.equal(s.uploads(), 1);
  });
  await check('picker hide then upload result before return waits for readback', async () => {
    const s = setup(); await s.p.load(); const pending = s.p.chooseImage(event('imageFileId'));
    await waitPicker(s); s.p.onHide(); s.choose(); await pending;
    assert.equal(s.p.data.imageFileId, ''); await s.p.onShow();
    assert.equal(s.p.data.imageFileId, 'synthetic-photo');
  });
  await check('picker return before selection result still accepts same user', async () => {
    const s = setup(); await s.p.load(); const pending = s.p.chooseImage(event('adImage'));
    await waitPicker(s); s.p.onHide(); await s.p.onShow(); s.choose(); await pending;
    assert.equal(s.p.data.adImage, 'synthetic-photo');
  });
  await check('another user cannot receive old upload result', async () => {
    const s = setup(); await s.p.load(); const uploaded = deferred();
    s.r.wx.cloud.uploadFile = () => uploaded.promise;
    const pending = s.p.chooseImage(event('adImage')); await waitPicker(s); s.choose(); await tick();
    s.r.app.globalData.user = user('B'); await s.p.load();
    uploaded.resolve({ fileID: 'A-photo' }); await pending;
    assert.equal(s.p.data.adImage, ''); assert.equal(s.p.data.uploadingImage, false);
  });
  await check('real page hide during upload discards old result', async () => {
    const s = setup(); await s.p.load(); const uploaded = deferred();
    s.r.wx.cloud.uploadFile = () => uploaded.promise;
    const pending = s.p.chooseImage(event('adImage')); await waitPicker(s); s.choose(); await tick();
    s.p.onHide(); uploaded.resolve({ fileID: 'old-photo' }); await pending; await s.p.onShow();
    assert.equal(s.p.data.adImage, ''); assert.equal(s.p.data.uploadingImage, false);
  });
  await check('unload discards picker callback and skips upload', async () => {
    const s = setup(); await s.p.load(); const pending = s.p.chooseImage(event('adImage'));
    await waitPicker(s); s.p.onUnload(); s.choose(); await pending;
    assert.equal(s.uploads(), 0); assert.equal(s.p.data.adImage, '');
  });
  await check('community change discards old image result', async () => {
    const s = setup(); await s.p.load(); const uploaded = deferred();
    s.r.wx.cloud.uploadFile = () => uploaded.promise;
    const pending = s.p.chooseImage(event('adImage')); await waitPicker(s); s.choose(); await tick();
    await s.p.chooseCommunity({ detail: { value: '1' } });
    uploaded.resolve({ fileID: 'c1-photo' }); await pending;
    assert.equal(s.p.data.communityId, 'c2'); assert.equal(s.p.data.adImage, '');
  });
  await check('ad target change discards old image result', async () => {
    const s = setup(); await s.p.load(); const uploaded = deferred();
    s.r.wx.cloud.uploadFile = () => uploaded.promise;
    const pending = s.p.chooseImage(event('adImage')); await waitPicker(s); s.choose(); await tick();
    s.p.adTargetTypeChange({ detail: { value: '1' } });
    uploaded.resolve({ fileID: 'old-target-photo' }); await pending;
    assert.equal(s.p.data.adTargetType, 'merchant'); assert.equal(s.p.data.adImage, '');
  });
  await check('cancelled picker keeps previous image and releases busy state', async () => {
    const s = setup(); await s.p.load(); s.p.data.adImage = 'previous-photo';
    const pending = s.p.chooseImage(event('adImage')); await waitPicker(s);
    s.picker().fail({ errMsg: 'chooseMedia:fail cancel' }); await pending;
    assert.equal(s.p.data.adImage, 'previous-photo'); assert.equal(s.p.data.uploadingImage, false);
    assert.equal(s.p.data.error, '');
  });
  await check('second tap while picker active opens only one picker', async () => {
    const s = setup(); await s.p.load(); let opens = 0;
    s.r.wx.chooseMedia = options => { opens++; s.r.wx._picker = options; };
    const first = s.p.chooseImage(event('adImage')), second = s.p.chooseImage(event('adImage'));
    for (let n = 0; n < 10 && !s.r.wx._picker; n++) await tick();
    assert.equal(opens, 1); s.r.wx._picker.fail({ errMsg: 'chooseMedia:fail cancel' });
    await Promise.all([first, second]); assert.equal(s.p.data.uploadingImage, false);
  });
  const report = { scope: 'Actual P29 page, synthetic image callbacks and identities; no cloud files',
    total: results.length, passed: results.filter(item => item.pass).length, cases: results };
  if (process.env.QA146_SAVE === '1') fs.writeFileSync('docs/verification/2026-11-18-event-management/qa146-after.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
