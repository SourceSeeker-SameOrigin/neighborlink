// Actual P13 application page with synthetic residents; all APIs and uploads intercepted.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const user = id => ({ _id: id, communityId: 'community-' + id, phone: '13800000000', roles: ['resident'] });
const communities = [{ _id: 'community-a' }, { _id: 'community-b' }];
const reply = async (name, action) => {
  if (name === 'catalog' && action === 'listCommunities') return { list: communities, hasMore: false };
  if (name === 'provider' && action === 'myStatus') return { provider: null };
  if (name === 'provider' && action === 'apply') return { _id: 'application-a', status: 'pending' };
  if (name === 'user' && action === 'bindPhone') return user('a');
  throw Error('Unexpected synthetic call: ' + name + '.' + action);
};
const fixture = (handler = reply, overrides = {}) => {
  const env = runtime(handler, overrides);
  env.app.globalData.user = user('a');
  return { env, page: env.instance('miniprogram/provider/apply/apply.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture();
    await page.load();
    results.push({ case: 'provider-apply-normal-load', pass: page.data.ready && page.userId === 'a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async (name, action) =>
      name === 'provider' && action === 'myStatus' ? waiting.promise : reply(name, action));
    const reading = page.load();
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve({ provider: { _id: 'application-a', status: 'pending' } });
    await reading;
    results.push({ case: 'provider-apply-late-a-status-after-user-switch', pass: !page.data.ready && !page.data.provider,
      observed: { ready: page.data.ready, provider: page.data.provider?._id } });
  }
  {
    const { env, page } = fixture();
    await page.load();
    page.setData({ realName: '合成申请人', idLast4: '1234', kycFileId: 'synthetic-kyc-a', agreed: true });
    env.app.globalData.user = user('b');
    await page.submit();
    const calls = env.requests.filter(args => args[0] === 'provider' && args[1] === 'apply');
    results.push({ case: 'provider-apply-old-submit-after-user-switch', pass: calls.length === 0,
      observed: { calls: calls.length, communityId: calls[0]?.[2]?.communityId } });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(reply, { media: { uploadPhotos: async () => waiting.promise } });
    await page.load();
    const uploading = page.photo({ currentTarget: { dataset: { type: 'kyc' } } });
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve(['synthetic-kyc-a']);
    await uploading;
    results.push({ case: 'provider-apply-old-photo-after-user-switch', pass: !page.data.kycFileId,
      observed: { kycFileId: page.data.kycFileId } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(reply, { media: { uploadPhotos: async () => waiting.promise } });
    await page.load();
    const uploading = page.photo({ currentTarget: { dataset: { type: 'kyc' } } });
    page.onHide();
    await page.onShow();
    waiting.resolve(['synthetic-kyc-a']);
    await uploading;
    results.push({ case: 'provider-apply-same-user-camera-return', pass: page.data.ready && page.data.kycFileId === 'synthetic-kyc-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async (name, action) =>
      name === 'user' && action === 'bindPhone' ? waiting.promise : reply(name, action));
    await page.load();
    const binding = page.phone({ detail: { code: 'synthetic-code' } });
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve(user('a'));
    await binding;
    results.push({ case: 'provider-apply-old-phone-overwrites-current-user', pass: env.app.globalData.user._id === 'b',
      observed: { currentUser: env.app.globalData.user._id } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(async (name, action) =>
      name === 'provider' && action === 'myStatus' ? waiting.promise : reply(name, action));
    const reading = page.load();
    await pause();
    page.onUnload();
    waiting.resolve({ provider: { _id: 'application-a', status: 'pending' } });
    await reading;
    results.push({ case: 'provider-apply-late-status-after-unload', pass: !page.data.ready });
  }
  console.log(JSON.stringify({ scope: 'actual P13 page, synthetic residents/files; all external actions intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
