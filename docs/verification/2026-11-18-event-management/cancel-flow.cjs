// Run from the repository root. Worker executes only against the synthetic database.
const assert = require('node:assert/strict'),
  path = require('node:path');
const root = process.cwd();
const {
  fixture
} = require(path.join(root, 'docs/verification/2026-11-09-remediation/cloud-fixture.cjs'));
const {
  runtime
} = require(path.join(root, 'docs/verification/2026-11-09-remediation/page-fixture.cjs'));
(async () => {
  const results = [];
  for (const role of ['admin', 'property', 'merchant']) {
    const now = new Date();
    const f = fixture({
      local: true,
      roles: [role],
      allowWrites: true,
      records: {
        events: [{
          _id: 'activity',
          title: '合成取消活动',
          ownerOpenid: 'actor',
          communityIds: ['c'],
          status: 'published',
          fee: 0,
          capacity: 2,
          signupCount: 0,
          reservedCount: 0,
          startAt: new Date(+now + 172800000),
          signupDeadline: new Date(+now + 86400000)
        }]
      }
    });
    f.data.communities[0].dutyWindows = [{
      start: '07:00',
      end: '21:00'
    }];
    for (const id of ['reader-a', 'reader-b']) {
      f.data.users.push({
        _id: id,
        openid: id,
        roles: ['resident'],
        communityId: 'c'
      });
      f.setActor(id);
      const r = await f.call('event', 'signup', {
        eventId: 'activity'
      });
      assert.equal(r.ok, true, r.message);
    }
    f.setActor('actor');
    const env = runtime(async (n, a, d) => {
      const r = await f.call(n, a, d);
      if (!r.ok) throw Error(r.message);
      return r.data;
    });
    env.app.globalData.user = f.data.users[0];
    const page = env.instance('miniprogram/events/manage/manage.js');
    await page.onShow();
    assert.equal(page.data.ready, true, page.data.error);
    const tap = {
      currentTarget: {
        dataset: {
          id: 'activity'
        }
      }
    };
    await page.cancel(tap);
    assert.equal(page.data.error, '');
    assert.equal(page.data.list[0].status, 'cancelled');
    await page.cancel(tap);
    assert.equal(f.data.eventCancelJobs.length, 1);
    assert.equal(f.data.eventCancelJobs[0].totalCount, 2);
    const worker = f.load('cloudfunctions/_shared/eventCancellation.js').createEventCancellationWorker({
      db: f.db,
      command: f.db.command,
      get: async (t, id) => (await f.db.collection(t).doc(id).get()).data
    }, {});
    await worker.run(now);
    await worker.run(now);
    await page.load();
    assert.equal(f.data.events[0].signupCount, 0);
    assert.equal(f.data.signups.filter(s => s.status === 'cancelled').length, 2);
    assert.equal(page.data.list[0].cancelRefund.status, 'completed');
    assert.equal(page.data.list[0].cancelRefund.completedCount, 2);
    assert.equal((f.data.orders || []).length, 0);
    results.push({
      role,
      jobs: 1,
      cancelledSignups: 2,
      remainingSignupCount: 0,
      jobStatus: 'completed',
      orders: 0
    });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
