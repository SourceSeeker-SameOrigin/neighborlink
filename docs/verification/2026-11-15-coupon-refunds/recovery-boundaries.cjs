// Isolated UI lifecycle tests. No cloud calls, orders or payments.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const routes = { express:'pages/service/express', trash:'pages/service/trash', buy:'pages/service/buy',
  help:'pages/service/help', meal:'elder/meal', escort:'elder/escort', pet:'pet/order' };

async function verify(code, mode) {
  let release, lookups = 0;
  const actions = [];
  const ui = runtime(async (name, action, args) => {
    actions.push(action);
    if (action === 'lookupRequest') {
      assert.equal(args.requestId, 'qa79_pending');
      if (++lookups === 1) {
        if (mode === 'failure') throw Error('合成查询失败');
        if (mode === 'invalid') return {};
        if (mode === 'hide') return new Promise(resolve => { release = resolve; });
      }
      return { orderId: mode === 'missing' ? null : 'qa79_existing' };
    }
    if (action === 'getCommunity') return { _id:'c', stations:[], canteens:[], prices:{} };
    if (action === 'quote') {
      assert.equal(args.pointsToUse, 40);
      assert.equal(args.couponId, '');
      return { slots:[], pricing:null, validationMessage:'请核对资料' };
    }
    throw Error('unexpected call '+name+'.'+action);
  });
  const user = ui.app.globalData.user = { _id:'qa79', communityId:'c', buildingId:'b',
    addresses:[{id:'first',communityId:'c',isDefault:true},{id:'second',communityId:'c'}] };
  const key = 'orderDraft:'+user._id+':'+code;
  ui.store[key] = {userId:user._id, communityId:'c', savedAt:0, form:{ entryIndex:0, entryPassword:'SYNTHETIC-SECRET' },
    request:{ id:'qa79_pending', signature:JSON.stringify({communityId:'c', addressId:'second',couponId:'',pointsToUse:40}) }};
  const page = ui.instance('miniprogram/'+routes[code]);
  page.onLoad({});
  const loading = page.load();
  if (mode === 'hide') {
    await new Promise(resolve => setImmediate(resolve));
    page.onHide(); release({orderId:'late'});
  }
  await loading;
  assert.ok(!JSON.stringify(ui.store).includes('SYNTHETIC-SECRET'));
  assert.ok(!JSON.stringify(ui.store).includes('signature'));
  if (mode === 'missing') {
    assert.equal(page.data.addressIndex,1);
    assert.equal(page.data.couponChoice,'');
    assert.equal(page.data.pointsToUse,40);
    assert.equal(ui.navigation.length,0);
    if (code === 'pet') {
      assert.equal(page.data.form.entryPassword,'');
      assert.match(page.data.recoveryHint,/重新填写入户密码/);
    }
    await page.refreshQuote();
    assert.deepEqual(actions,['lookupRequest','getCommunity','quote']);
    return;
  }
  await page.submit();
  assert.equal(ui.navigation.length,0);
  assert.deepEqual(actions,['lookupRequest']);
  assert.equal(ui.store[key].request.id,'qa79_pending');
  if (mode === 'hide') assert.equal(page.data.createdOrderId,'');
  else assert.ok(page.data.error);
  page.hidden = false;
  await page.load();
  assert.deepEqual(actions,['lookupRequest','lookupRequest']);
  assert.equal(ui.navigation[0][1],'/pages/orders/detail?id=qa79_existing');
}
(async () => {
  let passed = 0;
  for (const code of Object.keys(routes)) for (const mode of ['missing','failure','invalid','hide']) {
    await verify(code,mode);
    passed++;
  }
  console.log('QA79 recovery boundaries passed:',passed);
})().catch(error => {console.error(error);process.exitCode=1;});
