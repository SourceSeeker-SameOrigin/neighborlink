// Actual P10 page with a synthetic same-user community change during session refresh.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function main() {
  const r = runtime(async () => { throw Error('Unexpected cloud call'); });
  const before = { _id: 'resident', communityId: 'community-a', roles: ['resident'] };
  const after = { ...before, communityId: 'community-b' };
  let finishSession;
  r.app.globalData.user = before;
  r.app.ensureSession = () => new Promise(resolve => { finishSession = resolve; });
  const page = r.instance('miniprogram/pages/me/me.js');
  const loading = page.onShow();
  r.app.globalData.user = after;
  finishSession(before);
  await loading;

  const observed = { loading: page.data.loading, error: page.data.error,
    user: page.data.user, community: page.data.community, cloudCalls: r.requests.length };
  assert.deepEqual(observed, { loading: false, error: '资料已变化，请重新加载', user: null, community: null, cloudCalls: 0 });
  const template = fs.readFileSync(path.join(__dirname, '../../../miniprogram/pages/me/me.wxml'), 'utf8');
  assert.match(template, /wx:if="{{loading}}"/);
  assert.match(template, /wx:elif="{{error}}"/);
  assert.match(template, /wx:elif="{{user}}"/);

  const control = runtime(async (name, action) => {
    if (name === 'chat' && action === 'list') return { unreadTotal: 0 };
    throw Error('Unexpected cloud call');
  });
  control.app.globalData.user = before;
  control.app.globalData.community = { enabledFeatures: {} };
  control.app.ensureSession = async () => before;
  const normalPage = control.instance('miniprogram/pages/me/me.js');
  await normalPage.onShow();
  assert.equal(normalPage.data.loading, false);
  assert.equal(normalPage.data.user?._id, before._id);
  console.log(JSON.stringify({ scope: 'P10 actual page; synthetic same-user community change; no cloud writes',
    observed, control: { userId: normalPage.data.user._id, cloudCalls: control.requests.length } }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
