// Disposable tourist project; real templates/controllers, synthetic identity/secret only.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
fs.mkdirSync(path.join(project,'pet'),{recursive:true});
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['pet/work','provider/task/task'],window:{navigationBarTitleText:'门锁身份保护联调'}}));
fs.writeFileSync(path.join(project,'app.js'),`App({globalData:{user:{_id:'synthetic-a'}},async ensureSession(){return this.globalData.user}})`);
for(const name of ['entry-display','money','time'])fs.copyFileSync('miniprogram/utils/'+name+'.js',path.join(project,'utils/'+name+'.js'));
fs.writeFileSync(path.join(project,'probe/qa121-api.js'),`
exports.reads=[];exports.pending=null;exports.delay=false;exports.records=[];
exports.call=async(n,a,d)=>{
 if(a==='listVisits')return{list:[{_id:'synthetic-visit',date:'合成服务日',seq:1,status:'pending'}],status:'in_service',entryMode:'password'};
 if(a==='detail')return{serviceCode:'vacant',serviceName:'空置房巡检',status:'delivered',statusText:'合成任务',featureEnabled:true,canShareLocation:false,address:{buildingName:'合成楼栋',unit:'',room:''},detail:{entry:'password'},pricing:{},slot:{date:'2026-11-19',start:'07:00',end:'09:00'},userPhone:'合成隐藏号码',note:'本地验证，不会读取真实密码'};
 if(a!=='revealEntry')throw Error('Blocked business operation '+a);
 exports.reads.push({orderId:d.orderId,user:getApp().globalData.user._id});
 if(exports.delay){exports.delay=false;return new Promise(resolve=>exports.pending=resolve);}
 return{entry:'合成示例-非真实密码'};
};
exports.save=function(p,phase){exports.records.push({phase,user:getApp().globalData.user._id,orderId:p.orderId,hasSecret:!!p.data.entryPassword,error:p.data.error,reading:p.data.readingEntry,context:p.taskContext});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa121-'+p.qaKind+'-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,reads:exports.reads,records:exports.records}),'utf8');};`);
for(const [name,kind,depth] of [['pet/work','pet','..'],['provider/task/task','vacant','../..']]){
 for(const ext of ['js','json','wxml','wxss'])fs.copyFileSync('miniprogram/'+name+'.'+ext,path.join(project,name+'.'+ext));
 let source=fs.readFileSync(path.join(project,name+'.js'),'utf8').replace(`require('${depth}/utils/api')`,`require('${depth}/probe/qa121-api')`).replace(`require('${depth}/utils/media')`,`({uploadPhotos:async()=>{throw Error('No upload')},uploadVideo:async()=>{throw Error('No upload')}})`).replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
 source+=`
const originalLoad=definition.onLoad;definition.onLoad=function(){this.qaKind='${kind}';originalLoad.call(this,{id:'synthetic-order-a'});};
const originalReveal=definition.${kind==='pet'?'reveal':'revealEntry'};definition.${kind==='pet'?'reveal':'revealEntry'}=async function(e){await originalReveal.call(this,e);api.save(this,'explicit-reveal');};
definition.qaChange=async function(e){this.closeSecret();api.delay=true;const pending=originalReveal.call(this,{currentTarget:{dataset:{id:'synthetic-visit'}}});if(!api.pending)throw Error('Expected synthetic read');if(e.currentTarget.dataset.kind==='user')getApp().globalData.user={_id:getApp().globalData.user._id==='synthetic-a'?'synthetic-b':'synthetic-a'};else this.orderId=this.orderId==='synthetic-order-a'?'synthetic-order-b':'synthetic-order-a';api.pending({entry:'合成过期值不应显示'});api.pending=null;await pending;api.save(this,'stale-'+e.currentTarget.dataset.kind);this.setData({qaResult:'旧结果已丢弃，请主动查看新任务密码'});};
Page(definition);`;
 fs.writeFileSync(path.join(project,name+'.js'),source);
 const mark=path.join(project,name+'.wxml');fs.writeFileSync(mark,`<view class="page"><view>仅本地合成验证</view><button data-kind="user" bindtap="qaChange">模拟读取中换人</button><button data-kind="order" bindtap="qaChange">模拟读取中换任务</button><view>{{qaResult}}</view><navigator url="/${kind==='pet'?'provider/task/task':'pet/work'}">切换另一测试页</navigator></view>`+fs.readFileSync(mark,'utf8'));
}
console.log('QA121 tourist fixtures ready: actual pages, synthetic secret and identity, all business writes blocked');
