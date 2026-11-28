// Actual P34 page with synthetic identities and intercepted CloudBase/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const list = [{ conversationId: 'synthetic-conversation-a', serviceName: '测试会话',
  lastMessage: '测试消息', unread: 2 }];
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = { _id: 'resident-a', roles: ['resident'] };
  return { env, page: env.instance('miniprogram/chat/list/list.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => ({ list, unreadTotal: 2 }));
    await page.onShow();
    results.push({ case: 'normal-current-user-list-and-unread',
      pass: page.data.list.length === 1 && page.data.unreadTotal === 2 });
  }
  {
    const old = deferred();
    const next = deferred();
    let calls = 0;
    const { page } = fixture(async () => ++calls === 1 ? old.promise : next.promise);
    const first = page.onShow();
    await pause();
    const second = page.load();
    await pause();
    next.resolve({ list: [], unreadTotal: 0 });
    await pause();
    old.resolve({ list, unreadTotal: 2 });
    await Promise.all([first, second]);
    results.push({ case: 'older-read-cannot-overwrite-newer',
      pass: page.data.list.length === 0 && page.data.unreadTotal === 0 });
  }
  {
    const waiting = deferred();
    const { page } = fixture(async () => waiting.promise);
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ list, unreadTotal: 2 });
    await read;
    results.push({ case: 'late-list-after-hide',
      pass: page.data.list.length === 0 && page.data.unreadTotal === 0 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    waiting.resolve({ list, unreadTotal: 2 });
    await read;
    results.push({ case: 'late-list-after-identity-change',
      pass: page.data.list.length === 0 && page.data.unreadTotal === 0,
      observed: { rows: page.data.list.length, unreadTotal: page.data.unreadTotal } });
  }
  {
    const { env, page } = fixture(async () => ({ list, unreadTotal: 2 }));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    page.open({ currentTarget: { dataset: { id: list[0].conversationId } } });
    results.push({ case: 'old-conversation-card-after-identity-change',
      pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const { env, page } = fixture(async () => ({ list, unreadTotal: 2 }));
    await page.onShow();
    page.onHide();
    page.open({ currentTarget: { dataset: { id: list[0].conversationId } } });
    results.push({ case: 'old-conversation-card-after-hide',
      pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; CloudBase and navigation intercepted',
    pass: results.filter(result => result.pass).length,
    fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
