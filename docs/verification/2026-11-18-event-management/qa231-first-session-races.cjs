// Actual page lifecycles with synthetic identities and reads; no cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const cases = [
  ['P14', 'provider/workbench/workbench', 'retry'],
  ['P15', 'provider/hall/hall', 'retry'],
  ['P17', 'provider/earnings/earnings', 'retry'],
  ['P54', 'merchant/apply/apply', 'load'],
  ['P61', 'station/apply/apply', 'load']
];
const identity = (id, communityId) => ({ _id: id, communityId, roles: ['provider', 'merchant', 'station'] });
const response = action => {
  if (action === 'myStatus') return { provider: null, todayCount: 0, todayIncome: 0 };
  if (action === 'earnings') return { list: [], pending: 0, settled: 0, available: 0, hasMore: false };
  if (action === 'applicationOptions') return { list: [] };
  if (action === 'myApplication') return { merchant: null, application: null };
  return { list: [], hasMore: false, nextOffset: 0 };
};

async function check(item, next, lateRead) {
  const [name, path, retry] = item;
  const first = identity('first', 'community-a');
  let resolveSession, resolveRead;
  if (lateRead) {
    let calls = 0;
    const delayed = runtime((_, action) => ++calls === 1
      ? new Promise(resolve => { resolveRead = () => resolve(response(action)); })
      : response(action));
    delayed.app.globalData.user = first;
    delayed.app.ensureSession = async () => first;
    const latePage = delayed.instance(`miniprogram/${path}.js`);
    const pending = latePage.onShow();
    for (let i = 0; i < 10 && !resolveRead; i += 1) await Promise.resolve();
    assert.equal(typeof resolveRead, 'function', `${name} must start a read`);
    delayed.app.globalData.user = next;
    resolveRead();
    await pending;
    assert.equal(latePage.data.loading, false, `${name} late read must end loading`);
    assert.equal(latePage.data.ready, false, `${name} late read must not authorize`);
    assert.match(latePage.data.error, /身份.*变化/, `${name} late read needs retry`);
    latePage.onHide?.();
    return;
  }
  const env = runtime((_, action) => response(action));
  const page = env.instance(`miniprogram/${path}.js`);
  env.app.globalData.user = null;
  env.app.ensureSession = () => new Promise(resolve => { resolveSession = resolve; });
  if (name === 'P54') {
    page.user = first;
    page.setData({ name: '前一位商家的草稿', creditCode: 'old-private-code' });
  }
  if (name === 'P61') page.setData({ communities: [{ _id: 'community-a', stations: [] }] });
  const pending = page.onShow();
  env.app.globalData.user = next;
  resolveSession(first);
  await pending;
  assert.equal(page.data.loading, false, `${name} first read must end loading`);
  assert.equal(page.data.ready, false, `${name} stale identity must not authorize`);
  assert.match(page.data.error, /身份.*变化/, `${name} needs visible retry`);
  assert.equal(env.requests.length, 0, `${name} must not query with stale identity`);
  if (name === 'P54') {
    assert.equal(page.data.name, '', 'old merchant draft must not remain visible');
    assert.equal(page.data.creditCode, '', 'old license detail must be cleared');
  }
  if (name === 'P61') assert.equal(page.data.communities.length, 0, 'old station options must be cleared');
  env.app.ensureSession = async () => next;
  await page[retry]();
  assert.equal(page.data.loading, false, `${name} retry must end loading`);
  assert.equal(page.data.ready, true, `${name} retry must authorize current identity`);
  assert.equal(page.data.error, '', `${name} retry must clear stale error`);
  assert.ok(env.requests.length > 0, `${name} retry must read current identity`);
  page.onHide?.();
}

async function main() {
  for (const item of cases) {
    await check(item, identity('second', 'community-b'), false);
    await check(item, identity('first', 'community-b'), false);
    await check(item, identity('second', 'community-b'), true);
  }
  console.log(JSON.stringify({ scope: 'five actual pages; synthetic identity and community changes', passed: cases.length * 3 }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
