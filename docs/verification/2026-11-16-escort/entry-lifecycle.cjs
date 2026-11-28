// No cloud: synthetic orders, synthetic credential and controlled responses.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
let count = 0;
function check(name, condition) { assert.ok(condition, name); count++; console.log('PASS', name); }
async function test(kind) {
  let denied = false, reads = [], modals = 0;
  const ui = runtime(async (_, action) => {
    if (action === 'revealEntry') return new Promise((resolve, reject) => reads.push({resolve,reject}));
    if (denied) throw Error('模拟无权读取');
    if (action === 'listVisits') return {list:[{_id:'v', status:'pending'}], entryMode:'password'};
    if (action === 'detail') return {serviceCode:'vacant', detail:{entry:'password'}, pricing:{goodsCap:0}, canShareLocation:false};
    throw Error('Unexpected action: '+action);
  }, {media:{}});
  ui.wx.showModal = () => modals++;
  const pet = kind === 'pet', p = ui.instance(pet ? 'miniprogram/pet/work' : 'miniprogram/provider/task/task');
  p.onLoad({id:'sample'});
  const click = () => pet ? p.reveal({currentTarget:{dataset:{id:'v'}}}) : p.revealEntry();
  await p.onShow();
  let initial = click(); await click(); check(kind+' 单次主动查看', reads.length === 1);
  reads.at(-1).resolve({entry:'synthetic'}); await initial; check(kind+' 当前任务可见', p.data.entryPassword === 'synthetic');
  p.closeSecret(); check(kind+' 手动关闭', !p.data.entryPassword);
  initial=click(); reads.at(-1).resolve({entry:'synthetic'}); await initial; p.onHide();
  check(kind+' 隐藏清除', !p.data.entryPassword); await p.onShow();
  check(kind+' 返回不自动读取', reads.length === 2 && !p.data.entryPassword);
  for(const lifecycle of ['onHide','onUnload']) {
    const late=click(); p[lifecycle](); reads.at(-1).resolve({entry:'synthetic'}); await late;
    check(kind+' '+lifecycle+' 后无迟到展示', !p.data.entryPassword && !modals);
    if(lifecycle==='onHide') await p.onShow();
  }
  // New page instance after unloading; refresh and denial must invalidate any previous disclosure.
  const q=ui.instance(pet?'miniprogram/pet/work':'miniprogram/provider/task/task'); q.onLoad({id:'sample'}); await q.onShow();
  const reveal=()=>pet?q.reveal({currentTarget:{dataset:{id:'v'}}}):q.revealEntry();
  const pending=reveal(), old=reads.at(-1); await q.load();
  const fresh=reveal(); reads.at(-1).resolve({entry:'current'}); await fresh;
  old.resolve({entry:'old'}); await pending;
  check(kind+' 旧响应不覆盖新读取',q.data.entryPassword==='current');
  denied=true; await q.load();
  check(kind+' 拒绝刷新清除密码',!q.data.entryPassword && !!q.data.error);
  check(kind+' 拒绝刷新不留旧任务入口',pet?!q.data.visits.length:!q.data.order);
  const n=reads.length; await reveal(); check(kind+' 拒绝后不再读取',reads.length===n);
}
(async()=>{await test('pet'); await test('vacant'); console.log(count+' checks passed');})().catch(e=>{console.error(e);process.exitCode=1;});
