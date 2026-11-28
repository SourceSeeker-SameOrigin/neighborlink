// Synthetic identities exist only inside this local fixture. Never writes live cloud data.
const assert = require('assert');
const fs = require('fs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
(async () => {
  const now = new Date();
  const f = fixture({ local: true, allowWrites: true, records: { events: [{ _id: 'e', status: 'published',
    communityIds: ['c'], fee: 0, capacity: 1, signupCount: 0, reservedCount: 0,
    startAt: new Date(now.getTime() + 172800000), signupDeadline: new Date(now.getTime() + 86400000) }] } });
  f.data.users.push({ _id: 'b', openid: 'fixture_b', roles: ['resident'], communityId: 'c' });
  const results = [];
  const check = (name, pass) => { assert(pass, name); results.push({ name, status: 'PASS' }); };
  let r = await f.call('event', 'signup', { eventId: 'e' });
  check('A免费报名成功，无付款订单', r.ok && r.data.status === 'signed' && !r.data.orderId && !(f.data.orders || []).length);
  r = await f.call('event', 'signup', { eventId: 'e' });
  check('A重复报名返回原结果，不增加人数', r.ok && r.data.duplicate && f.data.events[0].signupCount === 1);
  f.setActor('fixture_b'); r = await f.call('event', 'signup', { eventId: 'e' });
  check('B名额已满拒绝且不写第二报名', !r.ok && r.message === '活动名额已满' && f.data.signups.length === 1);
  f.setActor('actor'); r = await f.call('event', 'cancelSignup', { eventId: 'e' });
  check('A截止前取消释放名额', r.ok && f.data.events[0].signupCount === 0);
  f.setActor('fixture_b'); r = await f.call('event', 'signup', { eventId: 'e' });
  check('B在释放后报名成功', r.ok && f.data.events[0].signupCount === 1);
  f.setActor('actor'); f.data.users[0].roles.push('admin');
  r = await f.call('event', 'cancelEvent', { eventId: 'e' });
  check('管理员取消活动创建任务', r.ok && r.data.status === 'cancelled' && r.data.cancelRefund.totalCount === 1);
  const worker = f.load('cloudfunctions/_shared/eventCancellation.js').createEventCancellationWorker({ db: f.db,
    command: f.db.command, get: async (t, id) => (await f.db.collection(t).doc(id).get()).data }, {});
  await worker.run(now);
  check('QA27任务取消B免费报名并将人数清零', f.data.events[0].signupCount === 0 && f.data.signups.every(s => s.status === 'cancelled'));
  check('后台任务完成且全程没有创建付款订单', f.data.eventCancelJobs[0].status === 'completed' && !(f.data.orders || []).length);
  await worker.run(now); check('重复处理不再次扣减人数', f.data.events[0].signupCount === 0);
  const report = { scope: 'Local actual entry/worker with synthetic users; NOT real multi-account or CloudBase transaction acceptance', total: results.length, passed: results.length, results };
  fs.writeFileSync(__dirname + '/b1-isolated.json', JSON.stringify(report, null, 2) + '\n'); console.log(report);
})().catch(error => { console.error(error); process.exitCode = 1; });
