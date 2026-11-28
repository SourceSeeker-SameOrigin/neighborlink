// Run from repo root; no platform requests or mutations. Input A/B are synthetic.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const pagePath = 'miniprogram/pages/index/index.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const cases = [];
const check = (name, pass, actual) => cases.push({name, pass: !!pass, actual});
function fixture(action) {
  const pending = new Map();
  const env = runtime(async (_, op, {communityId: id}) => {
    if (op === action) await new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
    if (op === 'getCommunity') return {_id:id,enabledFeatures:{events:id === 'B'}};
    if (op === 'homeContent') return {notice:{title:id}, ads:[{_id:id}]};
    throw Error('unexpected operation');
  });
  const page = env.instance(pagePath);
  const show = id => {
    env.app.globalData.user = {_id:'fixture',buildingId:'fixture',communityId:id,firstPaidAt:id==='B'?1:null};
    return page.onShow();
  };
  const view = () => [page.data.community?._id,env.app.globalData.community?._id,page.data.notice?.title,page.data.ads[0]?._id,page.data.eventsEnabled,page.data.firstOrder];
  return {pending,env,page,show,view};
}
(async () => {
  for (const step of ['getCommunity','homeContent']) {
    const f = fixture(step), a = f.show('A'); await tick();
    const b = f.show('B'); await tick(); f.pending.get('B').resolve(); await b;
    const right = JSON.stringify(['B','B','B','B',true,false]);
    check(step+': current result',JSON.stringify(f.view())===right,f.view());
    f.pending.get('A').resolve(); await a;
    check(step+': ignore stale success',JSON.stringify(f.view())===right,f.view());
  }
  {
    const f = fixture('getCommunity'), a = f.show('A'); await tick();
    const b = f.show('B'); await tick(); f.pending.get('B').resolve(); await b;
    f.pending.get('A').reject(Error('fixture A failed')); await a;
    check('ignore stale error',f.page.data.error==='',f.page.data.error);
  }
  {
    const f = fixture('getCommunity'), a = f.show('A'); await tick();
    const b = f.show('B'); await tick(); f.pending.get('A').resolve(); await a;
    check('newer request still loading',f.page.data.loading,f.page.data.loading);
    f.pending.get('B').resolve(); await b;
  }
  for (const hook of ['onHide','onUnload']) {
    const f = fixture('getCommunity'), a = f.show('A'); await tick();
    f.page[hook]?.(); let writes = 0; const set = f.page.setData.bind(f.page);
    f.page.setData = patch => { writes++; set(patch); };
    f.pending.get('A').resolve(); await a;
    check(hook+': no late UI or global writes',writes===0 && !f.env.app.globalData.community,{writes,global:f.env.app.globalData.community?._id||null});
  }
  {
    const f = fixture('getCommunity'), sessions = [];
    f.env.app.ensureSession = () => new Promise(r => sessions.push(r));
    const a = f.show('A'), b = f.show('B');
    sessions[1]({communityId:'B',buildingId:'test'}); await tick();
    f.pending.get('B').resolve(); await b; sessions[0]({}); await a;
    check('stale unbound session cannot clear B', f.env.app.globalData.community?._id==='B' && !f.page.data.needsBinding, f.view());
  }
  {
    const f=fixture('homeContent'), a=f.show('A'); await tick();
    f.page.onHide(); const b=f.show('B'); await tick(); f.pending.get('B').reject(Error('optional content unavailable')); await b;
    f.pending.get('A').resolve(); await a;
    check('return reload with optional content failure',f.page.data.community?._id==='B' && f.env.app.globalData.community?._id==='B' && f.page.data.notice===null && !f.page.data.ads.length && !f.page.data.error,f.view());
    f.env.app.globalData.user={}; await f.page.onShow();
    check('current unbound clears previous community',f.page.data.needsBinding && !f.page.data.community && !f.env.app.globalData.community,f.view());
  }
  console.log(JSON.stringify(cases,null,2));
  if(cases.some(c=>!c.pass)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=2});
