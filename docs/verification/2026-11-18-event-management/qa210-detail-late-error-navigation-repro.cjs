// Actual P39/P42 page and shared API; synthetic responses, no cloud writes.
const assert = require('node:assert/strict');
const path = require('node:path');

async function run(name, leaveBeforeResponse) {
  const calls = [];
  const redirects = [];
  const toasts = [];
  let answer;
  let definition;
  const user = { _id: 'resident-fixture', communityId: 'community-fixture' };
  const app = { globalData: { user }, ensureSession: async () => user };
  global.getApp = () => app;
  global.Page = value => { definition = value; };
  global.wx = {
    cloud: { callFunction: async ({ name: functionName, data }) => {
      calls.push([functionName, data.action]);
      if (data.action === 'detail') {
        return { result: { ok: true, data: functionName === 'board'
          ? { post: { _id: 'fixture-record', type: 'ask', status: 'open', createdAt: new Date(), images: [] }, comments: [] }
          : { item: { _id: 'fixture-record', title: '合成闲置', createdAt: new Date(), price: 100, images: [] } } } };
      }
      return new Promise(resolve => { answer = resolve; });
    } },
    showModal: ({ success }) => success({ confirm: true }),
    showLoading() {}, hideLoading() {}, setNavigationBarTitle() {},
    showToast: ({ title }) => toasts.push(title),
    switchTab: ({ url }) => redirects.push(url)
  };
  const file = path.resolve(__dirname, '../../../miniprogram', name, 'detail/detail.js');
  delete require.cache[require.resolve(file)];
  require(file);
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  page.onLoad({ id: 'fixture-record' });
  await page.onShow();
  const request = page.report();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls.map(item => item[1]), ['detail', 'report']);
  assert.equal(typeof answer, 'function');
  if (leaveBeforeResponse) page.onHide();
  answer({ result: { ok: false, code: 'E_FORBIDDEN', message: '合成权限拒绝' } });
  await request;
  return { page: name, leaveBeforeResponse, calls, redirects, toasts };
}

(async () => {
  const results = [];
  for (const name of ['board', 'idle']) {
    const current = await run(name, false);
    const late = await run(name, true);
    assert.deepEqual(current.redirects, ['/pages/index/index']);
    assert.deepEqual(late.redirects, ['/pages/index/index']);
    assert.deepEqual(late.toasts, ['合成权限拒绝']);
    results.push(current, late);
  }
  console.log(JSON.stringify({ scope: 'P39/P42 actual pages and shared API; synthetic E_FORBIDDEN', results }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
