// Actual page/template in a disposable tourist project. All dialogs, media and writes are synthetic.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
fs.mkdirSync(path.join(project,'pet'),{recursive:true});
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['pet/work'],window:{navigationBarTitleText:'喂宠履约本地验证'}}));
fs.writeFileSync(path.join(project,'app.js'),`App({globalData:{user:{_id:'synthetic-a'}},async ensureSession(){return this.globalData.user}})`);
fs.copyFileSync('miniprogram/utils/entry-display.js',path.join(project,'utils/entry-display.js'));
fs.writeFileSync(path.join(project,'probe/qa122.js'),`
exports.writes=[];exports.records=[];exports.reads=0;
exports.call=async(n,a,d)=>{if(a==='listVisits'){exports.reads++;return{list:[{_id:'synthetic-visit',date:'合成服务日',seq:1,status:'pending'}],status:'in_service',entryMode:'key_handover'};}if(['markDone','markMissed'].includes(a)){exports.writes.push({action:a,...d,user:getApp().globalData.user._id});return{};}throw Error('Blocked API '+a);};
exports.showModal=o=>{exports.modal=o;exports.page.setData({qaPrompt:'合成漏次确认'});};
exports.showActionSheet=o=>{exports.sheet=o;exports.page.setData({qaPrompt:'合成媒体选择'});};
exports.uploadPhotos=()=>new Promise(resolve=>{exports.media=()=>resolve(['synthetic-photo-a','synthetic-photo-b']);exports.page.setData({qaPrompt:'合成相机等待返回'});});
exports.uploadVideo=()=>new Promise(resolve=>{exports.media=()=>resolve('synthetic-video');exports.page.setData({qaPrompt:'合成相机等待返回'});});
exports.save=(p,phase)=>{const r={phase,user:getApp().globalData.user._id,orderId:p.orderId,busy:p.data.busy,error:p.data.error,writes:exports.writes.length,reads:exports.reads};exports.records.push(r);p.setData({qaCount:exports.writes.length,qaBusy:p.data.busy?'忙碌':'可操作'});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa122-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,records:exports.records}),'utf8');};`);
for(const ext of ['js','json','wxml','wxss'])fs.copyFileSync('miniprogram/pet/work.'+ext,path.join(project,'pet/work.'+ext));
let source=fs.readFileSync(path.join(project,'pet/work.js'),'utf8').replace("require('../utils/api')","require('../probe/qa122')").replace("require('../utils/media')","require('../probe/qa122')").replace('wx.showActionSheet','api.showActionSheet').replace('wx.showModal','api.showModal').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const originalLoad=definition.onLoad;definition.onLoad=function(){api.page=this;originalLoad.call(this,{id:'synthetic-order-a'});};
for(const name of ['done','missed']){const original=definition[name];definition[name]=function(e){const p=original.call(this,e);this.qaPending=p;p.then(()=>api.save(this,name+'-settled'));return p;};}
definition.qaAnswer=async function(e){const kind=e.currentTarget.dataset.kind;if(!api.modal)return;const modal=api.modal;api.modal=null;if(kind==='refresh')await this.load();modal.success({confirm:kind!=='cancel'});await this.qaPending;this.setData({qaPrompt:''});api.save(this,'modal-'+kind);};
definition.qaChoose=function(e){if(!api.sheet)return;const sheet=api.sheet;api.sheet=null;sheet.success({tapIndex:e.currentTarget.dataset.kind==='video'?1:0});};
definition.qaReturn=async function(e){if(!api.media)return;const media=api.media;api.media=null;this.onHide();if(e.currentTarget.dataset.kind==='user')getApp().globalData.user={_id:getApp().globalData.user._id==='synthetic-a'?'synthetic-b':'synthetic-a'};media();await this.qaPending;await this.onShow();this.setData({qaPrompt:''});api.save(this,'media-'+e.currentTarget.dataset.kind);};
Page(definition);`;
fs.writeFileSync(path.join(project,'pet/work.js'),source);
const mark=path.join(project,'pet/work.wxml');fs.writeFileSync(mark,`<view class="page"><view>仅合成验证：写入 {{qaCount || 0}} 次 · {{qaBusy}}</view><view>{{qaPrompt}}</view><view wx:if="{{qaPrompt === '合成漏次确认'}}"><button data-kind="cancel" bindtap="qaAnswer">模拟取消确认</button><button data-kind="refresh" bindtap="qaAnswer">刷新后旧确认</button><button data-kind="same" bindtap="qaAnswer">模拟原页确认</button></view><view wx:if="{{qaPrompt === '合成媒体选择'}}"><button data-kind="photo" bindtap="qaChoose">模拟选择照片</button><button data-kind="video" bindtap="qaChoose">模拟选择视频</button></view><view wx:if="{{qaPrompt === '合成相机等待返回'}}"><button data-kind="same" bindtap="qaReturn">模拟同人相机返回</button><button data-kind="user" bindtap="qaReturn">模拟换人相机返回</button></view></view>`+fs.readFileSync(mark,'utf8'));
console.log('QA122 fixture ready: synthetic dialogs, lifecycle, media and writes; no native camera or cloud.');
