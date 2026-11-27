// Actual P54/P61 pages with synthetic users, applications and upload responses.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const stationOptions = { list: [{ _id: 'community-a', stations: [{ code: 'north', name: '北门驿站' }] }] };
const merchantFile = 'miniprogram/merchant/apply/apply.js';
const stationFile = 'miniprogram/station/apply/apply.js';
const fixture = (file, handler, overrides = {}) => {
  const env = runtime(handler, overrides);
  env.app.globalData.user = { _id: 'resident-a', communityId: 'community-a', roles: ['resident'] };
  const page = env.instance(file);
  if (file === merchantFile) env.wx.navigateBack = () => env.navigation.push(['navigateBack', '']);
  return { env, page };
};
const stationReply = async (name, action) => action === 'applicationOptions' ? stationOptions : { application: null };

(async () => {
  const results = [];
  {
    const { page } = fixture(merchantFile, async () => ({ merchant: null }));
    await page.onShow();
    results.push({ case: 'merchant-normal-read', pass: page.data.ready && page.user?._id === 'resident-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(merchantFile, async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve({ merchant: { _id: 'application-a' } });
    await read;
    results.push({ case: 'merchant-late-application-after-user-change',
      pass: !page.data.ready && !page.data.existing,
      observed: { ready: page.data.ready, application: page.data.existing?._id } });
  }
  {
    const { env, page } = fixture(merchantFile, async (name, action) =>
      action === 'myApplication' ? { merchant: null } : {});
    await page.onShow();
    page.setData({ name: '合成商家', licenseName: '合成执照', creditCode: '123456789012345678',
      contactName: '测试联系人', phone: '13800000000', licenseFileId: 'synthetic-license-a' });
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    await page.submit();
    const applications = env.requests.filter(args => args[0] === 'merchant' && args[1] === 'apply');
    results.push({ case: 'merchant-old-submit-after-user-change', pass: applications.length === 0,
      observed: { applyCalls: applications.length, communityId: applications[0]?.[2]?.communityId } });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(merchantFile, async () => ({ merchant: null }),
      { media: { uploadPhotos: async () => waiting.promise } });
    await page.onShow();
    const upload = page.upload();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve(['synthetic-license-a']);
    await upload;
    results.push({ case: 'merchant-old-upload-after-user-change', pass: !page.data.licenseFileId,
      observed: { fileId: page.data.licenseFileId } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(merchantFile, async () => waiting.promise);
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ merchant: { _id: 'application-a' } });
    await read;
    results.push({ case: 'merchant-late-read-after-hide', pass: !page.data.ready });
  }
  {
    const { page } = fixture(stationFile, stationReply);
    await page.onShow();
    results.push({ case: 'station-normal-read', pass: page.data.ready && page.userId === 'resident-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(stationFile, async (name, action) =>
      action === 'applicationOptions' ? stationOptions : waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve({ application: { _id: 'application-a', communityId: 'community-a', stationCode: 'north' } });
    await read;
    results.push({ case: 'station-late-application-after-user-change', pass: !page.data.ready && !page.data.application,
      observed: { ready: page.data.ready, application: page.data.application?._id } });
  }
  {
    const { env, page } = fixture(stationFile, async (name, action) =>
      action === 'apply' ? {} : stationReply(name, action));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    await page.submit();
    const applications = env.requests.filter(args => args[0] === 'station' && args[1] === 'apply');
    results.push({ case: 'station-old-submit-after-user-change', pass: applications.length === 0,
      observed: { applyCalls: applications.length, communityId: applications[0]?.[2]?.communityId } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(stationFile, async (name, action) =>
      action === 'applicationOptions' ? stationOptions : waiting.promise);
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ application: null });
    await read;
    results.push({ case: 'station-late-read-after-hide', pass: !page.data.ready });
  }
  console.log(JSON.stringify({ scope: 'synthetic residents/applications/upload; CloudBase intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
