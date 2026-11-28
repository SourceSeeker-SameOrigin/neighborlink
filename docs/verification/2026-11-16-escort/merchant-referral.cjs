// Run from the repository root. All application requests and records are local fixtures.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

function merchantFixture() {
  const db = fixture({ roles: ['admin'], allowWrites: true, records: {
    merchants: [{ _id: 'm', status: 'pending', staffOpenids: ['staff'] }]
  } });
  db.data.users.push({ _id: 's', openid: 'staff', roles: ['resident', 'provider'] });
  return db;
}
const review = (db, approved) => db.call('merchant', 'review', { merchantId: 'm', approved });

function referralFixture() {
  const db = fixture({ global: true, allowWrites: true, records: {
    orders: [{ _id: 'o', userId: 'u', userOpenid: 'actor', communityId: 'c', kind: 'service', serviceCode: 'trash',
      status: 'delivered', pricing: { listPrice: 500, payAmount: 500, goodsCap: 0 }, timeline: [],
      rateSnapshot: { platform: 0.1, property: 0.05 } }],
    providers: [{ _id: 'pr', openid: 'ref', communityId: 'c' }],
    couponTemplates: [{ _id: 'template', issueMode: 'referral', status: 'active', communityIds: 'all',
      validDays: 30, issued: 0, totalLimit: 2, perUserLimit: 1 }]
  } });
  Object.assign(db.data.users[0], { firstPaidOrderId: 'o', source: { referrerProviderId: 'pr' } });
  db.data.users.push({ _id: 'ref', openid: 'ref', roles: ['resident'] });
  return db;
}
const confirm = db => db.call('order', 'confirm', { orderId: 'o' });
const cases = [];
const check = (name, run) => cases.push({ name, run });

for (const approved of [true, false]) {
  check('商家审核 ' + approved, async () => {
    const db = merchantFixture();
    assert.equal((await review(db, approved)).ok, true);
    assert.equal(db.data.merchants[0].status, approved ? 'approved' : 'rejected');
    assert.deepEqual(Array.from(db.data.users[1].roles), approved ? ['resident', 'provider', 'merchant'] : ['resident', 'provider']);
    assert.equal(db.data.users[1].merchantId, approved ? 'm' : undefined);
    assert.equal((await review(db, approved)).code, 'E_CONFLICT');
  });
}
for (const mutate of [d => { d.users[1].openid = 'changed'; }, d => { d.merchants[0].staffOpenids = ['changed']; }]) {
  check('审核时申请人变化', async () => {
    const db = merchantFixture();
    db.faults.beforeTransaction = mutate;
    assert.equal((await review(db, true)).code, 'E_CONFLICT');
    assert.equal(db.writes.length, 0);
  });
}
check('非管理员不能审核', async () => {
  const db = merchantFixture();
  db.setActor('staff');
  assert.equal((await review(db, true)).code, 'E_FORBIDDEN');
  assert.equal(db.writes.length, 0);
});
check('推荐首单重复确认只赠一次并只记一次收入', async () => {
  const db = referralFixture();
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await confirm(db)).ok, true);
  assert.equal(db.data.orders[0].status, 'completed');
  assert.equal(db.data.ledger.length, 1);
  assert.equal(db.data.coupons.length, 1);
  assert.equal(db.data.couponTemplates[0].issued, 1);
  assert.equal(db.data.users[1].couponCounts.template, 1);
});
for (const [name, mutate] of [
  ['不是首单', d => { d.users[0].firstPaidOrderId = 'another'; }],
  ['库存用完', d => { d.couponTemplates[0].issued = 2; }],
  ['个人达到上限', d => { d.users[1].couponCounts = { template: 1 }; }],
  ['小区不匹配', d => { d.couponTemplates[0].communityIds = ['another']; }],
  ['模板停用', d => { d.couponTemplates[0].status = 'inactive'; }],
  ['关闭优惠券', d => { d.config[0].features.coupons = false; }]
]) {
  check('完单但不赠券：' + name, async () => {
    const db = referralFixture();
    db.faults.beforeTransaction = mutate;
    assert.equal((await confirm(db)).ok, true);
    assert.equal(db.data.orders[0].status, 'completed');
    assert.equal(db.data.ledger.length, 1);
    assert.equal((db.data.coupons || []).length, 0);
  });
}
check('推荐人账号变化时完单和记账一起回滚', async () => {
  const db = referralFixture();
  db.faults.beforeTransaction = d => { d.users[1].openid = 'changed'; };
  assert.equal((await confirm(db)).code, 'E_CONFLICT');
  assert.equal(db.data.orders[0].status, 'delivered');
  assert.equal(db.writes.length, 0);
});
check('第二个模板读取失败时整单回滚，重试与重放只发应得的两张券', async () => {
  const db = referralFixture();
  db.data.couponTemplates.push({ ...db.data.couponTemplates[0], _id: 'second' });
  db.faults.failTemplateId = 'second';
  assert.equal((await confirm(db)).code, 'E_INTERNAL');
  assert.equal(db.data.orders[0].status, 'delivered');
  assert.deepEqual(db.data.orders[0].timeline, []);
  assert.equal(db.writes.length, 0);
  assert.equal((db.data.ledger || []).length, 0);
  assert.equal((db.data.coupons || []).length, 0);
  assert.ok(db.data.couponTemplates.every(t => t.issued === 0));
  assert.equal(db.data.users[1].couponCounts, undefined);

  db.faults.failTemplateId = null;
  assert.equal((await confirm(db)).ok, true);
  const committedWrites = db.writes.length;
  assert.equal((await confirm(db)).ok, true);
  assert.equal(db.writes.length, committedWrites);
  assert.equal(db.data.orders[0].status, 'completed');
  assert.equal(db.data.orders[0].timeline.length, 1);
  assert.equal(db.data.ledger.length, 1);
  assert.deepEqual(db.data.coupons.map(c => c.templateId).sort(), ['second', 'template']);
  assert.ok(db.data.couponTemplates.every(t => t.issued === 1 && db.data.users[1].couponCounts[t._id] === 1));
});
check('第 101 个模板可用时能赠券', async () => {
  const db = referralFixture();
  const active = db.data.couponTemplates[0];
  db.data.couponTemplates = Array.from({ length: 100 }, (_, i) => ({ ...active, _id: 'else' + i, communityIds: ['other'] }));
  db.data.couponTemplates.push(active);
  assert.equal((await confirm(db)).ok, true);
  assert.equal(db.data.coupons.length, 1);
  assert.equal(db.data.coupons[0].templateId, 'template');
});

(async () => {
  for (const { name, run } of cases) {
    await run();
    console.log('PASS', name);
  }
  console.log(cases.length + ' passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
