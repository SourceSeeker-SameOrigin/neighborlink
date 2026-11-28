// Actual page, cloud handler and WXML, backed only by synthetic local records.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const folder = 'admin/chat/chat';
const context = { window: { __webview_engine_version__: 0.02 }, console };
const compiler = process.env.WCC || '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc';
vm.runInNewContext(execFileSync(compiler, [folder + '.wxml'], { cwd: 'miniprogram', encoding: 'utf8' }), context);
const render = context.$gwx(folder + '.wxml');
function strings(node) {
  return typeof node === 'string' ? node : (node.children || []).map(strings).join('');
}

const makeMessage = n => ({ _id: 'message-' + String(n).padStart(3,'0'), convId: 'chat-a',
  from: 'fixture-sender', type: 'text', status: 'ok', content: '样本文字' + n, createdAt: new Date(0) });
const sample = Array.from({ length: 54 }, (_, i) => makeMessage(i + 1));
sample[1] = { ...sample[1], type: 'image', content: '', fileId: 'cloud://local/sample-image' };
const cloud = fixture({ roles: ['admin'], local: true, allowWrites: true, records: {
  idleItems: [{ _id: 'listing', communityId: 'c', sellerOpenid: 'seller', status: 'on_sale' }],
  conversations: [{ _id: 'chat-a', communityId: 'c', refId: 'listing', type: 'idle', members: ['buyer','seller'] }],
  messages: sample, reports: [{ _id: 'case-a', targetType: 'message', targetId: sample[53]._id, communityId: 'c', status: 'pending' }]
}});
let gate;
const replies = [];
const env = runtime(async (name, action, data) => {
  if (gate) await gate;
  const r = await cloud.call(name, action, data);
  replies.push(r);
  if (!r.ok) throw Object.assign(Error(r.message), { code: r.code });
  return r.data;
});
env.app.globalData.user = { _id: 'admin', roles: ['admin'], communityId: 'c' };
const page = env.instance('miniprogram/' + folder + '.js');
const view = () => strings(render(page.data));
const checks = [];
function check(label, condition) {
  checks.push({ label, passed: Boolean(condition) });
}
async function main() {
  const queue = env.instance('miniprogram/admin/reports/reports.js');
  queue.setData({ rows: cloud.data.reports });
  queue.openChat({ currentTarget: { dataset: { index: 0 } } });
  const url = new URL(env.navigation[0][1], 'https://local.invalid');
  check('从举报队列进入对应案件', url.pathname === '/' + folder && url.searchParams.get('reportId') === 'case-a');
  page.onLoad(Object.fromEntries(url.searchParams));
  await page.load();
  check('首次读取显示消息及成功提示', view().includes('样本文字1') && view().includes('本次查看已记录审计日志'));
  check('打开案件写一条关联审计', cloud.data.auditLogs?.length === 1 && cloud.data.auditLogs[0].caseId === 'case-a');
  check('首批之外的被举报消息可见', page.data.messages.some(m => m._id === sample[53]._id));
  const first = replies.at(-1).data;
  const second = await cloud.call('chat','adminPull',{caseType:'report',reportId:'case-a',afterId:first.lastId});
  assert.ok(second.ok);
  const all = new Set([...first.list, ...second.data.list].map(m => m._id));
  check('按服务端游标读取共 54 条', all.size === 54 && !second.data.hasMore);
  check('页面可通过操作读到第二页普通消息', page.data.messages.some(m => m._id === sample[50]._id) ||
    (first.hasMore && /加载更多|查看更多|下一页/.test(view())));
  gate = Promise.reject(Object.assign(Error('网络超时'), { code: 'E_NETWORK' }));
  await page.loadMore(); gate = null;
  check('续页网络失败保留 51 条及原游标', page.data.messages.length === 51 && page.data.lastId === first.lastId && view().includes('重试加载更多'));
  const countBeforeRetry = cloud.data.auditLogs.length;
  await Promise.all([page.loadMore(), page.loadMore()]);
  check('续页重试按原位置读全、按顺序去重，重复点击只记一次审计',
    cloud.data.auditLogs.length === countBeforeRetry + 1 && env.requests.at(-1)[2].afterId === first.lastId &&
    page.data.messages.map(m => m._id).join() === sample.map(m => m._id).join() && !page.data.hasMore);
  await page.load();
  page.onHide();
  check('隐藏清除消息、游标与审计成功提示', !page.data.messages.length && !page.data.lastId && !page.data.auditConfirmed);
  await page.onShow();
  check('返回按案件重读首页，恢复时不沿用旧游标', page.data.messages.length === 51 && !env.requests.at(-1)[2].afterId);
  cloud.data.reports[0].status = 'dismissed';
  await page.loadMore();
  check('续页权限失效清除旧正文、游标和更多入口', !!page.data.error && !page.data.messages.length && !page.data.lastId && !page.data.hasMore);
  cloud.data.reports[0].status = 'pending';
  await page.load();
  const auditCount = cloud.data.auditLogs.length;
  cloud.data.reports[0].status = 'dismissed';
  let release;
  gate = new Promise(resolve => { release = resolve; });
  const redo = page.load();
  check('重新核对期间收起旧消息', !view().includes('样本文字'));
  release(); await redo; gate = null;
  check('已驳回案件返回拒绝，审计条数未增加', replies.at(-1).code === 'E_FORBIDDEN' && cloud.data.auditLogs.length === auditCount);
  check('拒绝后显示错误及重试，收起审计成功提示', !!page.data.error && view().includes('重试') && !view().includes('本次查看已记录审计日志'));
  check('拒绝后旧消息从界面消失', !view().includes('样本文字'));
  await page.load();
  check('再次只读重试仍拒绝，审计条数未增加', replies.at(-1).code === 'E_FORBIDDEN' && cloud.data.auditLogs.length === auditCount);
  cloud.data.reports[0].status = 'pending';
  gate = new Promise(resolve => { release = resolve; });
  const late = page.load();
  await new Promise(resolve => setImmediate(resolve));
  page.onHide();
  release(); await late; gate = null;
  check('隐藏后的成功响应不显示正文或审计提示', !page.data.messages.length && !page.data.auditConfirmed);
  await page.onShow();
  check('已授权列表含样本图片', page.data.messages.some(m => m.fileId === sample[1].fileId));
  page.onHide();
  check('隐藏后移除旧图片，原预览按钮事件失效',
    !page.data.messages.some(m => m.fileId) && page.preview({ currentTarget: { dataset: { url: sample[1].fileId } } }) === undefined);
  let reject;
  gate = new Promise((_, fail) => { reject = fail; });
  const oldFailure = page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  gate = null;
  await page.load();
  reject(Error('迟到的拒绝')); await oldFailure;
  check('较旧的失败不覆盖最新授权结果', page.data.auditConfirmed && page.data.messages.length === 51 && !page.data.error);
  gate = new Promise(resolve => { release = resolve; });
  const unloading = page.loadMore();
  await new Promise(resolve => setImmediate(resolve));
  page.onUnload();
  let writes = 0;
  page.setData = () => { writes++; };
  release(); await unloading; gate = null;
  check('卸载后续页响应零回写', writes === 0);
  const blocked = runtime();
  let navigations = 0;
  blocked.wx.switchTab = () => { navigations++; };
  blocked.wx.cloud = { callFunction: async () => ({ result: { ok: false, code: 'E_FORBIDDEN', message: '案件已关闭' } }) };
  const api = blocked.load('miniprogram/utils/api.js');
  const options = { loading: false, silent: true };
  await assert.rejects(api.call('chat', 'adminPull', {}, { ...options, redirectOnForbidden: false }));
  check('审计读取被拒绝可留页重试', navigations === 0);
  await assert.rejects(api.call('chat', 'adminPull', {}, options));
  check('其他调用保留原有拒绝后返回首页规则', navigations === 1);
  console.log(JSON.stringify({passed:checks.filter(x=>x.passed).length,total:checks.length,checks},null,2));
  if (checks.some(x=>!x.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
