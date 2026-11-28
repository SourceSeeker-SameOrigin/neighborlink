// Run from the project root. Actual page and server entry; all identities and media are synthetic.
const assert = require('node:assert/strict');
const {fixture} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');

async function serverChecks() {
  for (const [label, owner, assigned, role, permitted] of [
    ['本人住户', true, false, 'resident', true],
    ['其他住户', false, false, 'resident', false],
    ['指派服务员', false, true, 'provider', true],
    ['其他服务员', false, false, 'provider', false],
    ['管理员', false, false, 'admin', true]
  ]) {
    const db = fixture({roles:[role], records:{
      communities:[{_id:'c', status:'active', features:{pet:true}}],
      orders:[{_id:'o', communityId:'c', serviceCode:'pet', userOpenid:owner?'actor':'resident',
        providerId:'p', providerOpenid:assigned?'actor':'provider', status:'in_service', detail:{entry:'password'}}],
      providers:role==='provider'?[{_id:assigned?'p':'different', openid:'actor'}]:[],
      visits:[{_id:'v', parentOrderId:'o', seq:1, status:'done', photos:['synthetic-photo']}]
    }});
    const response = await db.call('pet','listVisits',{orderId:'o'});
    assert.equal(response.ok,permitted,label);
    if (permitted) assert.equal(response.data.list.length,1);
    else assert.equal(response.code,'E_FORBIDDEN');
    console.log('PASS',label);
  }
}

async function pageChecks() {
  const pending = [];
  const ui = runtime(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
  const page = ui.instance('miniprogram/pet/reports');
  page.onLoad({id:'o'});
  const tick = ()=>new Promise(setImmediate);
  const record = id=>({list:[{_id:id, photos:['synthetic-photo'], videoFileId:'synthetic-video'}]});
  const outcomes = [];
  const check = (label,ok)=>{outcomes.push(ok); console.log(ok?'PASS':'FAIL',label);};
  page.onShow(); await tick(); pending.shift().resolve(record('first')); await tick();
  check('首次读取成功', page.data.visits[0]?._id==='first');
  const next=page.load(); await tick();
  check('刷新移除旧记录',!page.data.visits.length);
  pending.shift().reject(Object.assign(Error('模拟拒绝'),{code:'E_FORBIDDEN'})); await next;
  check('拒绝后清空记录及媒体引用',!page.data.visits.length && !!page.data.error);
  const retry=page.load(); await tick(); pending.shift().resolve(record('retry')); await retry;
  check('主动重试仅展示本轮结果',page.data.visits[0]?._id==='retry' && !page.data.error);
  check('拒绝留页可重试',ui.requests.every(r=>r[3].redirectOnForbidden===false));
  const old=page.load(); await tick(); const fresh=page.load(); await tick();
  pending.pop().resolve(record('new')); await fresh; pending.shift().resolve(record('old')); await old;
  check('拒绝旧响应覆盖',page.data.visits[0]?._id==='new');
  const oldError=page.load();await tick();const latest=page.load();await tick();
  pending.pop().resolve(record('latest'));await latest;pending.shift().reject(Error('过期错误'));await oldError;
  check('旧错误不覆盖新成功',!page.data.error && page.data.visits[0]?._id==='latest');
  for(const phase of ['onHide','onUnload']) {
    const task=page.load(); await tick(); page[phase]?.();
    pending.shift().resolve(record('late')); await task;
    check(phase+' 后清空且无迟到写入',!page.data.visits.length);
    if(phase==='onHide'){page.onShow();await tick();pending.shift().resolve(record('again'));await tick();}
  }
  assert.ok(outcomes.every(Boolean),'存在未通过的页面检查');
}
serverChecks().then(pageChecks).catch(e=>{console.error(e.message);process.exitCode=1;});
