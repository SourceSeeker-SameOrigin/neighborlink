// Actual page handlers, local deferred reads. Never contacts WeChat or creates a signup.
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const rows = [];
function check(name, expected, actual) { rows.push({name, expected, actual, pass: expected === actual}); }
function item(title, status) {
  return {title, status:'published', featureEnabled:true, remaining:3, fee:0,
    signupDeadline:Date.now()+3600000, startAt:Date.now()+7200000, endAt:Date.now()+10800000,
    canSignup:!status, mySignup:status?{status}:null};
}
function setup() {
  const reads=[], calls=[];let prompts=0;
  const env=runtime(async (_,action)=>{
    calls.push(action);
    if(action==='detail')return new Promise((resolve,reject)=>reads.push({resolve,reject}));
    if(action==='templates')return {};
    throw new Error('offline test stops action');
  });
  env.wx.showModal=opts=>{prompts++;opts.success({confirm:true});};
  const page=env.instance('miniprogram/events/detail/detail.js');page.onLoad({id:'fixture'});
  return {page,reads,calls,prompts:()=>prompts};
}
(async()=>{
  for(const status of [null,'signed','pending_pay']){
    const f=setup(), first=f.page.onShow();await flush();f.reads[0].resolve(item('first',status));await first;
    f.page.onHide();const again=f.page.onShow();await flush();f.reads[1].reject(new Error('读取失败'));await again;
    const start=f.calls.length;
    const mode=status==='signed'?'cancelSignup':'signup';
    await f.page[mode]();
    check((status||'new')+' failed refresh business calls',0,f.calls.slice(start).length);
    if(status==='signed')check('failed refresh confirmation prompts',0,f.prompts());
    const retry=f.page.load();await flush();f.reads[2].resolve(item('fresh',status));await retry;
    check((status||'new')+' read retry', 'fresh',f.page.data.item?.title);
  }
  for(const reject of [false,true]){
    const f=setup(), a=f.page.onShow();await flush();f.page.onHide();
    const b=f.page.onShow();await flush();f.reads[1].resolve(item('latest'));await b;
    if(reject)f.reads[0].reject(new Error('旧错误'));else f.reads[0].resolve(item('old'));
    await a;check('late '+(reject?'error':'success'),reject?'':'latest',reject?f.page.data.error:f.page.data.item?.title);
  }
  for(const hook of ['onHide','onUnload']){
    const f=setup(), a=f.page.onShow();await flush();f.page[hook]();
    let writes=0;const write=f.page.setData.bind(f.page);f.page.setData=p=>{writes++;write(p);};
    f.reads[0].resolve(item('after leave'));await a;check(hook+' late UI writes',0,writes);
  }
  console.log(JSON.stringify(rows,null,2));
  if(rows.some(row=>!row.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=2;});
