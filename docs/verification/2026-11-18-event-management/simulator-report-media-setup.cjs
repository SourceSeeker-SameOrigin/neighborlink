// Disposable tourist harness: actual page/components; synthetic API and uploads.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['provider/task/task'],usingComponents:require('../../../miniprogram/app.json').usingComponents,window:{navigationBarTitleText:'任务报告联调'}}));
fs.writeFileSync(path.join(project,'app.js'),`App({globalData:{user:{_id:'synthetic-provider',roles:['provider']}},async ensureSession(){return this.globalData.user}})`);
for(const ext of ['js','json','wxml','wxss'])fs.copyFileSync('miniprogram/provider/task/task.'+ext,path.join(project,'provider/task/task.'+ext));
fs.cpSync('miniprogram/components/private-media',path.join(project,'components/private-media'),{recursive:true});
for(const name of ['entry-display','money','time','media-links'])fs.copyFileSync('miniprogram/utils/'+name+'.js',path.join(project,'utils/'+name+'.js'));
fs.writeFileSync(path.join(project,'probe/qa115-api.js'),`
exports.mode='buy';exports.records=[];exports.writes=[];exports.uploads=[];exports.attempts=0;exports.counts={};exports.done=false;
exports.call=async(n,a,d)=>{await new Promise(r=>setTimeout(r,120));if(a==='detail')return {_id:'synthetic-'+exports.mode,serviceCode:exports.mode,serviceName:exports.mode==='buy'?'代买':'空置房巡检',status:exports.done?'delivered':'in_service',statusText:exports.done?'待确认':'服务中',featureEnabled:true,canShareLocation:false,address:{buildingName:'合成楼栋'},userPhone:'已隐藏',detail:{entry:'key_handover'},pricing:{goodsCap:2000},slot:{date:'2026-11-18',start:'07:00',end:'23:59'},note:'仅本地验收，不会履约'};
if(a!=='recordReport')throw Error('Unexpected API '+a);exports.writes.push({action:a,orderId:d.orderId});if(++exports.attempts===1)throw Error('巡检提交失败（合成），请重试');exports.done=true;return{};};
exports.uploadPhotos=async(folder,count)=>{exports.uploads.push({folder,count});await new Promise(r=>setTimeout(r,700));const attempt=exports.counts[folder]=(exports.counts[folder]||0)+1;if(attempt===1)throw Error('照片上传失败（合成），请重试');return ['/assets/icons/help.png'];};
exports.save=p=>{exports.records.push({mode:exports.mode,status:p.data.order?.status,ready:p.data.taskReady,busy:p.data.busy,uploading:p.data.uploading,error:p.data.error,photos:p.data.photos.length,receipt:!!p.data.receiptPhoto,items:Object.keys(p.data.photoByItem)});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa115-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,uploads:exports.uploads,records:exports.records}),'utf8');};`);
let source=fs.readFileSync(path.join(project,'provider/task/task.js'),'utf8').replace("require('../../utils/api')","require('../../probe/qa115-api')").replace("require('../../utils/media')","require('../../probe/qa115-api')").replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const onLoad=definition.onLoad;definition.onLoad=function(){onLoad.call(this,{id:'synthetic-buy'});};
for(const name of ['load','submitVacantReport','uploadTaskPhoto']){const fn=definition[name];definition[name]=async function(...args){const result=fn.apply(this,args);api.save(this);await result;api.save(this);};}
definition.qaSwitch=async function(){api.mode=api.mode==='buy'?'vacant':'buy';api.done=false;this.orderId='synthetic-'+api.mode;await this.load();};
Page(definition);`;
fs.writeFileSync(path.join(project,'provider/task/task.js'),source);
const markup=path.join(project,'provider/task/task.wxml');fs.writeFileSync(markup,'<view class="page"><button class="ui-button" bindtap="qaSwitch">仅本地：切换代买／巡检</button></view>'+fs.readFileSync(markup,'utf8'));
console.log('QA115/116 tourist only: click upload to fail then retry; switch to vacant, upload a checklist image and submit twice. No real camera/files/cloud.');
