// Disposable tourist project. Actual task template/page, synthetic API only.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['provider/task/task'],window:{navigationBarTitleText:'任务读取联调'}}));
fs.writeFileSync(path.join(project,'app.js'),`App({globalData:{user:{_id:'synthetic-provider',roles:['provider']}},async ensureSession(){return this.globalData.user}})`);
for(const ext of ['js','json','wxml','wxss'])fs.copyFileSync('miniprogram/provider/task/task.'+ext,path.join(project,'provider/task/task.'+ext));
for(const name of ['entry-display','money','time'])fs.copyFileSync('miniprogram/utils/'+name+'.js',path.join(project,'utils/'+name+'.js'));
fs.writeFileSync(path.join(project,'probe/qa114-api.js'),`
exports.records=[];exports.writes=[];exports.failRead=false;exports.deliverAttempts=0;
const order={_id:'synthetic-order',status:'accepted',statusText:'已接单',serviceName:'代扔垃圾',serviceCode:'trash',canShareLocation:false,featureEnabled:true,address:{buildingName:'合成测试楼栋',unit:'合成单元',room:''},userPhone:'已隐藏',detail:{bags:1},pricing:{goodsCap:0},slot:{date:'2026-11-18',start:'07:00',end:'23:59'},note:'本地合成任务，不会履约'};
exports.call=async(n,a,d)=>{await new Promise(r=>setTimeout(r,120));if(a==='detail'){if(exports.failRead){exports.failRead=false;throw Error('任务读取失败（本地合成），请重试');}return JSON.parse(JSON.stringify(order));}
if(!['start','deliver'].includes(a))throw Error('Unexpected API '+a);
exports.writes.push({action:a,orderId:d.orderId});if(a==='start'){order.status='in_service';order.statusText='服务中';}else if(++exports.deliverAttempts===1)throw Error('完成提交失败（本地合成），请重试');else{order.status='delivered';order.statusText='待确认';}return{};};
exports.save=function(extra){exports.records.push(extra);wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa114-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,records:exports.records}),'utf8');};`);
let source=fs.readFileSync(path.join(project,'provider/task/task.js'),'utf8').replace("require('../../utils/api')","require('../../probe/qa114-api')").replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const capture=async p=>{await pause(120);const rects=await new Promise(r=>wx.createSelectorQuery().in(p).selectAll('.btn').fields({rect:true,size:true,properties:['disabled']},r).exec());api.save({status:p.data.order&&p.data.order.status,ready:p.data.taskReady,loading:p.data.loading,busy:p.data.busy,error:p.data.error,rects});};
const onLoad=definition.onLoad;definition.onLoad=function(){onLoad.call(this,{id:'synthetic-order'});};
const load=definition.load;definition.load=async function(){await load.call(this);await capture(this);};
const act=definition.act;definition.act=async function(e){await act.call(this,e);await capture(this);};
definition.qa114ReadFailure=async function(){api.failRead=true;await this.load();};
Page(definition);`;
fs.writeFileSync(path.join(project,'provider/task/task.js'),source);
const markup=path.join(project,'provider/task/task.wxml');fs.appendFileSync(markup,'<view class="page"><button class="btn btn-secondary" bindtap="qa114ReadFailure">仅本地：模拟重新读取失败</button></view>');
console.log('QA114 tourist setup: start, read failure, retry, deliver failure, retry; all writes synthetic');
