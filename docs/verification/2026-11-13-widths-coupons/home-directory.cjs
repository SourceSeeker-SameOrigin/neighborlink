// Test the actual home event handler with isolated navigation. No cloud calls.
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('node:assert/strict');
const app = require('../../../miniprogram/app.json');
const routes = new Set([...app.pages,...(app.subPackages||app.subpackages||[]).flatMap(p=>p.pages.map(s=>p.root+'/'+s))]);
const tabs = new Set(app.tabBar.list.map(i=>i.pagePath));
const dest = {
  elder:'elder/meal',pet:'pet/order',recycle:'recycle/order/order',vacantHome:'pages/membership/index',
  merchants:'shops/list/list',idle:'idle/list/list',events:'events/list/list',board:'board/list/list',
  travelCarry:'board/list/list?type=carry',escort:'elder/escort',visit:'pages/membership/index',
  coupons:'coupons/center/center',chat:'chat/list/list',notices:'notices/list/list',stationDelivery:'pages/me/me',
  points:'pages/me/me',idleEscrow:'idle/list/list',federation:'board/list/list',autoPayout:'pages/me/me'
};
const env=runtime(), p=env.instance('miniprogram/pages/index/index.js');
assert.deepEqual(Object.keys(dest).sort(), Array.from(p.data.serviceCatalog, i=>i.code).sort());
const modals=[]; env.wx.showModal = m=>modals.push(m);
const visit = code=>p.introduce({currentTarget:{dataset:{code}}});
for (const [code,path] of Object.entries(dest)) {
  const entry=p.data.serviceCatalog.find(i=>i.code===code); const eventCount=env.navigation.length;
  p.data.needsBinding=true; visit(code);
  assert.deepEqual(env.navigation[eventCount],['navigateTo','/pages/bind/bind']);
  p.data.needsBinding=false; p.data.community={enabledFeatures:{}}; const m=modals.length; visit(code);
  assert.equal(modals.length,m+1); assert.match(modals[m].title,/暂未开通/); assert.equal(env.navigation.length,eventCount+1);
  p.data.community.enabledFeatures={[entry.feature]:true,...(code==='federation'?{board:true}:{})};
  visit(code); const bare=path.split('?')[0]; assert(routes.has(bare));
  assert.deepEqual(env.navigation[eventCount+1],[tabs.has(bare)?'switchTab':'navigateTo','/'+path]);
}
for (const [feature,path] of [['idle','idle/list/list'],['events','events/list/list']]) {
  p.data.community.enabledFeatures={federation:true,[feature]:true};
  visit('federation');assert.deepEqual(env.navigation.at(-1),['navigateTo','/'+path]);
}
assert.equal(env.requests.length,0);
console.log('19 entries × 3 states = 57 passed; federation alternate targets 2/2; zero cloud calls.');
