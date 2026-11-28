// Disposable tourist project: actual task page; synthetic identity/order/modal/API.
const fs=require('fs'),path=require('path');
const layoutOnly=process.argv.includes('--layout-only');
const nativeModal=process.argv.includes('--native-modal');
if(layoutOnly&&nativeModal)throw Error('Choose one mode');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
for(const folder of ['provider/task','provider/workbench','probe/away','utils'])fs.mkdirSync(path.join(project,folder),{recursive:true});
for(const folder of ['components','templates','styles'])fs.cpSync(path.join('miniprogram',folder),path.join(project,folder),{recursive:true});
fs.copyFileSync('miniprogram/utils/privacy.js',path.join(project,'utils/privacy.js'));
fs.writeFileSync(path.join(project,'utils/media.js'),"exports.uploadPhotos=async()=>{throw Error('本地确认测试禁止上传媒体');};\n");
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['provider/task/task','probe/away/index','provider/workbench/workbench'],window:{navigationBarTitleText:'任务确认联调'}}));
fs.writeFileSync(path.join(project,'app.js'),`App({globalData:{user:{_id:'qa113-provider',roles:['provider']}},async ensureSession(){return this.globalData.user}})`);
for(const ext of ['js','json','wxml','wxss'])fs.copyFileSync('miniprogram/provider/task/task.'+ext,path.join(project,'provider/task/task.'+ext));
for(const name of ['entry-display','money','time'])fs.copyFileSync('miniprogram/utils/'+name+'.js',path.join(project,'utils/'+name+'.js'));
fs.writeFileSync(path.join(project,'probe/qa113-api.js'),`
exports.layoutOnly=${layoutOnly};exports.confirmations=0;exports.writes=0;exports.records=[];
exports.save=function(extra){exports.records.push(extra);wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa113-${layoutOnly ? 'layout-' : ''}'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,confirmations:exports.confirmations,writes:exports.writes,records:exports.records}),'utf8');};
exports.call=async(n,a,d)=>{if(a==='detail')return{_id:'qa113-order',status:'accepted',statusText:'已接单',serviceName:'代扔垃圾',serviceCode:'trash',canShareLocation:false,featureEnabled:true,address:{buildingName:'合成测试楼栋',unit:'合成单元',room:''},userPhone:'已隐藏',detail:{bags:1},pricing:{goodsCap:0},slot:{date:'2026-11-18',start:'07:00',end:'23:59'},note:'本地合成任务，不会履约'};
if(a==='release'){exports.writes++;if(exports.layoutOnly || (${nativeModal} ? exports.writes===1 : exports.confirmations===3))throw Error('放弃任务失败（本地合成）');return{};}throw Error('Unexpected API '+a);};
exports.showModal=o=>{const step=++exports.confirmations;
if(${nativeModal}){return wx.showModal({...o,success(r){exports.save({state:'native-modal',step,confirm:r.confirm,cancel:r.cancel,writes:exports.writes});o.success(r);}});}
if(exports.layoutOnly){setTimeout(()=>o.success({confirm:step===2,cancel:step!==2}),400);return;}
if(step===2){wx.navigateTo({url:'/probe/away/index',success(){setTimeout(()=>{o.success({confirm:true});setTimeout(()=>wx.navigateBack(),300);},100);}});}
else setTimeout(()=>o.success({confirm:step!==1,cancel:step===1}),400);
};`);
for(const [route,text]of[['probe/away/index','已暂时离开，旧确认不得放弃任务'],['provider/workbench/workbench','已返回工作台（合成测试），放弃请求仅本地计数']]){
 fs.writeFileSync(path.join(project,route+'.json'),'{}');fs.writeFileSync(path.join(project,route+'.wxss'),'');fs.writeFileSync(path.join(project,route+'.wxml'),'<view class="page"><view class="card">'+text+'</view></view>');
 fs.writeFileSync(path.join(project,route+'.js'),`const api=require('../../probe/qa113-api');Page({onShow(){api.save({state:'${route}'});}})`);
}
let source=fs.readFileSync(path.join(project,'provider/task/task.js'),'utf8').replace("require('../../utils/api')","require('../../probe/qa113-api')").replace('wx.showModal(', 'api.showModal(').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const measure=p=>new Promise(r=>wx.createSelectorQuery().in(p).select('#qa113-release').fields({rect:true,size:true,properties:['disabled']},r).exec());
const onLoad=definition.onLoad;definition.onLoad=function(){onLoad.call(this,{id:'qa113-order'});};
const onShow=definition.onShow;definition.onShow=async function(){await onShow.call(this);await pause(80);api.save({state:'shown',busy:this.data.busy,ready:this.data.taskReady,error:this.data.error,rect:await measure(this)});};
const release=definition.releaseTask;definition.releaseTask=async function(){const pending=release.call(this);await pause(70);api.save({state:'busy',busy:this.data.busy,rect:await measure(this)});await pending;await pause(100);api.save({state:'settled',visible:this.visible,busy:this.data.busy,error:this.data.error});};
Page(definition);`;
fs.writeFileSync(path.join(project,'provider/task/task.js'),source);
console.log(nativeModal ? 'QA113 native modal: cancel, confirm failure, confirm success; API remains synthetic' : layoutOnly ? 'QA113 layout-only: three actual clicks: cancel, synthetic failure, cancel; navigation remains unverified' : 'QA113 navigation: four actual clicks: cancel, hide/return, synthetic failure, success');

const markup=path.join(project,'provider/task/task.wxml');fs.writeFileSync(markup,fs.readFileSync(markup,'utf8').replace('data-action="release"','id="qa113-release" data-action="release"'));
