// From repo root. Optional MERCHANT_ENTRY points at an extracted deployment artifact.
// No live accounts, cloud calls or payments.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const tick = () => new Promise(setImmediate);
const cases = [];
const test = (name, run) => cases.push([name, run]);
const tap = id => ({ currentTarget: { dataset: { id } } });
const id = (prefix, n) => prefix + String(n).padStart(3, '0');
function setup(count = 1, priceType = 'quote') {
  const merchants = [], merchantServices = [];
  for (let i = count-1; i >= 0; i--) {
    merchants.push({ _id:id('m',i), name:'同名商家', status:'approved', category:'repair', communityIds:['c'],
      commissionRate:.1, staffOpenids:['staff'], licenseInfo:{name:'样本',creditCode:'样本'} });
    merchantServices.push({ _id:id('s',i), merchantId:'m000', title:'同名服务', desc:'测试', status:'on', priceType, price:500, unit:'次' });
  }
  const db = fixture({global:true,local:true,allowWrites:true,mockPay:true, securityResult:{result:{suggest:'pass'}},
    records:{merchants,merchantServices,buildings:[{_id:'b',communityId:'c',name:'测试楼',units:['1']}]}});
  Object.assign(db.data.users[0],{buildingId:'b',unit:'1',room:'测试',phone:'13800000000'});
  db.data.users.push({_id:'staff-id',openid:'staff',roles:['merchant','resident'],communityId:'c'});
  db.data.config[0].payMode='mock'; db.data.communities[0].rates={platform:.1,property:.05};
  // The shared mock normally ignores orderBy. Apply the actual query's sort keys for tied-name pages.
  const collection = db.db.collection.bind(db.db);
  db.db.collection = table => {
    const chain = collection(table);
    if (['merchants','merchantServices'].includes(table)) {
      const keys = [], get = chain.get;
      chain.orderBy = (field, dir) => { keys.push([field, dir]); return chain; };
      chain.get = async () => {
        const original = db.data[table]; db.data[table] = [...original].sort((a,b)=>{
          for (const [key,dir] of keys) if (a[key] !== b[key]) return (a[key]<b[key]?-1:1)*(dir==='desc'?-1:1);
          return 0;
        });
        try { return await get(); } finally { db.data[table]=original; }
      };
    }
    return chain;
  };
  const main = db.load(process.env.MERCHANT_ENTRY || 'cloudfunctions/merchant/index.js').main;
  const call = async (name,action,data) => {
    if(name==='content' && action==='adsForSlot') return {ads:[]};
    assert.equal(name,'merchant');
    const r=await main({...data,action});
    if(!r.ok) throw Object.assign(Error(r.message),{code:r.code});
    return r.data;
  };
  return {db,call};
}
const view = (env, detail) => {
  const name=detail?'detail':'list'; const p=env.instance('miniprogram/shops/'+name+'/'+name+'.js');
  if(detail) p.onLoad({merchantId:'m000'}); return p;
};
for (const detail of [false,true]) {
  const action=detail?'servicesForMerchant':'listForCommunity', prefix=detail?'s':'m';
  const args={communityId:'c',...(detail?{merchantId:'m000'}:{})};
  test(action+'：101条同名、旧版100条、负偏移拒绝、最后1条、重试同页',async()=>{
    const {call}=setup(101); let fail=true; const offsets=[];
    const env=runtime(async(n,a,d)=>{
      if(a===action){offsets.push(d.offset); if(d.offset===20 && fail){fail=false;throw Error('断网');}}
      return call(n,a,d);
    });
    env.app.globalData.user.communityId='c'; const p=view(env,detail); await p.onShow();
    assert.equal(p.data.list.length,20); await p.more(); assert.equal(p.data.list.length,20);
    assert.match(p.data.moreError,/断网/); assert.equal(p.data.nextOffset,20);
    for(let i=0;i<5;i++) await p.more();
    assert.deepEqual(offsets,[0,20,20,40,60,80,100]); assert.equal(p.data.hasMore,false);
    assert.deepEqual(Array.from(p.data.list, r=>r._id),Array.from({length:101},(_,i)=>id(prefix,i)));
    await p.more(); assert.equal(offsets.length,7);
    const old=await call('merchant',action,args); assert.equal(old.list.length,100);assert.equal(old.hasMore,undefined);
    await assert.rejects(()=>call('merchant',action,{...args,offset:-1}),{code:'E_INVALID_PARAM'});
    p[detail?'book':'open'](tap(id(prefix,100))); assert.ok(env.navigation.at(-1)[1].endsWith(id(prefix,100)));
  });
}
test('前100家隐藏，未设隐藏字段的第101家仍可见；下架服务不占名额',async()=>{
  const {db,call}=setup(101); for(const m of db.data.merchants) m.moderationHidden=m._id!=='m100';
  delete db.data.merchants[0].moderationHidden;
  const first=await call('merchant','listForCommunity',{communityId:'c',offset:0});
  assert.deepEqual(Array.from(first.list,m=>m._id),['m100']); assert.equal(first.hasMore,false);
  db.data.merchants.find(m=>m._id==='m000').moderationHidden=false;
  db.data.merchantServices.forEach(s=>{if(s._id!=='s100') s.status='off';});
  const services=await call('merchant','servicesForMerchant',{merchantId:'m000',communityId:'c',offset:0});
  assert.deepEqual(Array.from(services.list,s=>s._id),['s100']);
});
for(const end of ['older success','older error','hide','unload']) test('详情迟到：'+end,async()=>{
  const queue=[],env=runtime(()=>new Promise((resolve,reject)=>queue.push({resolve,reject}))),p=view(env,true);
  const row=x=>({merchant:{_id:'m000'}, list:[{_id:x,price:100}]});
  const first=p.onShow(); await tick();
  if(end.startsWith('older')){const second=p.load();await tick();queue[1].resolve(row('new'));await second;}
  else p[end==='hide'?'onHide':'onUnload']();
  let writes=0; const set=p.setData.bind(p);p.setData=patch=>{writes++;set(patch);};
  if(end.endsWith('error')) queue[0].reject(Error('旧错误')); else queue[0].resolve(row('old')); await first;
  assert.equal(writes,0);assert.equal(p.data.list[0]?._id,end.startsWith('older')?'new':undefined);
});
for(const append of [true,false]) test('详情读取商家已隐藏：清除旧预约 '+append,async()=>{
  const {db,call}=setup(21);const env=runtime(call),p=view(env,true);env.app.globalData.user.communityId='c';
  await p.onShow();p.book(tap('fake'));assert.equal(env.navigation.length,0);
  db.data.merchants.find(m=>m._id==='m000').moderationHidden=true;
  const reload=append?p.more():p.load(); if(!append){p.book(tap('s000'));assert.equal(env.navigation.length,0);}
  await reload;assert.match(p.data.error,/暂不可用/);assert.equal(p.data.merchant,null);assert.equal(p.data.list.length,0);
  p.book(tap('s000'));assert.equal(env.navigation.length,0);
  db.data.merchants.find(m=>m._id==='m000').moderationHidden=false;await p.load();p.book(tap('s000'));assert.equal(env.navigation.length,1);
});
for (const type of ['fixed','quote']) {
  for(const change of ['hidden','suspended','off']) test(type+'写入前变化 '+change,async()=>{
    const {db,call}=setup(1,type);
    db.faults.beforeTransaction=d=>{if(change==='off') d.merchantServices[0].status='off';
      else if(change==='hidden') d.merchants[0].moderationHidden=true; else d.merchants[0].status='suspended';};
    await assert.rejects(()=>call('merchant','createBooking',{serviceId:'s000',requestId:'qa93_request'}),{code:'E_CONFLICT'});
    assert.equal((db.data.orders||[]).length,0);
  });
  test('列表→详情→预约→订单详情路由，幂等及后续隐藏保留原单 '+type,async()=>{
    const {db,call}=setup(1,type);let payments=0;const env=runtime(call,{payment:{pay:async()=>{payments++;return false;}}});
    env.app.globalData.user=db.data.users[0];const l=view(env,false);await l.onShow();l.open(tap('m000'));
    assert.match(env.navigation.at(-1)[1],/merchantId=m000$/);const d=view(env,true);await d.onShow();d.book(tap('s000'));
    assert.match(env.navigation.at(-1)[1],/serviceId=s000$/);
    const b=env.instance('miniprogram/shops/booking/booking.js');b.onLoad({serviceId:'s000'});await b.onShow();await b.submit();
    const o=db.data.orders[0];assert.equal(o.status,type==='fixed'?'pending_pay':'pending_quote');assert.equal(payments,type==='fixed'?1:0);
    assert.equal(env.navigation.at(-1)[1],'/pages/orders/detail?id='+o._id);
    const req=env.requests.find(x=>x[1]==='createBooking')[2];const again=await call('merchant','createBooking',req);
    assert.equal(again.orderId,o._id);assert.equal(db.data.orders.length,1);
    if(type==='quote'){db.setActor('staff');await call('merchant','quoteBooking',{orderId:o._id,amount:700,detail:'测试报价'});db.setActor('actor');}
    assert.equal(o.pricing.payAmount,type==='quote'?700:500);
    const old=JSON.stringify(o);db.data.merchants[0].moderationHidden=true;
    await assert.rejects(()=>call('merchant','createBooking',{...req,requestId:'qa93_new_request'}));assert.equal(JSON.stringify(db.data.orders[0]),old);assert.equal(db.data.orders.length,1);
  });
}
module.exports = { setup };
if (require.main === module) (async()=>{for(const [name,run] of cases){await run();console.log('通过',name);} console.log(cases.length+' 组通过');})().catch(e=>{console.error(e);process.exitCode=1;});
