// Run at the repository root. Actual pages and cloud entries, synthetic users and local writes only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { couponDiscount } = require('../../../cloudfunctions/_shared/couponData');

const db = fixture({ local: true, roles: ['admin'], allowWrites: true });
for (const [id, communityId] of [['resident-a', 'c'], ['resident-b', 'c'], ['neighbor', 'other']]) {
  db.data.users.push({ _id: id, openid: id, roles: ['resident'], communityId });
}
db.data.communities.push({ _id: 'other', status: 'active', features: { coupons: true } });
function session(actor) {
  let dropClaim = false;
  const env = runtime(async (name, action, data) => {
    db.setActor(actor);
    const reply = await db.call(name, action, data);
    if (!reply.ok) throw Object.assign(Error(reply.message), { code: reply.code });
    if (action === 'claim' && dropClaim) {
      dropClaim = false;
      throw Object.assign(Error('合成网络中断'), {code: 'E_NETWORK'});
    }
    return reply.data;
  });
  env.app.globalData.user = db.data.users.find(u => u.openid === actor);
  return { ...env, dropNextClaim: () => { dropClaim = true; } };
}
const click = id => ({ currentTarget: { dataset: { id } } });
const row = index => ({ currentTarget: { dataset: { index } } });
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
}

async function main() {
  const admin = session('actor').instance('miniprogram/admin/coupons/coupons.js');
  const first = session('resident-a');
  const centerFile = 'miniprogram/coupons/center/center.js';
  const center = first.instance(centerFile);
  const other = session('neighbor').instance(centerFile);
  const second = session('resident-b').instance(centerFile);
  const mine = first.instance('miniprogram/coupons/mine/mine.js');
  await admin.onShow();
  async function create(name, limit, perUser) {
    admin.reset();
    admin.chooseKind({detail:{value:1}});
    for (const [field, value] of Object.entries({name,value:'20',maxOff:'250',threshold:'500',
      servicesText:'trash',communitiesText:'c',validDays:'7',totalLimit:String(limit),perUserLimit:String(perUser)})) {
      admin.field({currentTarget:{dataset:{field}},detail:{value}});
    }
    await admin.save();assert.equal(admin.data.error,'');
    return admin.data.rows.find(t=>t.name===name);
  }
  const t = await create('合成比例券',2,1);
  const issued = id => db.data.couponTemplates.find(c=>c._id===id).issued;
  const owned = (id,user) => (db.data.coupons || []).filter(c=>c.templateId===id && (!user || c.openid===user));
  await check('管理端创建后回读金额、库存、适用范围',()=>{
    assert.equal(t.kind,'percent_off');assert.equal(t.value,20);assert.equal(t.maxOff,250);assert.equal(t.issued,0);
    assert.equal(t.services.join(),'trash');assert.equal(t.communityIds.join(),'c');
  });
  await check('合成报价 10 元减 2 元，20 元减 2.50，门槛以下和其他服务均为零',()=>{
    const off=(listPrice,serviceCode='trash')=>couponDiscount(t,{listPrice,serviceCode,communityId:'c'});
    assert.deepEqual([off(1000),off(2000),off(499),off(1000,'buy')],[200,250,0,0]);
  });
  await check('领券中心显示比例、门槛和库存',async()=>{
    await center.onShow();assert.equal(center.data.list[0].discountText,'减免20%');
    assert.equal(center.data.list[0].thresholdText,'满 5.00 元可用');assert.equal(center.data.list[0].remaining,2);
  });
  await check('非适用小区隐藏券，领取被拒且不减库存',async()=>{
    await other.onShow();assert.equal(other.data.list.length,0);await other.claim(click(t._id));
    assert.equal(other.data.error,'');assert.equal(issued(t._id),0);
  });
  await check('首次双击只发一个请求并领取一张',async()=>{
    await Promise.all([center.claim(click(t._id)),center.claim(click(t._id))]);
    assert.equal(first.requests.filter(r=>r[1]==='claim').length,1);
    assert.equal(owned(t._id,'resident-a').length,1);assert.equal(issued(t._id),1);
  });
  await check('我的券显示未使用、有效期七天，另一个账号没有此券',async()=>{
    await mine.onShow();assert.equal(mine.data.list[0].statusText,'未使用');
    const c=mine.data.list[0];assert.equal(c.discountText,'减免20%');assert.equal(c.validTo-c.validFrom,7*86400000);
    const theirs=session('resident-b').instance('miniprogram/coupons/mine/mine.js');
    await theirs.onShow();assert.equal(theirs.data.list.length,0);
  });
  await check('达到个人上限后再领不扣库存',async()=>{
    await center.claim(click(t._id));assert.match(center.data.error,/每人领取上限/);assert.equal(issued(t._id),1);
  });
  const index=()=>admin.data.rows.findIndex(r=>r._id===t._id);
  await check('管理员暂停后不可领，恢复后再显示',async()=>{
    await admin.load();await admin.toggleStatus(row(index()));await second.onShow();assert.equal(second.data.list.length,0);
    await second.claim(click(t._id));assert.equal(second.data.error,'');assert.equal(issued(t._id),1);
    await admin.toggleStatus(row(index()));await second.onShow();assert.equal(second.data.list[0].remaining,1);
  });
  await check('第二位住户领取最后一张，领完后隐藏且重复请求不超发',async()=>{
    await second.claim(click(t._id));assert.equal(second.data.list.length,0);
    await second.claim(click(t._id));assert.equal(second.data.error,'');
    assert.equal(issued(t._id),2);assert.equal(owned(t._id).length,2);
  });
  await check('编辑总量低于已发张数时拒绝，仍保留原总量',async()=>{
    await admin.load();admin.edit(row(index()));admin.field({currentTarget:{dataset:{field:'totalLimit'}},detail:{value:'1'}});
    await admin.save();assert.ok(admin.data.error);assert.equal(db.data.couponTemplates.find(c=>c._id===t._id).totalLimit,2);
  });
  const retry = await create('合成可领两次',4,2);
  await center.onShow();first.dropNextClaim();await center.claim(click(retry._id));
  await check('模拟云端已发券但响应丢失：首次仅一张，页面收到错误',()=>{
    assert.equal(owned(retry._id,'resident-a').length,1);assert.match(center.data.error,/网络中断/);
  });
  await center.claim(click(retry._id));
  await check('同一次领取在丢响应后重试只占一份库存与个人额度',()=>{
    assert.equal(owned(retry._id,'resident-a').length,1);assert.equal(issued(retry._id),1);
  });
  await check('成功确认后主动再领会生成新编号并占第二份额度',async()=>{
    const attempts=()=>first.requests.filter(r=>r[1]==='claim' && r[2].templateId===retry._id).map(r=>r[2].requestId);
    await center.claim(click(retry._id));const [lost,replay,next]=attempts();
    assert.ok(lost);assert.equal(replay,lost);assert.notEqual(next,lost);assert.equal(issued(retry._id),2);
  });
  const last = await create('最后一张测试券',1,1);
  await center.onShow();first.dropNextClaim();await center.claim(click(last._id));center.onUnload();
  const reopened = first.instance(centerFile);await reopened.onShow();
  await check('最后一张已领完，重进仍有独立的上次领取入口',()=>{
    assert.ok(!reopened.data.list.some(c=>c._id===last._id));assert.equal(reopened.data.pending[0].templateId,last._id);
  });
  await check('另一个账号在同一设备看不到前一账号待确认的券',async()=>{
    const previous=first.app.globalData.user;
    first.app.globalData.user=db.data.users.find(u=>u.openid==='resident-b');
    try {
      const separate=first.instance(centerFile);await separate.onShow();assert.equal(separate.data.pending.length,0);
    } finally { first.app.globalData.user=previous; }
  });
  await reopened.claim(click(last._id));
  await check('售罄后重试仍返回原券、清除恢复凭据、库存仅扣一张',()=>{
    assert.equal(reopened.data.error,'');assert.equal(reopened.data.pending.length,0);
    assert.equal(issued(last._id),1);assert.equal(owned(last._id).length,1);
  });
  const legacy=await create('旧客户端兼容',4,4);db.setActor('resident-a');
  await check('缺省编号沿用旧行为，两次主动领取分别发券',async()=>{
    for(let i=0;i<2;i++)assert.ok((await db.call('coupon','claim',{templateId:legacy._id})).ok);
    assert.equal(issued(legacy._id),2);
  });
  await check('非法编号被拒且不占用库存',async()=>{
    for(const requestId of ['',null,{},'x'.repeat(81),'bad/path']){
      assert.equal((await db.call('coupon','claim',{templateId:legacy._id,requestId})).code,'E_INVALID_PARAM');
    }
    assert.equal(issued(legacy._id),2);
  });
  await check('同编号跨账号或跨模板互不占用；同身份重放返回原券号',async()=>{
    const id='same_request';
    async function claimAs(actor,templateId) {
      db.setActor(actor);const r=await db.call('coupon','claim',{templateId,requestId:id});assert.ok(r.ok);return r.data;
    }
    const a=await claimAs('resident-a',legacy._id),again=await claimAs('resident-a',legacy._id);
    const b=await claimAs('resident-b',legacy._id),c=await claimAs('resident-b',retry._id);
    assert.equal(a.couponId,again.couponId);assert.ok(again.duplicate);
    assert.equal(new Set([a.couponId,b.couponId,c.couponId]).size,3);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.ok).length,results},null,2));
  if(results.some(r=>!r.ok)) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
