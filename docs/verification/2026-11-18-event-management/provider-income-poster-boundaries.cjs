// Actual page code, synthetic identities and intercepted APIs/native callbacks only.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((r,j) => { resolve=r; reject=j; }); return {promise,resolve,reject}; };
const posterRead = async (n,a) => a==='referralPoster' ? {tempFileURL:'https://synthetic.invalid/image'} : a==='myStatus' ? {provider:{_id:'a',status:'approved'},todayCount:0,todayIncome:0} : {list:[],hasMore:false};
const earnings = id => ({list:[{_id:id,amount:1000,createdAt:1}],pending:1000,settled:0,available:1000,canWithdraw:true,payoutEnabled:true,hasMore:false});
function fixture(route) {
  let handler = async (n,a) => a==='earnings' ? earnings('income-a') : a==='list' ? {list:[]} : a==='myStatus' ? {provider:{_id:'a',status:'approved'},todayCount:0,todayIncome:0} : a==='myTasks' ? {list:[],hasMore:false} : {};
  const env=runtime((...args)=>handler(...args)); env.app.globalData.user={_id:'a',roles:['provider']};
  const page=env.instance(`miniprogram/provider/${route}/${route}.js`); page.visible=true;
  const events={transfers:0,downloads:0,saves:0,toasts:0};
  env.wx.canIUse=()=>true;env.wx.requestMerchantTransfer=o=>{events.transfers++;o.success({});};env.wx.showToast=()=>events.toasts++;
  env.wx.downloadFile=o=>{events.downloads++;o.success({statusCode:200,tempFilePath:'synthetic-image'});};
  env.wx.saveImageToPhotosAlbum=o=>{events.saves++;o.success({});};
  return {env,page,events,use:fn=>handler=fn};
}
function invalidate(f,kind){if(kind==='user')f.env.app.globalData.user={_id:'b',roles:['provider']};else{f.page[kind]?.();f.page.visible=false;}}
function watch(f){let count=0;const set=f.page.setData;f.page.setData=function(p){count++;set.call(this,p);};return()=>count;}
async function test(name,body){let evidence;try{await body(x=>evidence=x);results.push({name,pass:true,evidence});}catch(e){results.push({name,pass:false,evidence,error:e.message});}}
(async()=>{
 await test('income-normal-read',async record=>{const f=fixture('earnings');await f.page.load(true);record({ready:f.page.data.ready,rows:f.page.data.rows.length,available:f.page.data.available});assert(f.page.data.ready);assert.equal(f.page.data.available,'10.00');});
 await test('income-failed-read-blocks-payout',async record=>{const f=fixture('earnings');await f.page.load(true);f.use(async()=>{throw Error('synthetic denied');});await f.page.load(true);await f.page.createPayout();const writes=f.env.requests.filter(r=>r[1]==='create').length;record({ready:f.page.data.ready,writes});assert(!f.page.data.ready);assert.equal(writes,0);});
 for(const kind of ['onHide','onUnload','user'])await test('income-late-read-'+kind,async record=>{const f=fixture('earnings'),d=deferred();f.use(async(n,a)=>a==='earnings'?d.promise:{list:[]});const op=f.page.load(true);await flush();invalidate(f,kind);const count=watch(f);d.resolve(earnings('old-a'));await op;record({updates:count(),ready:f.page.data.ready,loading:f.page.data.loading,error:f.page.data.error,rows:f.page.data.rows.map(x=>x._id)});if(kind==='user'){assert.equal(count(),1);assert.equal(f.page.data.loading,false);assert.equal(f.page.data.ready,false);assert.equal(f.page.data.rows.length,0);assert.match(f.page.data.error,/身份.*变化/);}else assert.equal(count(),0);});
 await test('income-return-refresh-supersedes-old-read',async record=>{const f=fixture('earnings'),d=deferred();let reads=0;f.use(async(n,a)=>a==='earnings'?(++reads===1?d.promise:earnings('new-b')):{list:[]});const op=f.page.load(true);await flush();invalidate(f,'onHide');f.env.app.globalData.user={_id:'b'};f.page.onShow();await flush();d.resolve(earnings('old-a'));await op;await flush();record({reads,rows:f.page.data.rows.map(x=>x._id)});assert.equal(f.page.data.rows[0]._id,'new-b');});
 for(const kind of ['same-page','onHide','onUnload','user'])await test('income-payout-entry-'+kind,async record=>{const f=fixture('earnings');await f.page.load(true);if(kind!=='same-page')invalidate(f,kind);f.use(async(n,a)=>a==='create'?{state:'created',packageInfo:'synthetic-package'}:a==='earnings'?earnings('a'):{list:[]});await f.page.createPayout();const writes=f.env.requests.filter(r=>r[1]==='create').length;record({writes,...f.events});assert.equal(writes,kind==='same-page'?1:0);});
 for(const kind of ['onHide','user'])for(const outcome of ['success','failure'])await test('income-payout-late-'+outcome+'-'+kind,async record=>{const f=fixture('earnings'),d=deferred();await f.page.load(true);f.use(async(n,a)=>a==='create'?d.promise:a==='earnings'?earnings('a'):{list:[]});const op=f.page.createPayout();await flush();invalidate(f,kind);const count=watch(f);if(outcome==='success')d.resolve({state:'created',packageInfo:'synthetic-package'});else d.reject(Error('old payout error'));await op;record({updates:count(),...f.events});assert.equal(f.events.transfers,0);assert.equal(count(),0);assert.equal(f.events.toasts,0);});
 for(const kind of ['same-page','onHide','user'])await test('poster-entry-'+kind,async record=>{const f=fixture('workbench');await f.page.load();if(kind!=='same-page')invalidate(f,kind);f.use(posterRead);await f.page.saveReferralPoster();record({...f.events});assert.equal(f.events.saves,kind==='same-page'?1:0);});
 for(const kind of ['onHide','user'])await test('poster-late-api-'+kind,async record=>{const f=fixture('workbench'),d=deferred();await f.page.load();f.use(async()=>d.promise);const op=f.page.saveReferralPoster();await flush();invalidate(f,kind);d.resolve({tempFileURL:'https://synthetic.invalid/image'});await op;record({...f.events});assert.equal(f.events.downloads,0);assert.equal(f.events.saves,0);});
 for(const kind of ['same-page','onHide','user'])await test('poster-late-download-'+kind,async record=>{const f=fixture('workbench');await f.page.load();let download;f.env.wx.downloadFile=o=>{download=o;f.events.downloads++;};f.use(posterRead);await f.page.saveReferralPoster();if(kind!=='same-page')invalidate(f,kind);download.success({statusCode:200,tempFilePath:'synthetic-image'});record({...f.events});assert.equal(f.events.saves,kind==='same-page'?1:0);});
 for(const kind of ['same-page','onHide','user'])await test('poster-save-error-'+kind,async record=>{const f=fixture('workbench');await f.page.load();let save;f.env.wx.saveImageToPhotosAlbum=o=>{save=o;f.events.saves++;};f.use(posterRead);await f.page.saveReferralPoster();if(kind!=='same-page')invalidate(f,kind);const count=watch(f);save.fail({errMsg:'synthetic album failure'});await flush();record({updates:count(),error:f.page.data.error});if(kind==='same-page')assert.equal(f.page.data.error,'synthetic album failure');else assert.equal(count(),0);});
 for(const route of ['earnings','workbench']) for(const timing of ['before-show','after-show']) for(const outcome of ['success','cancel']) await test(route+'-native-return-'+timing+'-'+outcome,async record=>{
   const f=fixture(route);await f.page.load(true);let native;
   if(route==='earnings'){f.use(async(n,a)=>a==='create'?{packageInfo:'synthetic-package'}:a==='earnings'?earnings('fresh-income'):{list:[]});f.env.wx.requestMerchantTransfer=o=>{native=o;f.events.transfers++;};}
   else{f.use(posterRead);f.env.wx.saveImageToPhotosAlbum=o=>{native=o;f.events.saves++;};}
   const op=route==='earnings'?f.page.createPayout():f.page.saveReferralPoster();await flush();assert(native);f.page.onHide();
   const finish=()=>outcome==='success'?native.success({}):native.fail({errMsg:'synthetic cancel'});
   if(timing==='before-show'){finish();await flush();await f.page.onShow();}else{await f.page.onShow();finish();}
   await op;await flush();record({ready:f.page.data.ready,error:f.page.data.error,busy:f.page.data.creatingPayout||f.page.data.savingPoster,...f.events});
   assert(f.page.data.ready);assert.equal(Boolean(f.page.data.creatingPayout||f.page.data.savingPoster),false);assert.equal(f.events.toasts,outcome==='success'?1:0);if(outcome==='cancel')assert.equal(f.page.data.error,'synthetic cancel');
 });
 for(const route of ['earnings','workbench'])for(const boundary of ['user','unload','refresh','read-failed'])await test(route+'-native-obsolete-'+boundary,async record=>{
   const f=fixture(route);await f.page.load(true);let native;
   if(route==='earnings'){f.use(async(n,a)=>a==='create'?{packageInfo:'synthetic-package'}:a==='earnings'?earnings('a'):{list:[]});f.env.wx.requestMerchantTransfer=o=>{native=o;};}
   else{f.use(posterRead);f.env.wx.saveImageToPhotosAlbum=o=>{native=o;};}
   const op=route==='earnings'?f.page.createPayout():f.page.saveReferralPoster();await flush();assert(native);
   if(boundary==='user')f.env.app.globalData.user={_id:'b'};
   if(boundary==='unload')f.page.onUnload();
   if(boundary==='refresh')await f.page.load(true);
   if(boundary==='read-failed'){f.use(async()=>{throw Error('synthetic refused');});f.page.onHide();await f.page.onShow();}
   const count=watch(f);native.success({});await op;await flush();record({updates:count(),...f.events});assert.equal(count(),0);assert.equal(f.events.toasts,0);
 });
 await test('income-page-retry-same-offset',async record=>{const f=fixture('earnings');let fail=true;const offsets=[];f.use(async(n,a,d)=>{if(a!=='earnings')return{list:[]};offsets.push(d.offset);if(d.offset&&fail){fail=false;throw Error('page failed');}return{...earnings(d.offset?'b':'a'),hasMore:!d.offset};});await f.page.load(true);await f.page.load();assert.equal(f.page.data.rows.length,1);await f.page.createPayout();assert.equal(f.env.requests.filter(r=>r[1]==='create').length,0);await f.page.retry();record({offsets,rows:f.page.data.rows.map(x=>x._id)});assert.deepEqual(offsets,[0,1,1]);assert.equal(f.page.data.rows.length,2);});
 await test('income-new-refresh-wins',async record=>{const f=fixture('earnings'),d=deferred();let reads=0;f.use(async(n,a)=>a==='earnings'?(++reads===1?d.promise:earnings('new')):{list:[]});const op=f.page.load(true);await flush();await f.page.load(true);d.resolve(earnings('old'));await op;record({rows:f.page.data.rows.map(x=>x._id)});assert.equal(f.page.data.rows[0]._id,'new');});
 for(const route of ['earnings','workbench'])await test(route+'-double-click-one-write',async record=>{const f=fixture(route),d=deferred();await f.page.load(true);f.use(async(n,a)=>a==='create'||a==='referralPoster'?d.promise:a==='earnings'?earnings('a'):posterRead(n,a));const action=()=>route==='earnings'?f.page.createPayout():f.page.saveReferralPoster();const op=action();await flush();await action();d.resolve(route==='earnings'?{state:'created'}:{tempFileURL:'https://synthetic.invalid/image'});await op;await flush();const count=f.env.requests.filter(r=>r[1]===(route==='earnings'?'create':'referralPoster')).length;record({count});assert.equal(count,1);});
 await test('poster-pagination-does-not-strand-save',async record=>{const f=fixture('workbench');await f.page.load();f.page.data.hasMore=true;let download;f.env.wx.downloadFile=o=>{download=o;};f.use(posterRead);await f.page.saveReferralPoster();await f.page.more();download.success({statusCode:200,tempFilePath:'synthetic-image'});await flush();record({busy:f.page.data.savingPoster,...f.events});assert.equal(f.events.saves,1);assert.equal(f.page.data.savingPoster,false);});
 console.log(JSON.stringify({scope:'actual pages; all financial, download and album actions intercepted; no real transfer or files',pass:results.filter(x=>x.pass).length,fail:results.filter(x=>!x.pass).length,results},null,2));
 if(results.some(x=>!x.pass))process.exitCode=1;
})();
