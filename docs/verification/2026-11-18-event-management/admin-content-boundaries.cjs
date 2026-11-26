// Actual P29 page with synthetic identities, ads and notices; no cloud or file writes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const page = 'miniprogram/admin/content/content.js';
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const admin = id => ({ _id: id, roles: ['admin'], communityId: 'c1' });
const click = id => ({ currentTarget: { dataset: { id } } });
function setup(handler) {
  const r = runtime(handler || (async (_name, action, data) => {
    if (action === 'listCommunities') return { list: [{ _id: 'c1', name: '甲' }, { _id: 'c2', name: '乙' }], hasMore: false };
    if (action === 'getCommunity') return { _id: data.communityId };
    if (action === 'listNotices') return { list: [{ _id: 'n1', title: '合成公告' }] };
    if (action === 'listAds') return { list: [{ _id: 'a1', title: '合成广告', price: 100, status: 'live' }] };
    return {};
  }));
  r.app.globalData.user = admin('a');
  const p = r.instance(page);
  return { ...r, p };
}
function prepareForms(p) {
  Object.assign(p.data, { title: '公告', body: '测试正文', endAt: '2027-01-01',
    adTitle: '广告', adImage: 'synthetic-file', adStart: '2027-01-01', adEnd: '2027-01-02', adPrice: '1.00' });
}
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
const count = (r, action) => r.requests.filter(x => x[1] === action).length;

(async () => {
  await check('current admin confirms one ad receipt and reads back', async () => {
    const r = setup(); await r.p.load(); r.wx.showModal = o => o.success({ confirm: true });
    await r.p.confirmAdReceived(click('a1')); assert.equal(count(r, 'markAdReceived'), 1);
    assert.equal(count(r, 'listAds'), 2);
  });
  await check('cancelled receipt confirmation sends no write', async () => {
    const r = setup(); await r.p.load(); r.wx.showModal = o => o.success({ confirm: false });
    await r.p.confirmAdReceived(click('a1')); assert.equal(count(r, 'markAdReceived'), 0);
    assert.equal(r.p.data.saving, false);
  });
  await check('failed receipt dialog releases busy state', async () => {
    const r = setup(); await r.p.load(); r.wx.showModal = () => { throw Error('dialog unavailable'); };
    await r.p.confirmAdReceived(click('a1'));
    assert.equal(count(r, 'markAdReceived'), 0);
    assert.equal(r.p.data.saving, false);
    assert.equal(r.p.data.error, '确认窗口未能打开，请重试');
  });
  await check('another admin cannot confirm old receipt modal', async () => {
    const r = setup(); await r.p.load(); let answer; r.wx.showModal = o => { answer = () => o.success({ confirm: true }); };
    const pending = r.p.confirmAdReceived(click('a1')); r.app.globalData.user = admin('b'); answer(); await pending;
    assert.equal(count(r, 'markAdReceived'), 0); assert.equal(r.p.data.authorized, false);
  });
  await check('hidden page cannot confirm old receipt modal', async () => {
    const r = setup(); await r.p.load(); let answer; r.wx.showModal = o => { answer = () => o.success({ confirm: true }); };
    const pending = r.p.confirmAdReceived(click('a1')); r.p.onHide(); answer(); await pending;
    assert.equal(count(r, 'markAdReceived'), 0); assert.equal(r.p.data.ads.length, 0);
  });
  await check('reload invalidates old receipt confirmation', async () => {
    const r = setup(); await r.p.load(); let answer; r.wx.showModal = o => { answer = () => o.success({ confirm: true }); };
    const pending = r.p.confirmAdReceived(click('a1')); await r.p.load(); answer(); await pending;
    assert.equal(count(r, 'markAdReceived'), 0);
  });
  await check('double receipt click opens one modal and sends one write', async () => {
    const r = setup(); await r.p.load(); let answer, modalCount = 0;
    r.wx.showModal = o => { modalCount++; answer = () => o.success({ confirm: true }); };
    const first = r.p.confirmAdReceived(click('a1')), second = r.p.confirmAdReceived(click('a1'));
    assert.equal(modalCount, 1); answer(); await Promise.all([first, second]);
    assert.equal(count(r, 'markAdReceived'), 1);
  });
  await check('late receipt response does not reload hidden page', async () => {
    const writing = deferred(); const r = setup(async (_name, action, data) => {
      if (action === 'markAdReceived') return writing.promise;
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices') return { list: [] };
      if (action === 'listAds') return { list: [{ _id: 'a1', price: 100, status: 'live' }] };
      return {};
    });
    await r.p.load(); r.wx.showModal = o => o.success({ confirm: true });
    const pending = r.p.confirmAdReceived(click('a1')); await Promise.resolve(); r.p.onHide();
    writing.resolve({}); await pending; assert.equal(count(r, 'listAds'), 1);
  });
  await check('unknown receipt result blocks retry until readback', async () => {
    const r = setup(async (_name, action, data) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices') return { list: [] };
      if (action === 'listAds') return { list: [{ _id: 'a1', price: 100, status: 'live' }] };
      if (action === 'markAdReceived') throw Error('response lost');
      return {};
    });
    await r.p.load(); r.wx.showModal = o => o.success({ confirm: true });
    await r.p.confirmAdReceived(click('a1')); await r.p.confirmAdReceived(click('a1'));
    assert.equal(count(r, 'markAdReceived'), 1); assert.equal(r.p.data.authorized, false);
  });
  await check('property publishes only own community notice', async () => {
    const r = setup(); r.app.globalData.user = { _id: 'property', roles: ['property'], communityId: 'c2' };
    await r.p.load(); prepareForms(r.p); await r.p.saveNotice();
    assert.equal(count(r, 'saveNotice'), 1);
    assert.equal(r.requests.find(x => x[1] === 'saveNotice')[2].communityId, 'c2');
    assert.equal(count(r, 'listAds'), 0);
  });
  await check('invalid notice date releases busy state without writing', async () => {
    const r = setup(); await r.p.load(); prepareForms(r.p); r.p.data.endAt = 'invalid';
    await r.p.saveNotice();
    assert.equal(count(r, 'saveNotice'), 0);
    assert.equal(r.p.data.saving, false);
    assert.equal(r.p.data.error, '公告有效期不正确');
  });
  await check('another admin cannot save old notice draft', async () => {
    const r = setup(); await r.p.load(); prepareForms(r.p); r.app.globalData.user = admin('b');
    await r.p.saveNotice(); assert.equal(count(r, 'saveNotice'), 0); assert.equal(r.p.data.title, '');
  });
  await check('another admin cannot end old notice', async () => {
    const r = setup(); await r.p.load(); r.app.globalData.user = admin('b');
    await r.p.endNotice(click('n1')); assert.equal(count(r, 'endNotice'), 0);
  });
  await check('another admin cannot save old ad draft', async () => {
    const r = setup(); await r.p.load(); prepareForms(r.p); r.app.globalData.user = admin('b');
    await r.p.saveAd(); assert.equal(count(r, 'saveAd'), 0); assert.equal(r.p.data.adTitle, '');
  });
  await check('another admin cannot end old ad', async () => {
    const r = setup(); await r.p.load(); r.app.globalData.user = admin('b');
    await r.p.endAd(click('a1')); assert.equal(count(r, 'endAd'), 0);
  });
  await check('double notice publish sends once', async () => {
    const writing = deferred(); const r = setup(async (_name, action, data) => {
      if (action === 'saveNotice') return writing.promise;
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices' || action === 'listAds') return { list: [] };
      return {};
    });
    await r.p.load(); prepareForms(r.p); const first = r.p.saveNotice(), second = r.p.saveNotice();
    assert.equal(count(r, 'saveNotice'), 1); writing.resolve({}); await Promise.all([first, second]);
  });
  await check('double ad save sends once', async () => {
    const writing = deferred(); const r = setup(async (_name, action) => {
      if (action === 'saveAd') return writing.promise;
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices' || action === 'listAds') return { list: [] };
      return {};
    });
    await r.p.load(); prepareForms(r.p); const first = r.p.saveAd(), second = r.p.saveAd();
    assert.equal(count(r, 'saveAd'), 1); writing.resolve({}); await Promise.all([first, second]);
  });
  await check('late ad read after hide cannot restore old card', async () => {
    const reading = deferred(); const r = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices') return { list: [] };
      if (action === 'listAds') return reading.promise;
      throw Error(action);
    });
    const pending = r.p.load(); await Promise.resolve(); await Promise.resolve(); r.p.onHide();
    reading.resolve({ list: [{ _id: 'a1' }] }); await pending;
    assert.equal(r.p.data.ads.length, 0); assert.equal(r.p.data.adReady, false);
  });
  await check('ad read failure does not suppress notice management', async () => {
    const r = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'listNotices') return { list: [] };
      if (action === 'listAds') throw Error('synthetic ad failure');
      return {};
    });
    await r.p.load(); assert.equal(r.p.data.noticeReady, true);
    assert.equal(r.p.data.adReady, false); assert.equal(r.p.data.adError, 'synthetic ad failure');
  });
  await check('same admin retains draft when switching community', async () => {
    const r = setup(); await r.p.load(); r.p.data.title = '本人草稿';
    await r.p.chooseCommunity({ detail: { value: '1' } });
    assert.equal(r.p.data.title, '本人草稿'); assert.equal(r.p.data.communityId, 'c2');
    assert.equal(r.p.data.noticeReady, true);
  });
  const report = { scope: 'Actual P29 page with synthetic identities and intercepted actions; no cloud or file writes',
    total: results.length, passed: results.filter(x => x.pass).length, cases: results };
  if (process.env.QA144_SAVE === '1') fs.writeFileSync('docs/verification/2026-11-18-event-management/qa144-145-after.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
