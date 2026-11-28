// Isolated real page handlers + WXML visibility conditions; no cloud writes.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', message: e.message }); }
}
function condition(route, marker, data) {
  const xml = fs.readFileSync('miniprogram/' + route + '.wxml', 'utf8');
  const before = xml.slice(0, xml.indexOf(marker));
  assert(xml.includes(marker), marker);
  const tag = before.slice(before.lastIndexOf('<'));
  const match = tag.match(/wx:(?:if|elif)="\{\{(.*?)\}\}"/);
  assert(match, 'Missing condition for ' + marker);
  if (tag.includes('wx:elif')) {
    const prior = [...before.slice(0, before.lastIndexOf('<')).matchAll(/wx:if="\{\{(.*?)\}\}"/g)].pop();
    if (prior && vm.runInNewContext(prior[1], { ...data })) return false;
  }
  return Boolean(vm.runInNewContext(match[1], { ...data }));
}
function setup(route, response) {
  const state = { fail: true, response };
  const r = runtime(async () => { if (state.fail) throw Error('合成读取失败'); return state.response; });
  Object.assign(r.app.globalData, { user: { _id: 'fixture', roles: ['resident', 'admin'], addresses: [] } });
  return { r, state, p: r.instance('miniprogram/' + route + '.js') };
}
(async () => {
  const route = 'merchant/workbench/workbench';
  const { p, state } = setup(route, { merchant: null });
  const visible = () => condition(route, '\n<block wx:if="{{merchant}}">', p.data);
  await test('QA17初次失败不显示未申请或业务状态', async () => {
    await p.load(); assert.equal(p.data.error, '合成读取失败'); assert.equal(visible(), false);
  });
  await test('QA17恢复成功无申请才展示空态', async () => {
    state.fail = false; await p.load(); assert(visible()); assert.equal(p.data.merchant, null);
  });
  for (const status of ['pending', 'approved', 'rejected']) await test('QA17成功申请状态 ' + status, async () => {
    state.response = { merchant: { status, name: '合成商家' } }; await p.load(); assert(visible()); assert.equal(p.data.merchant.status, status);
  });
  await test('QA17成功后失败保留数据但不显示旧状态；重试可恢复', async () => {
    state.fail = true; await p.load(); assert(!visible()); assert(p.data.merchant);
    state.fail = false; await p.load(); assert(visible());
  });
  const cases = [
    ['pages/bind/bind', '暂时没有可服务的小区', { communities: [] }],
    ['provider/workbench/workbench', ' message="你还没有提交服务员申请"', { provider: null, tasks: [] }],
    ['admin/reports/reports', '暂无符合当前筛选的举报', { rows: [] }],
    ['admin/stations/stations', '暂无待审核申请', { rows: [] }],
    ['notices/list/list', '暂无公告', { list: [] }]
  ];
  for (const [route, marker, empty] of cases) {
    await test('QA18空结果状态区分 ' + route, async () => {
      assert(!condition(route, marker, { ...empty, loading: true, error: '' }));
      assert(!condition(route, marker, { ...empty, loading: false, error: '读取失败' }));
      assert(condition(route, marker, { ...empty, loading: false, error: '' }));
    });
  }
  const st = 'station/apply/apply';
  const fixture = setup(st, { list: [{ _id: 'fixture', stations: [{ code: 'north' }] }], application: null });
  await test('QA18驿站初次失败隐藏状态/表单/空态，恢复重新展示', async () => {
    await fixture.p.load(); assert(fixture.p.data.loadError); assert.equal(fixture.p.data.loading, false);
    const xml=fs.readFileSync('miniprogram/'+st+'.wxml','utf8');
    const guards=[...xml.matchAll(/wx:if="\{\{([^}]*loadError[^}]*)\}\}"/g)].map(m=>m[1]); assert.equal(guards.length,3);
    for(const expr of guards)assert(!vm.runInNewContext(expr,{...fixture.p.data}));
    fixture.state.fail=false;await fixture.p.load();assert(!fixture.p.data.loadError);assert.equal(fixture.p.data.communities.length,1);
    assert(vm.runInNewContext(guards[1],{...fixture.p.data}));
  });
  await test('QA18驿站提交失败仍保留表单选择及可重试状态', async () => {
    fixture.state.fail=true;const before=JSON.stringify(fixture.p.data.communities);await fixture.p.submit();
    assert.equal(fixture.p.data.error,'合成读取失败');assert.equal(fixture.p.data.loadError,false);
    assert.equal(JSON.stringify(fixture.p.data.communities),before);assert.equal(fixture.p.data.busy,false);
  });
  await test('QA18驿站原申请读取失败不抹掉资料，恢复后正确显示', async () => {
    fixture.state.response={list:[],application:{status:'pending',stationName:'合成驿站'}};fixture.state.fail=false;await fixture.p.load();
    fixture.state.fail=true;await fixture.p.load();assert(fixture.p.data.loadError);assert.equal(fixture.p.data.application.status,'pending');
    fixture.state.fail=false;await fixture.p.load();assert(!fixture.p.data.loadError);assert.equal(fixture.p.data.application.status,'pending');
  });
  const report={scope:'隔离真实页面方法及模板条件；非实景、非真实云写入',total:results.length,passed:results.filter(r=>r.status==='PASS').length,results};
  fs.writeFileSync(__dirname+'/qa17-18.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  if(report.passed!==report.total)process.exitCode=1;
})();
