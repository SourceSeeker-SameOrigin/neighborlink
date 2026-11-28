// Actual handlers with synthetic data. Transaction reads are by document ID.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { visitId } = require('../../../cloudfunctions/_shared/petFlow');
const { ymd, addDays, parseDate } = require('../../../cloudfunctions/_shared/time');
const date = ymd(new Date());
const orderId = 'qa-pet';
const visit = seq => visitId(orderId, date, seq);
const photos = ['a.jpg', 'b.jpg'].map(name => 'cloud://fixture/pet/' + orderId + '/' + name);
const video = 'cloud://fixture/pet/' + orderId + '/sample.mp4';
function setup() {
  const slots = [1, 2].map(seq => ({ date, seq, amount: 4000 }));
  const db = fixture({ allowWrites: true, mockPay: true, records: {
    users: ['worker', 'resident'].map(openid => ({ _id: openid, openid, roles: [openid === 'worker' ? 'provider' : 'resident'], communityId: 'c' })),
    providers: [{ _id: 'p', openid: 'worker', status: 'approved', level: 2, communityId: 'c' }],
    communities: [{ _id: 'c', status: 'active', features: { pet: true } }],
    orders: [{ _id: orderId, orderNo: 'JL-TEST', kind:'service', serviceCode:'pet', userOpenid:'resident', userId:'resident',
      providerId:'p', providerOpenid:'worker', communityId:'c', detail:{entry:'key_handover',dates:[date],visitsPerDay:2},
      timeline:[], status:'in_service', refunds:[], payment:{mode:'mock',paidAt:new Date()},
      pricing:{payAmount:8000,goodsCap:0},petVisitPrices:slots }],
    visits: slots.map(s => ({ _id:visit(s.seq),parentOrderId:orderId,date,seq:s.seq,price:s.amount,status:'pending',photos:[] }))
  }});
  // Capture the exact unsupported operation without relaxing transaction semantics.
  const original = db.db.runTransaction.bind(db.db);
  db.unsupported = [];
  db.db.runTransaction = work => original(tx => work({
    collection(table) {
      return new Proxy(tx.collection(table), { get(target, key) {
        if (key === 'where') db.unsupported.push(table + '.where');
        return target[key];
      } });
    }
  }));
  db.setActor('worker');
  return db;
}
const done = (db, seq) => db.call('pet','markDone',{orderId,visitId:visit(seq),...(seq===1?{photos}:{videoFileId:video})});
const missed = db => db.call('pet','markMissed',{orderId,visitId:visit(1)});
const checks = [];
function check(name,fn) { checks.push([name,fn]); }

check('两次上门完成、相同请求重放及住户读取', async () => {
  const db = setup();
  const first = await done(db,1);
  assert.equal(first.ok,true,JSON.stringify({first:first.code,operations:db.unsupported,status:db.data.visits[0].status}));
  assert.equal(db.data.orders[0].status,'in_service');
  const duplicate = await done(db,1);
  assert.equal(duplicate.ok,false);
  assert.equal(db.data.visits.filter(v=>v.status==='done').length,1);
  assert.equal((await done(db,2)).ok,true);
  assert.equal(db.data.orders[0].status,'delivered');
  db.setActor('resident');
  const read = await db.call('pet','listVisits',{orderId});
  assert.equal(read.ok,true);
  assert.deepEqual(Array.from(read.data.list[0].photos),photos);
  assert.equal(read.data.list[1].videoFileId,video);
});
check('最后一次视频完成后转待确认',async()=>{
  const db=setup(); db.data.visits[0].status='done';
  const result=await done(db,2);
  assert.equal(result.ok,true,JSON.stringify({code:result.code,operations:db.unsupported,status:db.data.orders[0].status}));
  assert.equal(db.data.orders[0].status,'delivered');
});
check('漏次仅退一次并保留下一次任务',async()=>{
  const db=setup();const result=await missed(db);
  assert.equal(result.ok,true,JSON.stringify({code:result.code,operations:db.unsupported,refunds:db.data.orders[0].refunds.length}));
  assert.equal(db.data.visits[0].status,'missed');
  await missed(db);
  assert.equal(db.data.orders[0].refunds.length,1);
  assert.equal(db.data.orders[0].refunds[0].amount,4000);
  assert.equal(db.data.visits[1].status,'pending');
});
check('非服务日拒绝且无写入',async()=>{
  const db=setup(); db.data.visits[0].date='2000-01-01';
  assert.equal((await done(db,1)).code,'E_FORBIDDEN'); assert.equal(db.writes.length,0);
});
check('非指派人员拒绝且无写入',async()=>{
  const db=setup(); db.data.orders[0].providerId='different';
  assert.equal((await done(db,1)).code,'E_FORBIDDEN'); assert.equal(db.writes.length,0);
});
check('已处理任务重放不会覆写媒体',async()=>{
  const db=setup(); Object.assign(db.data.visits[0],{status:'done',photos:['original']});
  assert.equal((await done(db,1)).code,'E_CONFLICT');
  assert.deepEqual(db.data.visits[0].photos,['original']);assert.equal(db.writes.length,0);
});
check('首次检查前已取消会拒绝',async()=>{
  const db=setup();db.data.orders[0].status='cancelled';
  assert.equal((await done(db,1)).ok,false);assert.equal(db.writes.length,0);
});
for (const [name, submit] of [['完成', db => done(db,1)], ['漏次', missed]]) {
  for (const [change, mutate] of [
    ['改派', data => { data.orders[0].providerOpenid='another'; }],
    ['取消', data => { data.orders[0].status='cancelled'; }],
    ['撤回服务员资格', data => { data.providers[0].status='rejected'; }]
  ]) {
    check(name+'事务前'+change+'被拒并回滚', async()=>{
      const db=setup();db.faults.beforeTransaction=mutate;
      assert.equal((await submit(db)).ok,false);
      assert.equal(db.data.visits[0].status,'pending');
      assert.equal(db.data.orders[0].refunds.length,0);
      assert.equal(db.writes.length,0);
    });
  }
}
check('旧单排期仅部分保留，核对两条现存任务后可完成',async()=>{
  const db=setup();db.data.orders[0].petVisitPrices.pop();
  db.data.visits[1]._id='historic-id';
  assert.equal((await done(db,1)).ok,true);
  assert.equal((await db.call('pet','markDone',{orderId,visitId:'historic-id',videoFileId:video})).ok,true);
  assert.equal(db.data.orders[0].petPendingVisits,0);
});
check('旧单缺一条应有记录，不能提前完成',async()=>{
  const db=setup();delete db.data.orders[0].petVisitPrices;db.data.visits.pop();
  assert.equal((await done(db,1)).code,'E_CONFIG');
  assert.equal(db.writes.length,0);
});
check('旧单残留价格与任务不符，不能退款',async()=>{
  const db=setup();db.data.orders[0].petVisitPrices.pop();db.data.visits[0].price++;
  assert.equal((await missed(db)).code,'E_CONFIG');assert.equal(db.writes.length,0);
});
check('新单任务缺失，子任务和父单均不更新',async()=>{
  const db=setup();db.data.visits.pop();
  assert.equal((await done(db,1)).code,'E_CONFIG');assert.equal(db.writes.length,0);
});
check('另一笔提交先完成后，本次按最新进度进入待确认',async()=>{
  const db=setup();db.faults.beforeTransaction=data=>{
    Object.assign(data.visits[1],{status:'done',videoFileId:video});
    data.orders[0].petPendingVisits=1;
  };
  assert.equal((await done(db,1)).ok,true);
  assert.equal(db.data.orders[0].status,'delivered');
  assert.equal(db.data.orders[0].timeline.length,1);
});
check('先完成首访再登记末次漏次：只退款一次，只推进一次',async()=>{
  const db=setup();await done(db,1);
  const submit=()=>db.call('pet','markMissed',{orderId,visitId:visit(2)});
  assert.equal((await submit()).ok,true);
  await submit();
  assert.equal(db.data.orders[0].refunds.length,1);
  assert.equal(db.data.orders[0].petPendingVisits,0);
  assert.equal(db.data.orders[0].timeline.length,1);
  assert.equal(db.data.orders[0].status,'delivered');
});
check('历史退款已登记但任务待处理：修复任务，不再次退款',async()=>{
  const db=setup();assert.equal((await missed(db)).ok,true);
  db.data.visits[0].status='pending';
  assert.equal((await missed(db)).ok,true);
  assert.equal(db.data.orders[0].refunds.length,1);
  assert.equal(db.data.visits[0].status,'missed');
});
check('事务冲突返回后可重试，不产生半笔退款',async()=>{
  const db=setup();const original=db.db.runTransaction;
  db.db.runTransaction=async()=>{throw Object.assign(Error('conflict'),{code:'DATABASE_TRANSACTION_CONFLICT'});};
  assert.equal((await missed(db)).code,'E_CONFLICT');assert.equal(db.writes.length,0);
  db.db.runTransaction=original;
  assert.equal((await missed(db)).ok,true);
  assert.equal(db.data.orders[0].refunds.length,1);
});
check('15 天共 30 次上门，只剩本次时才进入待确认', async () => {
  const db = setup();
  const order = db.data.orders[0];
  const dates = Array.from({length: 15}, (_, i) => ymd(addDays(parseDate(date), i - 14)));
  order.detail.dates = dates;
  order.petVisitPrices = dates.flatMap(day => [1, 2].map(seq => ({date: day, seq, amount: 4000})));
  db.data.visits = order.petVisitPrices.map(slot => ({
    _id: visitId(orderId, slot.date, slot.seq), parentOrderId: orderId, date: slot.date,
    seq: slot.seq, price: slot.amount, status: slot.date === date ? 'pending' : 'done'
  }));
  assert.equal((await done(db, 1)).data.parentStatus, 'in_service');
  assert.equal(order.petPendingVisits, 1);
  assert.equal((await done(db, 2)).data.parentStatus, 'delivered');
  assert.equal(order.petPendingVisits, 0);
  assert.equal(order.timeline.length, 1);
});
check('重复排期与子任务不符时拒绝更新', async () => {
  const db = setup();
  db.data.orders[0].detail.dates.push(date);
  assert.equal((await done(db, 1)).code, 'E_CONFIG');
  assert.equal(db.writes.length, 0);
});
(async()=>{let failures=0;for(const [name,fn] of checks){try{await fn();console.log('PASS',name)}catch(e){failures++;console.log('FAIL',name,e.message)}} console.log(checks.length-failures,'passed,',failures,'failed');process.exitCode=failures?1:0;})();
