// Actual P30 handlers with synthetic identities and intercepted requests.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const admin = id => ({ _id: id, roles: ['admin'], communityId: 'c1' });
const click = id => ({ currentTarget: { dataset: { id } } });
const reviewEvent = approved => ({ currentTarget: { dataset: { approved: String(approved) } } });
const statusEvent = status => ({ currentTarget: { dataset: { id: 's1', status } } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(status = 'pending', handler) {
  const r = runtime(handler || (async (_name, action) => {
    if (action === 'adminList') return { list: [{ _id: 'm1', status, name: '合成商家' }], hasMore: false };
    if (action === 'adminServices') return { list: [{ _id: 's1', status: 'off', price: 500 }], hasMore: false };
    return {};
  }));
  r.app.globalData.user = admin('A');
  return { ...r, p: r.instance('miniprogram/admin/merchants/merchants.js') };
}
async function ready(r) { await r.p.onShow(); await r.p.inspect(click('m1')); }
const count = (r, action) => r.requests.filter(item => item[1] === action).length;
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
(async () => {
  await check('current admin reviews once and reads back', async () => {
    const r = setup(); await ready(r); r.wx.showModal = o => o.success({ confirm: true, content: '合成说明' });
    await r.p.review(reviewEvent(true));
    assert.equal(count(r, 'review'), 1); assert.equal(count(r, 'adminList'), 2);
  });
  await check('cancelled review sends no write', async () => {
    const r = setup(); await ready(r); r.wx.showModal = o => o.success({ confirm: false });
    await r.p.review(reviewEvent(false)); assert.equal(count(r, 'review'), 0); assert.equal(r.p.data.busy, false);
  });
  await check('other admin cannot confirm old review modal', async () => {
    const r = setup(); await ready(r); let answer;
    r.wx.showModal = o => { answer = () => o.success({ confirm: true, content: '' }); };
    const pending = r.p.review(reviewEvent(true)); r.app.globalData.user = admin('B'); answer(); await pending;
    assert.equal(count(r, 'review'), 0); assert.equal(r.p.data.ready, false);
  });
  await check('hidden page cannot confirm old review modal', async () => {
    const r = setup(); await ready(r); let answer;
    r.wx.showModal = o => { answer = () => o.success({ confirm: true, content: '' }); };
    const pending = r.p.review(reviewEvent(true)); r.p.onHide(); answer(); await pending;
    assert.equal(count(r, 'review'), 0); assert.equal(r.p.data.selected, null);
  });
  await check('old review modal does not clear newer refreshed page', async () => {
    const r = setup(); await ready(r); let answer;
    r.wx.showModal = o => { answer = () => o.success({ confirm: true, content: '' }); };
    const pending = r.p.review(reviewEvent(true)); await r.p.load(true); answer(); await pending;
    assert.equal(count(r, 'review'), 0); assert.equal(r.p.data.ready, true);
    assert.equal(r.p.data.list[0]._id, 'm1');
  });
  await check('double review click opens one modal and writes once', async () => {
    const r = setup(); await ready(r); let answer, opens = 0;
    r.wx.showModal = o => { opens++; answer = () => o.success({ confirm: true, content: '' }); };
    const first = r.p.review(reviewEvent(true)), second = r.p.review(reviewEvent(true));
    assert.equal(opens, 1); answer(); await Promise.all([first, second]); assert.equal(count(r, 'review'), 1);
  });
  await check('failed review dialog releases busy state', async () => {
    const r = setup(); await ready(r); r.wx.showModal = () => { throw Error('dialog unavailable'); };
    await r.p.review(reviewEvent(true)); assert.equal(count(r, 'review'), 0);
    assert.equal(r.p.data.busy, false); assert.equal(r.p.data.error, '审核确认窗口未能打开，请重试');
  });
  await check('unknown review result requires readback before another write', async () => {
    const r = setup('pending', async (_name, action) => {
      if (action === 'adminList') return { list: [{ _id: 'm1', status: 'pending' }], hasMore: false };
      if (action === 'adminServices') return { list: [], hasMore: false };
      if (action === 'review') throw Error('response lost');
    });
    await ready(r); r.wx.showModal = o => o.success({ confirm: true, content: '' });
    await r.p.review(reviewEvent(true)); await r.p.review(reviewEvent(true));
    assert.equal(count(r, 'review'), 1); assert.equal(r.p.data.ready, false);
  });
  await check('current admin changes displayed service status once', async () => {
    const r = setup('approved'); await ready(r); await r.p.serviceStatus(statusEvent('on'));
    assert.equal(count(r, 'setServiceStatus'), 1); assert.equal(count(r, 'adminServices'), 2);
  });
  await check('other admin cannot use old service status button', async () => {
    const r = setup('approved'); await ready(r); r.app.globalData.user = admin('B');
    await r.p.serviceStatus(statusEvent('on'));
    assert.equal(count(r, 'setServiceStatus'), 0); assert.equal(r.p.data.services.length, 0);
  });
  await check('hidden page cannot use old service status button', async () => {
    const r = setup('approved'); await ready(r); r.p.onHide(); await r.p.serviceStatus(statusEvent('on'));
    assert.equal(count(r, 'setServiceStatus'), 0);
  });
  await check('double service status tap sends only one write', async () => {
    const writing = deferred();
    const r = setup('approved', async (_name, action) => {
      if (action === 'adminList') return { list: [{ _id: 'm1', status: 'approved' }], hasMore: false };
      if (action === 'adminServices') return { list: [{ _id: 's1', status: 'off', price: 500 }], hasMore: false };
      if (action === 'setServiceStatus') return writing.promise;
    });
    await ready(r); const first = r.p.serviceStatus(statusEvent('on')), second = r.p.serviceStatus(statusEvent('on'));
    assert.equal(count(r, 'setServiceStatus'), 1); writing.resolve({}); await Promise.all([first, second]);
  });
  await check('late service status result after hide does not read or write page', async () => {
    const writing = deferred();
    const r = setup('approved', async (_name, action) => {
      if (action === 'adminList') return { list: [{ _id: 'm1', status: 'approved' }], hasMore: false };
      if (action === 'adminServices') return { list: [{ _id: 's1', status: 'off', price: 500 }], hasMore: false };
      if (action === 'setServiceStatus') return writing.promise;
    });
    await ready(r); const pending = r.p.serviceStatus(statusEvent('on')); r.p.onHide();
    writing.resolve({}); await pending; assert.equal(count(r, 'adminServices'), 1);
    assert.equal(r.p.data.services.length, 0);
  });
  await check('late service failure after identity change clears old merchant', async () => {
    const writing = deferred();
    const r = setup('approved', async (_name, action) => {
      if (action === 'adminList') return { list: [{ _id: 'm1', status: 'approved' }], hasMore: false };
      if (action === 'adminServices') return { list: [{ _id: 's1', status: 'off', price: 500 }], hasMore: false };
      if (action === 'setServiceStatus') return writing.promise;
    });
    await ready(r); const pending = r.p.serviceStatus(statusEvent('on'));
    r.app.globalData.user = admin('B'); writing.reject(Error('response lost')); await pending;
    assert.equal(r.p.data.list.length, 0); assert.equal(r.p.data.ready, false);
  });
  await check('non-admin identity cannot read or write old merchant data', async () => {
    const r = setup(); await ready(r); r.app.globalData.user = { _id: 'resident', roles: ['resident'] };
    await r.p.review(reviewEvent(true)); assert.equal(count(r, 'review'), 0);
    assert.equal(r.p.data.list.length, 0);
  });
  const report = { scope: 'Actual P30 handlers, synthetic identities and intercepted writes; no cloud changes',
    total: results.length, passed: results.filter(item => item.pass).length, cases: results };
  if (process.env.QA147_SAVE === '1') fs.writeFileSync('docs/verification/2026-11-18-event-management/qa147-after.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
