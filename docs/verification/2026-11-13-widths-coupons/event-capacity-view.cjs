// Use the production page's action calculation and the template compiled by WeChat's wcc.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { eventView } = require('../../../cloudfunctions/_shared/eventData');
const template = 'events/detail/detail.wxml';
const compiler = process.env.WCC || '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc';
const ctx = {window:{__webview_engine_version__:0.02}, console};
vm.runInNewContext(execFileSync(compiler,[template],{cwd:'miniprogram',encoding:'utf8'}),ctx);
const render = ctx.$gwx(template);
const page = runtime().instance('miniprogram/events/detail/detail.js');
function texts(node, isButton=false, out={buttons:[],all:[]}) {
  if(typeof node==='string') {
    out.all.push(node);
    if(isButton) out.buttons.push(node.trim());
  } else {
    for(const child of node.children||[]) texts(child,isButton||node.tag==='wx-button',out);
  }
  return out;
}
let count=0;
for(const status of [null,'cancelled','refunded','signed','pending_pay','checked_in']) {
  for(const remaining of [0,1]) {
    for(const closed of [false,true]) {
      const now=Date.now(), deadline=now+(closed?-60000:60000);
      const item={...eventView({capacity:1,signupCount:1-remaining,status:'published',
        signupDeadline:new Date(deadline),startAt:new Date(now+120000)},status?{status}:null),featureEnabled:true};
      const actions=page.actionsFor(item);
      const rejoin=[null,'cancelled','refunded'].includes(status);
      const cancellable=['signed','pending_pay'].includes(status);
      const expectedReason=closed?(cancellable?'报名已截止，无法取消报名':'活动报名已截止'):
        rejoin&&remaining===0?'活动名额已满':'';
      const view=texts(render({...page.data,loading:false,item,actions}));
      const label=JSON.stringify({status,remaining,closed});
      assert.deepEqual(view.all.filter(t=>['活动名额已满','报名已截止，无法取消报名','活动报名已截止'].includes(t)),
        expectedReason?[expectedReason]:[],label);
      const buttons=[];
      if(rejoin&&remaining&&!closed) buttons.push('报名');
      if(status==='pending_pay') buttons.push('继续支付');
      if(cancellable&&!closed) buttons.push('取消报名');
      buttons.push('举报活动');
      assert.deepEqual(view.buttons,buttons,label);
      count++;
    }
  }
}
console.log('活动详情实际模板：'+count+' 组满额/余位、截止及报名状态通过');

// Independent failures must retain their own retry destination.
for (const [error,reportError] of [['',''],['','提交失败'],['读取失败',''],['读取失败','提交失败']]) {
  const view=texts(render({...page.data,loading:false,item:{title:'合成活动'},actions:{},error,reportError}));
  assert.equal(view.buttons.includes('重试举报'),Boolean(reportError));
  assert.equal(view.buttons.includes('举报活动'),!reportError);
  assert.equal(view.buttons.includes('重试'),Boolean(error));
  assert.equal(view.all.join('').includes('举报未确认'),Boolean(reportError));
}
console.log('活动详情模板：4 组举报与详情错误组合通过');
