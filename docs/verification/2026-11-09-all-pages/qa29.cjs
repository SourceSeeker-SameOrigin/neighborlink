// Actual entry/page handlers with synthetic records only. No network or cloud writes.
const assert = require('assert');
const fs = require('fs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const input = { eventId: 'e', checkinCode: 'local-only-code' };
function setup(options = {}) {
  return fixture({ global: true, local: true, roles: ['admin'], allowWrites: true,
    records: { events: [{ _id: 'e', ownerOpenid: 'actor', communityIds: ['c'], status: 'published', signupCount: 1 }],
      signups: [{ _id: 's', eventId: 'e', checkinCode: input.checkinCode, status: 'signed' }] }, ...options });
}
function page(callback) {
  const r = runtime(callback || (async () => ({ status: 'checked_in' })));
  const p = r.instance('miniprogram/events/manage/manage.js');
  p.setData({ ready: true, loading: false, list: [{ _id: 'e', status: 'published' }], scanCode: input.checkinCode });
  return { r, p, click: () => p.checkin({ currentTarget: { dataset: { id: 'e' } } }) };
}
async function test(name, work) {
  try { await work(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); }
}
async function rejected(f, code = 'E_CONFLICT', args = input) {
  const result = await f.call('event', 'checkin', args);
  assert.equal(result.ok, false); assert.equal(result.code, code); assert.equal(f.writes.length, 0);
}
(async () => {
  await test('已发布正常签到，两文档原子写入且不改人数，重复拒绝', async () => {
    const f = setup(); const result = await f.call('event', 'checkin', input);
    assert.equal(result.ok, true); assert.equal(result.data.status, 'checked_in');
    assert.equal(f.data.events[0].checkinRevision, 1); assert.equal(f.data.events[0].signupCount, 1);
    assert.equal(f.data.signups[0].status, 'checked_in'); assert(f.data.signups[0].checkedInAt);
    assert.deepEqual(f.writes.map(x => x.table), ['events', 'signups']);
    const repeated = await f.call('event', 'checkin', input);
    assert.equal(repeated.code, 'E_CONFLICT'); assert.equal(f.writes.length, 2);
  });
  for (const status of ['draft', 'cancelled', 'ended', 'unknown']) await test(status + '零写入', async () => {
    const f = setup(); f.data.events[0].status = status; await rejected(f);
  });
  for (const status of ['pending_pay', 'checked_in', 'cancelled', 'refunded']) await test('报名' + status + '拒绝', async () => {
    const f = setup(); f.data.signups[0].status = status; await rejected(f);
  });
  await test('错误签到码拒绝', async () => { await rejected(setup(), 'E_CONFLICT', { ...input, checkinCode: 'wrong-code' }); });
  for (const role of ['property', 'merchant']) await test(role + '原组织者权限保留', async () => {
    const f = setup({ roles: [role] }); assert.equal((await f.call('event', 'checkin', input)).ok, true);
    const other = setup({ roles: [role] }); other.data.events[0].ownerOpenid = 'other'; await rejected(other, 'E_FORBIDDEN');
  });
  await test('住户角色拒绝', async () => { await rejected(setup({ roles: ['resident'] }), 'E_FORBIDDEN'); });
  await test('功能关闭仍拒绝', async () => { await rejected(setup({ global: false, local: false }), 'E_FEATURE_OFF'); });
  for (const [name, change, code] of [
    ['取消先完成', d => { d.events[0].status = 'cancelled'; }, 'E_CONFLICT'],
    ['报名先取消', d => { d.signups[0].status = 'cancelled'; }, 'E_CONFLICT'],
    ['报名转属其他活动', d => { d.signups[0].eventId = 'other'; }, 'E_CONFLICT'],
    ['签到码变化', d => { d.signups[0].checkinCode = 'new-code'; }, 'E_CONFLICT'],
    ['报名删除', d => { d.signups = []; }, 'E_CONFLICT'],
    ['活动删除', d => { d.events = []; }, 'E_FORBIDDEN']
  ]) await test('事务重读：' + name, async () => {
    const f = setup(); f.faults.beforeTransaction = change; await rejected(f, code);
  });
  await test('组织者在事务前变化拒绝', async () => {
    const f = setup({ roles: ['property'] });
    f.faults.beforeTransaction = d => { d.events[0].ownerOpenid = 'other'; }; await rejected(f, 'E_FORBIDDEN');
  });
  await test('已有版本递增', async () => {
    const f = setup(); f.data.events[0].checkinRevision = 4;
    assert.equal((await f.call('event', 'checkin', input)).ok, true); assert.equal(f.data.events[0].checkinRevision, 5);
  });
  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER]) await test('非法或耗尽版本拒绝 ' + revision, async () => {
    const f = setup(); f.data.events[0].checkinRevision = revision; await rejected(f, 'E_INVALID_PARAM');
  });
  for (const conflict of [true, false]) await test('写入后' + (conflict ? '冲突' : '失败') + '全部回滚', async () => {
    const f = setup(); const original = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = work => original(async tx => {
      await work(tx); throw Object.assign(Error('synthetic failure'), { code: conflict ? 'DATABASE_TRANSACTION_CONFLICT' : 'LOCAL_FAILURE' });
    });
    await rejected(f, conflict ? 'E_CONFLICT' : 'E_INTERNAL');
    assert.equal(f.data.events[0].checkinRevision, undefined); assert.equal(f.data.signups[0].status, 'signed');
  });
  await test('签到先成功后取消写同一活动记录', async () => {
    const f = setup(); assert.equal((await f.call('event', 'checkin', input)).ok, true);
    assert.equal((await f.call('event', 'cancelEvent', { eventId: 'e' })).ok, true);
    assert.equal(f.data.events[0].status, 'cancelled'); assert.equal(f.data.signups[0].status, 'checked_in');
    assert(f.writes.filter(x => x.table === 'events').length >= 2);
  });
  for (const state of [{ busy: true }, { loading: true }, { ready: false }]) await test('页面忙碌/未就绪零请求 ' + JSON.stringify(state), async () => {
    const { r, p, click } = page(); p.setData(state); await click(); assert.equal(r.requests.length, 0);
  });
  for (const status of ['draft', 'cancelled', 'ended', 'unknown', null]) await test('页面非法状态零请求 ' + status, async () => {
    const { r, p, click } = page(); p.setData({ list: status ? [{ _id: 'e', status }] : [] });
    await click(); assert.equal(r.requests.length, 0); assert(p.data.error.includes('不能签到'));
  });
  await test('页面未扫码不调用', async () => {
    const { r, p, click } = page(); p.setData({ scanCode: '' }); await click();
    assert.equal(r.requests.length, 0); assert(p.data.error.includes('请先扫描'));
  });
  await test('页面重复点击一请求，成功清码且解除忙碌', async () => {
    let release; const { r, p, click } = page(async () => new Promise(resolve => { release = resolve; }));
    const first = click(); await click(); assert.equal(r.requests.length, 1); assert.equal(p.data.busy, true);
    release({}); await first; assert.equal(p.data.scanCode, ''); assert.equal(p.data.busy, false);
  });
  await test('页面失败保留码，可明确重试，无自动重放', async () => {
    let fail = true; const { r, p, click } = page(async () => { if (fail) throw Error('合成冲突'); return {}; });
    await click(); assert.equal(r.requests.length, 1); assert.equal(p.data.scanCode, input.checkinCode);
    assert.equal(p.data.error, '合成冲突'); assert.equal(p.data.busy, false);
    fail = false; await click(); assert.equal(r.requests.length, 2); assert.equal(p.data.scanCode, '');
  });
  await test('WXML仅published显示签到按钮并绑定禁用状态', async () => {
    const template = fs.readFileSync('miniprogram/events/manage/manage.wxml', 'utf8');
    assert(/<button\b[^>]*wx:if="\{\{item.status === 'published'\}\}"[^>]*disabled="\{\{busy \|\| loading \|\| !ready\}\}"[^>]*bindtap="checkin"/.test(template));
  });
  const report = { scope: 'Local synthetic transactions and actual page handlers; not real cloud concurrency or resident check-in acceptance',
    total: results.length, passed: results.filter(x => x.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa29.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.passed === report.total ? 0 : 1;
})();
