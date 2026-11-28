// Run from the repository root. Local database and content-check doubles only.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.cwd();
const {
  fixture
} = require(path.join(root, 'docs/verification/2026-11-09-remediation/cloud-fixture.cjs'));
const {
  runtime
} = require(path.join(root, 'docs/verification/2026-11-09-remediation/page-fixture.cjs'));
function setup(failure, role) {
  const db = fixture({
    local: true,
    roles: [role],
    allowWrites: true,
    securityResult: {
      result: {
        suggest: 'pass'
      }
    }
  });
  db.data.users[0].merchantId = 'synthetic-merchant';
  db.data.communities[0].dutyWindows = [{
    start: '07:00',
    end: '21:00'
  }];
  let fired = false;
  const env = runtime(async (name, action, input) => {
    if (!fired && failure === 'before-publish' && action === 'publish') {
      fired = true;
      throw Error('合成发布请求未送达');
    }
    const r = await db.call(name, action, input);
    if (!r.ok) throw Error(r.message);
    if (!fired && (failure === 'after-create' && action === 'create' || failure === 'after-publish' && action === 'publish')) {
      fired = true;
      throw Error('合成响应丢失');
    }
    return r.data;
  });
  env.app.globalData.user = db.data.users[0];
  const page = env.instance('miniprogram/events/manage/manage.js');
  const future = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  page.setData({
    title: '合成活动创建重试',
    desc: '仅隔离数据库验证',
    location: '测试地点',
    type: 'interest',
    fee: '0',
    capacity: '1',
    startDate: future,
    endDate: future,
    deadlineDate: future,
    deadlineTime: '09:00',
    startTime: '10:00',
    endTime: '11:00'
  });
  if (process.env.QA109_SPONSOR) page.setData({
    sponsorName: '合成赞助方',
    sponsorAmount: '5'
  });
  return {
    db,
    env,
    page
  };
}
if (require.main === module) (async () => {
  const results = [];
  for (const role of process.env.QA109_SPONSOR ? ['admin'] : ['admin', 'property', 'merchant']) for (const failure of ['none', 'after-create', 'before-publish', 'after-publish']) {
    const s = setup(failure, role);
    await s.page.onShow();
    assert.equal(s.page.data.ready, true, s.page.data.error);
    await s.page.createActivity();
    const first = s.db.data.events.map(e => ({
      id: e._id,
      status: e.status
    }));
    if (failure !== 'none') await s.page.createActivity();
    results.push({
      role,
      failure,
      firstCount: first.length,
      firstStatuses: first.map(e => e.status),
      finalCount: s.db.data.events.length,
      finalStatuses: s.db.data.events.map(e => e.status),
      reviewRequested: s.db.data.events.map(e => !!e.reviewRequestedAt),
      ledgerCount: (s.db.data.ledger || []).length,
      ledgerAmounts: (s.db.data.ledger || []).map(e => e.amounts.platform),
      createCalls: s.env.requests.filter(r => r[1] === 'create').length,
      error: s.page.data.error
    });
  }
  console.log(JSON.stringify(results, null, 2));
  assert.equal(results[0].finalCount, 1);
  const unmet = results.filter(row => row.finalCount !== 1 ||
    row.finalStatuses[0] !== (row.role === 'admin' ? 'published' : 'draft') ||
    row.role !== 'admin' && !row.reviewRequested[0] ||
    process.env.QA109_SPONSOR && (row.ledgerCount !== 1 || row.ledgerAmounts[0] !== 500));
  if (unmet.length) {
    console.error('QA109 未通过恢复场景数', unmet.length);
    process.exitCode = 1;
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});

module.exports = { setup };
