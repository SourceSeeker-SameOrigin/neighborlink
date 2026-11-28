// Actual P27 audit page; synthetic messages and same-account administrator role revocation.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', roles: ['admin'] };
const first = { list: [{ _id: 'message-a', content: '合成审计正文甲', createdAt: 1 }],
  lastId: 'message-a', hasMore: true };
const next = { list: [{ _id: 'message-b', content: '合成审计正文乙', createdAt: 2 }],
  lastId: 'message-b', hasMore: false };

async function run(phase) {
  let release;
  const env = runtime((name, action, data) => {
    assert.equal(name, 'chat');
    assert.equal(action, 'adminPull');
    const append = Boolean(data.afterId);
    if ((phase === 'first-read' && !append) || (phase === 'next-page' && append))
      return new Promise(resolve => { release = () => resolve(append ? next : first); });
    return append ? next : first;
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance('miniprogram/admin/chat/chat.js');
  page.onLoad({ caseType: 'report', reportId: 'synthetic-report' });
  if (phase === 'next-page') await page.onShow();
  const pending = phase === 'next-page' ? page.loadMore() : page.onShow();
  if (phase !== 'normal') {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${phase} audit read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, auditConfirmed: page.data.auditConfirmed,
    messages: page.data.messages.map(message => message.content), error: page.data.error,
    reads: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.auditConfirmed && observed.messages.length === 1
    : !observed.loading && !observed.auditConfirmed && observed.messages.length === 0 &&
      /身份.*变化|权限.*变化|无权/.test(observed.error);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'first-read', 'next-page']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P27 actual audit page; synthetic messages; zero cloud reads',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
