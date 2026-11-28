// Actual client handlers and order entry. All database records and transport faults are local.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('./order-coupon-paging.cjs');
const entry = process.argv[2] || 'cloudfunctions/order/index.js';
const options = [{ code: 'N', name:'北门' }, { code:'S', name:'南门' }];
const services = {
  express: { route:'pages/service/express', list:'stations', field:'stationIndex', code:'stationCode',
    detail:['pickupText', '1-2-3456'] },
  meal: { route:'elder/meal', list:'canteens', field:'canteenIndex', code:'canteenCode',
    detail:['items','一份米饭'] }
};
async function check(service, change) {
  const spec = services[service], db = setup(0, true);
  const cloud = db.load(entry), user = db.data.users[0], community = db.data.communities[0];
  const address = { communityId:'c',buildingId:'b',unit:'一单元',room:'测试',contactPhone:user.phone };
  user.addresses = [{...address,id:'home',isDefault:true},{...address,id:'other',room:'另一合成门牌'}];
  community[spec.list] = [...options];
  community.features.elder = true;
  community.prices = structuredClone(community.prices);
  community.prices.meal.goodsCapMax = 20000;
  db.cloud.openapi.security.msgSecCheck = async () => ({result:{suggest:'pass'}});
  const sends = [];
  const ui = runtime(async (name,action,params) => {
    if (name === 'catalog') return structuredClone(community);
    if (action === 'create') {
      sends.push(structuredClone(params));
      if (sends.length === 1) throw Error('隔离测试：发送前断网');
    }
    const r = await cloud.main({...params,action});
    if (!r.ok) throw Error(r.code+': '+r.message);
    return r.data;
  }, {payment:{pay:async()=>false}});
  ui.app.globalData.user = user;
  async function open() {
    const page = ui.instance('miniprogram/'+spec.route);
    page.onLoad({});
    await page.load(); await page.refreshQuote();
    return page;
  }
  let page = await open();
  const field = (name,value) => page.change({currentTarget:{dataset:{field:name}}, detail:{value}});
  await page.addressChange({detail:{value:1}});
  field(...spec.detail); field(spec.field,'1');
  await page.refreshQuote();
  page.slotChange({detail:{value:1}});
  await page.refreshQuote();
  assert.ok(page.data.quote,page.data.quoteError);
  const amount = page.data.amount;
  await page.submit(); page.onUnload();
  if (change === 'reorder') community[spec.list] = [options[1], options[0]];
  if (change === 'replace') community[spec.list] = [options[0],{code:'W',name:'西门'}];
  if (change === 'remove') community[spec.list] = [options[0]];
  const key = 'orderDraft:'+user._id+':'+service;
  if (change === 'legacy') delete ui.store[key].place;
  if (change === 'foreignCommunity') ui.store[key].place.communityId = 'other';
  user.addresses.reverse();
  page = await open();
  assert.equal(sends.length,1);
  assert.equal(db.data.orders?.length || 0,0);
  const hasQuote = !!page.data.quote;
  await page.submit();
  const original = sends[0], confirmed = sends[1];
  if (confirmed) {
    assert.equal(confirmed.requestId,original.requestId);
    assert.equal(confirmed.addressId,original.addressId);
    assert.deepEqual(confirmed.slot,original.slot);
    assert.equal(page.data.amount,amount);
    assert.equal(db.data.orders.length,1);
  }
  const missing = ['replace','remove','legacy','foreignCommunity'].includes(change);
  const oldChoice = original.detail[spec.code];
  if (missing) {
    assert.equal(hasQuote,false);
    assert.equal(confirmed,undefined);
    assert.equal(page.data.placeNeedsSelection,true);
    page.selectPlace({detail:{value:'0'}});
    await page.refreshQuote(); await page.submit();
    assert.equal(sends.length,1);
    page.selectPlace({detail:{value:'1'}});
    await page.refreshQuote();
    assert.ok(page.data.quote,page.data.quoteError);
    await page.submit();
    assert.equal(sends.length,2);
    assert.equal(sends[1].requestId,original.requestId);
    assert.deepEqual(sends[1].slot,original.slot);
    assert.equal(sends[1].addressId,original.addressId);
  }
  assert.equal(db.data.orders.length,1);
  const finalChoice = db.data.orders[0].detail[spec.code];
  assert.equal(finalChoice,missing ? community[spec.list][0].code : oldChoice);
  return {service,change,oldChoice,finalChoice,explicitReselection:missing};
}
(async()=>{
  const rows = [];
  for (const service of Object.keys(services)) for (const change of ['none','reorder','replace','remove','legacy','foreignCommunity']) {
    rows.push(await check(service,change));
  }
  console.table(rows);
  console.log(rows.length+' scenarios passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
