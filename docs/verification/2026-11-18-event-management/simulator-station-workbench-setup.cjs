// Explicitly replace a disposable tourist fixture, never a real mini-program project.
const fs = require('node:fs');
const path = require('node:path');
const project = process.argv[2];
if (!project || !path.basename(project).startsWith('jinlin-qa')) throw Error('Expected a named QA fixture');
const config = JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'), 'utf8'));
if (config.appid !== 'touristappid') throw Error('Tourist fixture only');
for (const dir of ['station/workbench', 'utils', 'probe', 'assets/icons', 'components/empty-state', 'components/privacy-popup']) {
  fs.mkdirSync(path.join(project, dir), { recursive: true });
}
for (const dir of ['components/empty-state', 'components/privacy-popup']) {
  fs.cpSync('miniprogram/' + dir, path.join(project, dir), { recursive: true });
}
for (const file of ['app.wxss', 'utils/time.js', 'utils/privacy.js', 'assets/icons/express.png', 'assets/icons/empty.png']) {
  fs.copyFileSync('miniprogram/' + file, path.join(project, file));
}
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({
  pages: ['station/workbench/workbench', 'probe/away'],
  window: JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8')).window
}));
fs.writeFileSync(path.join(project, 'app.js'), `
wx.setClipboardData = options => { const api=require('./utils/api');api.clipboards++;options.success(); };
wx.showModal = options => { const api=require('./utils/api');api.modals++;if(options.success)options.success({confirm:true}); };
App({globalData:{user:{_id:'station-A',roles:['station'],stationCommunityId:'synthetic-community',stationCode:'A'}},async ensureSession(){return this.globalData.user;}});
`);
fs.writeFileSync(path.join(project, 'utils/api.js'), `
exports.fail=false;exports.failNext=true;exports.records=[];exports.offsets=[];exports.exports=0;exports.clipboards=0;exports.modals=0;
exports.save=(p,phase)=>{exports.records.push({phase,width:wx.getWindowInfo().windowWidth,ready:p.data.ready,rows:p.data.batches.length,error:p.data.error,pageError:p.data.pageError,hasMore:p.data.hasMore,exporting:p.data.exporting});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa132-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({records:exports.records,offsets:exports.offsets,exports:exports.exports,clipboards:exports.clipboards,modals:exports.modals}),'utf8');};
exports.call=async(n,a,d)=>{
 if(n!=='station')throw Error('禁止真实云调用');
 if(a==='listMyBatches'){
  exports.offsets.push(d.offset);if(exports.fail)throw Object.assign(Error('合成读取被拒，请重试'),{code:'E_FORBIDDEN'});
  if(d.offset&&exports.failNext){exports.failNext=false;throw Error('合成续页失败，请重试');}
  const rows=Array.from({length:21},(_,i)=>({_id:'合成批次'+(i+1),status:'done',createdAt:'2026-11-25T00:00:00Z',itemCount:2,deliveredCount:2,failedCount:0,skippedCount:0}));
  return {list:rows.slice(d.offset,d.offset+20),hasMore:d.offset+20<rows.length};
 }
 if(a==='exportStatement'){exports.exports++;return{tempFileURL:'https://example.invalid/synthetic.csv',count:21,gross:2100};}
 throw Error('禁止接口 '+a);
};
`);
for (const ext of ['json', 'wxss', 'wxml']) fs.copyFileSync('miniprogram/station/workbench/workbench.' + ext, path.join(project, 'station/workbench/workbench.' + ext));
let js = fs.readFileSync('miniprogram/station/workbench/workbench.js', 'utf8').replace('Page({', 'const definition={').replace(/\}\);\s*$/, '};');
js += `
for(const method of ['load','exportStatement']){const original=definition[method];definition[method]=async function(...args){await original.apply(this,args);api.save(this,method);this.setData({qaSummary:'当前宽度 '+wx.getWindowInfo().windowWidth+'，已读 '+this.data.batches.length+'，合成导出 '+api.exports});};}
definition.qaFail=async function(){api.fail=true;await this.load(true);api.fail=false;};
definition.qaMore=function(){return this.onReachBottom();};
definition.qaLeave=function(){wx.navigateTo({url:'/probe/away'});};
definition.qaTop=function(){wx.pageScrollTo({scrollTop:0,duration:0});};
Page(definition);`;
fs.writeFileSync(path.join(project, 'station/workbench/workbench.js'), js);
const wxml = path.join(project, 'station/workbench/workbench.wxml');
fs.writeFileSync(wxml, '<view class="page"><view>仅本地合成，不复制真实链接</view><view>{{qaSummary}}</view><button bindtap="qaFail">模拟读取被拒</button><button bindtap="qaMore">触发加载下一页</button><button bindtap="qaLeave">离开并返回</button></view>' + fs.readFileSync(wxml, 'utf8') + '<button bindtap="qaTop">回到顶部</button>');
fs.writeFileSync(path.join(project, 'probe/away.js'), 'Page({back(){wx.navigateBack();}});');
fs.writeFileSync(path.join(project, 'probe/away.json'), '{}');
fs.writeFileSync(path.join(project, 'probe/away.wxml'), '<view class="page"><button bindtap="back">返回驿站工作台</button></view>');
console.log('Prepared station fixture: ' + project);
