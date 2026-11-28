// Diagnostic only: actual page code, synthetic identities, no network or business writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const PAGE = 'miniprogram/merchant/workbench/workbench.js';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const merchant = id => ({ _id: id, name: `合成商家${id}`, status: 'approved' });
function setup() {
  const pending = [];
  const env = runtime(async () => { const d = deferred(); pending.push(d); return d.promise; });
  const page = env.instance(PAGE);
  // Start in a visible page, as after the framework's onShow callback.
  page.visible = true;
  const writes = [];
  const setData = page.setData.bind(page);
  page.setData = patch => { writes.push(patch); setData(patch); };
  return { env, page, pending, writes };
}
async function run() {
  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  }
  await check('正常成功读取已通过商家', async () => {
    const s = setup(); const job = s.page.load(); await tick();
    s.pending[0].resolve({ merchant: merchant('A') }); await job;
    assert.equal(s.page.data.merchant._id, 'A');
    assert.equal(s.page.data.loading, false); assert.equal(s.page.data.error, '');
  });
  await check('成功无申请保留明确空结果', async () => {
    const s = setup(); const job = s.page.load(); await tick();
    s.pending[0].resolve({ merchant: null }); await job;
    assert.equal(s.page.data.merchant, null); assert.equal(s.page.data.error, '');
    assert.equal(s.page.data.loading, false);
  });
  await check('读取失败阻止业务内容显示的状态条件', async () => {
    const s = setup(); s.page.data.merchant = merchant('A');
    const job = s.page.load(); await tick();
    s.pending[0].reject(Error('合成读取被拒')); await job;
    // Existing WXML displays business content only when !loading && !error.
    assert.equal(s.page.data.error, '合成读取被拒');
    assert.equal(!s.page.data.loading && !s.page.data.error, false);
  });
  await check('旧成功不得覆盖较新成功', async () => {
    const s = setup(); const first = s.page.load(); await tick();
    const second = s.page.load(); await tick();
    s.pending[1].resolve({ merchant: merchant('B') }); await second;
    s.pending[0].resolve({ merchant: merchant('A') }); await first;
    assert.equal(s.page.data.merchant._id, 'B');
  });
  await check('旧失败不得覆盖较新成功', async () => {
    const s = setup(); const first = s.page.load(); await tick();
    const second = s.page.load(); await tick();
    s.pending[1].resolve({ merchant: merchant('B') }); await second;
    s.pending[0].reject(Error('旧请求错误')); await first;
    assert.equal(s.page.data.error, '');
  });
  await check('旧请求完成不得提前结束新请求加载', async () => {
    const s = setup(); const first = s.page.load(); await tick();
    const second = s.page.load(); await tick();
    s.pending[0].resolve({ merchant: merchant('A') }); await first;
    const loadingDuringNewRead = s.page.data.loading;
    s.pending[1].resolve({ merchant: merchant('B') }); await second;
    assert.equal(loadingDuringNewRead, true);
  });
  for (const lifecycle of ['onHide', 'onUnload']) {
    for (const outcome of ['success', 'error']) {
      await check(`${lifecycle}后的${outcome}不得写回界面`, async () => {
        const s = setup(); const job = s.page.load(); await tick();
        s.page[lifecycle]?.(); const before = s.writes.length;
        if (outcome === 'success') s.pending[0].resolve({ merchant: merchant('A') });
        else s.pending[0].reject(Error('迟到错误'));
        await job;
        assert.equal(s.writes.length - before, 0);
      });
    }
  }
  await check('身份改变后旧商家结果不得回填', async () => {
    const s = setup(); const job = s.page.load(); await tick();
    s.env.app.globalData.user = { _id: 'fixture-B', roles: ['resident'] };
    s.pending[0].resolve({ merchant: merchant('A') }); await job;
    assert.equal(s.page.data.merchant?._id === 'A', false);
  });
  await check('身份初始化期间隐藏不得继续读取商家', async () => {
    const s = setup(); const session = deferred();
    s.env.app.ensureSession = () => session.promise;
    const job = s.page.load(); s.page.onHide?.();
    session.resolve(s.env.app.globalData.user); await tick();
    const requests = s.env.requests.length;
    for (const d of s.pending) d.resolve({ merchant: null });
    await job; assert.equal(requests, 0);
  });
  await check('返回重新读取且旧离页请求不覆盖新结果', async () => {
    const s = setup(); const old = s.page.onShow(); await tick();
    s.page.onHide(); const current = s.page.onShow(); await tick();
    s.pending[1].resolve({ merchant: merchant('B') }); await current;
    s.pending[0].resolve({ merchant: merchant('A') }); await old;
    assert.equal(s.page.data.merchant._id, 'B');
    assert.equal(s.page.data.loading, false); assert.equal(s.env.requests.length, 2);
  });
  await check('失败重试期间隐藏旧资料且成功后恢复', async () => {
    const s = setup(); s.page.data.merchant = merchant('A');
    const failed = s.page.load(); await tick();
    s.pending[0].reject(Error('合成拒绝')); await failed;
    const retry = s.page.load(); await tick();
    assert.equal(s.page.data.loading, true); assert.equal(s.page.data.merchant._id, 'A');
    s.pending[1].resolve({ merchant: merchant('B') }); await retry;
    assert.equal(s.page.data.merchant._id, 'B'); assert.equal(s.page.data.error, '');
    assert.equal(s.page.data.loading, false);
  });
  await check('已隐藏页面直接重试不发读取', async () => {
    const s = setup(); s.page.onHide(); const before = s.writes.length;
    await s.page.load(); assert.equal(s.env.requests.length, 0);
    assert.equal(s.writes.length, before);
  });
  await check('首次身份初始化成功后正常读取', async () => {
    const s = setup(); s.env.app.globalData.user = null;
    s.env.app.ensureSession = async () => {
      s.env.app.globalData.user = { _id: 'fixture-new' }; return s.env.app.globalData.user;
    };
    const job = s.page.onShow(); await tick();
    s.pending[0].resolve({ merchant: merchant('new') }); await job;
    assert.equal(s.page.data.merchant._id, 'new'); assert.equal(s.page.data.loading, false);
  });
  await check('身份初始化失败显示错误且不发商家请求', async () => {
    const s = setup(); s.env.app.ensureSession = async () => { throw Error('合成登录失败'); };
    await s.page.onShow(); assert.equal(s.env.requests.length, 0);
    assert.equal(s.page.data.error, '合成登录失败'); assert.equal(s.page.data.loading, false);
  });
  await check('缺少本人编号不得读取或展示申请结果', async () => {
    const s = setup(); s.env.app.globalData.user = null;
    s.env.app.ensureSession = async () => null;
    await s.page.onShow(); assert.equal(s.env.requests.length, 0);
    assert.equal(s.page.data.error, '登录资料暂不可用，请重试');
    assert.equal(s.page.data.loading, false);
  });
  await check('身份初始化期间换人不继续旧读取', async () => {
    const s = setup(); const session = deferred(); const original = s.env.app.globalData.user;
    s.env.app.ensureSession = () => session.promise;
    const job = s.page.onShow(); s.env.app.globalData.user = { _id: 'fixture-B' };
    session.resolve(original); await tick();
    for (const d of s.pending) d.resolve({ merchant: merchant('A') });
    await job; assert.equal(s.env.requests.length, 0);
  });
  await check('换人返回成功无申请不显示原商家', async () => {
    const s = setup(); s.page.data.merchant = merchant('A'); s.page.onHide();
    s.env.app.globalData.user = { _id: 'fixture-B' };
    const job = s.page.onShow(); await tick();
    assert.equal(s.page.data.loading, true);
    s.pending[0].resolve({ merchant: null }); await job;
    assert.equal(s.page.data.merchant, null); assert.equal(s.page.data.loading, false);
  });
  await check('实际API参数禁止旧请求提示或自动导航', async () => {
    const s = setup(); const job = s.page.onShow(); await tick();
    const options = s.env.requests[0][3];
    assert.equal(options.redirectOnForbidden, false); assert.equal(options.isActive(), true);
    s.page.onHide(); assert.equal(options.isActive(), false);
    s.pending[0].reject(Object.assign(Error('合成拒绝'), { code: 'E_FORBIDDEN' }));
    await job; assert.equal(s.env.navigation.length, 0);
  });
  return { page: PAGE, evidence: 'isolated-actual-page-synthetic-api',
    total: results.length, passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length, cloudWrites: 0, results };
}
module.exports = { run };
if (require.main === module) run().then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
