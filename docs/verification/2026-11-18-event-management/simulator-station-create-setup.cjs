// Replace only an explicitly named disposable tourist fixture.
const fs = require('node:fs'), path = require('node:path');
const project = process.argv[2];
if (!project || !path.basename(project).startsWith('jinlin-qa')) throw Error('Expected QA fixture');
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Tourist only');
for (const dir of ['station/create', 'utils', 'components/privacy-popup', 'assets/icons']) fs.mkdirSync(path.join(project, dir), { recursive: true });
fs.cpSync('miniprogram/components/privacy-popup', path.join(project, 'components/privacy-popup'), { recursive: true });
for (const file of ['app.wxss', 'utils/privacy.js', 'assets/icons/express.png']) fs.copyFileSync('miniprogram/' + file, path.join(project, file));
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ pages: ['station/create/create'], window: JSON.parse(fs.readFileSync('miniprogram/app.json')).window }));
fs.writeFileSync(path.join(project, 'app.js'), `
const user={_id:'qa133-station',roles:['station'],stationCommunityId:'qa133-community',stationCode:'qa133-A'};
App({globalData:{user},async ensureSession(){return this.globalData.user;}});
wx.setStorageSync('station-creation:'+encodeURIComponent(JSON.stringify([user._id,user.stationCommunityId,user.stationCode])),{requestId:'qa133_sim_original'});
wx.showToast=()=>{};
`);
fs.writeFileSync(path.join(project, 'utils/api.js'), `
exports.records=[];exports.calls=[];exports.fail=true;exports.found=true;
exports.call=async(name,action,input)=>{
 if(name!=='station')throw Error('禁止真实接口');exports.calls.push({action,requestId:input.requestId});
 if(action==='lookupBatchCreation'){if(exports.fail)throw Error('合成查询失败，请重新核对');return exports.found?{batchId:'qa133-synthetic-batch',eligibleCount:1,skippedCount:0}:{batchId:null};}
 if(action==='createBatch'){exports.found=true;throw Error('合成创建响应丢失');}
 throw Error('禁止真实接口');
};
exports.save=(page,phase)=>{const width=wx.getWindowInfo().windowWidth;exports.records.push({phase,width,ready:page.data.ready,recovery:page.data.recovery,error:page.data.error,batchId:page.data.result?.batchId||null});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa133-'+width+'.json',JSON.stringify({records:exports.records,calls:exports.calls}),'utf8');page.setData({qaSummary:width+'宽 / '+page.data.recovery});};
`);
for (const ext of ['json', 'wxss', 'wxml']) fs.copyFileSync('miniprogram/station/create/create.' + ext, path.join(project, 'station/create/create.' + ext));
let js = fs.readFileSync('miniprogram/station/create/create.js', 'utf8').replace('Page({', 'const definition={').replace(/\}\);\s*$/, '};');
js += `
for(const name of ['load','create']){const original=definition[name];definition[name]=async function(...args){await original.apply(this,args);api.save(this,name);};}
definition.qaRetryReady=function(){api.fail=false;};
definition.qaMissing=async function(){api.fail=false;api.found=false;wx.setStorageSync(this.storageKey,{requestId:'qa133_sim_retry'});await this.load();this.change({detail:{value:'合成楼-1单元-101'}});};
Page(definition);`;
fs.writeFileSync(path.join(project, 'station/create/create.js'), js);
const wxml = path.join(project, 'station/create/create.wxml');
fs.writeFileSync(wxml, '<view class="page"><view>仅合成测试，无真实批次 {{qaSummary}}</view><button bindtap="qaRetryReady">恢复合成查询接口</button><button bindtap="qaMissing">准备未查到原批次</button></view>' + fs.readFileSync(wxml, 'utf8'));
console.log('Prepared QA133 synthetic fixture');
