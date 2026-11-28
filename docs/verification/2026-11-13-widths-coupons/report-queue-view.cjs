// Compile actual WeChat template. No device width or actual rendering is inferred from this test.
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const {fixture}=require('../2026-11-09-remediation/cloud-fixture.cjs');
const template='admin/reports/reports.wxml';
const ctx={window:{__webview_engine_version__:0.02},console};
const wcc=process.env.WCC||'/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc';
vm.runInNewContext(execFileSync(wcc,[template],{cwd:'miniprogram',encoding:'utf8'}),ctx);
const render=ctx.$gwx(template);
const labels={pending:'待处理',upheld:'已成立',dismissed:'已驳回'};
const reports=Object.keys(labels).map(status=>({_id:status,targetId:'e',targetType:'event',status,reason:'其他问题',text:'合成说明',communityId:'c'}));
const db=fixture({roles:['admin'],local:true,records:{reports,events:[{_id:'e',ownerOpenid:'organizer'}]}});
const env=runtime(async(n,a,d)=>{const r=await db.call(n,a,d);assert.ok(r.ok);return r.data;});
function flatten(node,buttons=[],strings=[],parent='') {
  if(typeof node==='string') {strings.push(node);if(parent==='wx-button')buttons.push(node.trim());}
  else for(const child of node.children||[]) flatten(child,buttons,strings,node.tag||parent);
  return {buttons,text:strings.join('')};
}
(async()=>{
 const p=env.instance('miniprogram/admin/reports/reports.js');
 for(const [status,label] of Object.entries(labels)){
   p.setData({status});await p.load(true);assert.equal(p.data.rows.length,1);
   const {buttons,text}=flatten(render(p.data));
   assert.ok(text.includes('当前筛选：'+label));assert.ok(text.includes('活动 · 其他问题')&&text.includes('合成说明'));
   assert.equal(buttons.includes('举报成立'),status==='pending');assert.equal(buttons.includes('驳回'),status==='pending');
   assert.ok(!buttons.some(s=>s.includes('查看相关聊天记录')));
   console.log('PASS '+label+'：选中说明、非空活动卡、对应审核按钮');
 }
 assert.equal(db.writes.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
