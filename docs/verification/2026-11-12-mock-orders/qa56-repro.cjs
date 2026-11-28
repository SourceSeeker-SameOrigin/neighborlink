const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
(async()=>{const results=[];
for(const kind of ['merchant','station']){
 const d=deferred();const r=runtime(async(name,action)=>{if(action==='apply')return d.promise;if(action==='myApplication')return kind==='merchant'?{merchant:null}:{application:null};if(action==='applicationOptions')return {list:[{_id:'fixture-community',stations:[{code:'fixture-station'}]}]};throw Error('unexpected '+action)});
 let toast=0,back=0,updates=0; r.wx.showToast=()=>toast++;r.wx.navigateBack=()=>back++;
 r.app.globalData.user.communityId='fixture-community';
 const p=r.instance('miniprogram/'+kind+'/apply/apply.js');await p.load();
 const pending=p.submit();if(p.onHide)p.onHide();if(p.onUnload)p.onUnload();
 const original=p.setData;p.setData=function(x){updates++;return original.call(this,x)};
 const before=r.requests.length;d.resolve({});await pending;
 results.push({kind,scenario:'submit result after leaving',applyCalls:r.requests.filter(x=>x[1]==='apply').length,lateToasts:toast,lateNavigateBack:back,lateSetData:updates,lateApiReads:r.requests.length-before});
}
const u=deferred();const r=runtime(async()=>({merchant:null}),{media:{uploadPhotos:()=>u.promise}});const p=r.instance('miniprogram/merchant/apply/apply.js');await p.load();const pending=p.upload();if(p.onHide)p.onHide();if(p.onUnload)p.onUnload();let writes=0;const orig=p.setData;p.setData=function(v){writes++;return orig.call(this,v)};u.resolve(['synthetic-file']);await pending;results.push({kind:'merchant',scenario:'upload result after leaving',lateSetData:writes,lateFileAssigned:p.data.licenseFileId==='synthetic-file'});
console.log(JSON.stringify({scope:'Isolated actual page code, synthetic API/media only; zero cloud writes',results},null,2));})();
