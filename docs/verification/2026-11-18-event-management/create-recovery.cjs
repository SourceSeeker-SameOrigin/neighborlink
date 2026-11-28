// Actual page and cloud entrypoints, synthetic users/database only. No network.
const assert = require('node:assert/strict');
const {
  setup
} = require('./create-retry.cjs');
const results = [];
const ok = r => {
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return {
    promise,
    resolve,
    reject
  };
};
async function test(name, run) {
  await run();
  results.push({
    name,
    pass: true
  });
}
(async () => {
  for (const role of ['admin', 'property', 'merchant']) {
    for (const failure of ['after-create', 'before-publish', 'after-publish']) await test(role + ' / reload / ' + failure, async () => {
      const s = setup(failure, role);
      await s.page.onShow();
      await s.page.createActivity();
      s.page.onUnload();
      const page = s.env.instance('miniprogram/events/manage/manage.js');
      await page.onShow();
      assert.equal((s.db.data.events || []).length, 1);
      assert.equal(page.data.recovery, failure === 'after-publish' ? 'done' : 'submit');
      assert.equal(s.env.requests.filter(r => r[1] === 'publish').length, failure === 'after-create' ? 0 : 1, 'load must not auto publish');
      if (page.data.recovery !== 'done') await page.createActivity();
      assert.equal((s.db.data.events || []).length, 1);
      assert.equal(page.data.recovery, 'done');
      assert.equal(s.env.requests.filter(r => r[1] === 'create').length, 1);
      assert.equal(s.db.data.events[0].status, role === 'admin' ? 'published' : 'draft');
      if (role !== 'admin') assert.ok(s.db.data.events[0].reviewRequestedAt);
    });
    await test(role + ' / duplicate create and publish / sponsor once', async () => {
      const s = setup('none', role);
      await s.page.onShow();
      if (role === 'admin') s.page.setData({
        sponsorName: '合成赞助',
        sponsorAmount: '5'
      });
      const input = {
        ...s.page.creationInput(s.env.app.globalData.user),
        requestId: 'qa109_same_request'
      };
      const a = ok(await s.db.call('event', 'create', input));
      const b = ok(await s.db.call('event', 'create', input));
      assert.equal(a.eventId, b.eventId);
      assert.equal((s.db.data.events || []).length, 1);
      ok(await s.db.call('event', 'publish', {
        eventId: a.eventId
      }));
      ok(await s.db.call('event', 'publish', {
        eventId: a.eventId
      }));
      const c = ok(await s.db.call('event', 'create', input));
      assert.equal(c.eventId, a.eventId);
      assert.equal((s.db.data.ledger || []).length, role === 'admin' ? 1 : 0);
      const changed = await s.db.call('event', 'create', {
        ...input,
        title: '不同活动'
      });
      assert.equal(changed.code, 'E_CONFLICT');
      assert.equal((s.db.data.events || []).length, 1);
      const found = ok(await s.db.call('event', 'lookupCreation', {
        requestId: input.requestId
      }));
      assert.equal(found.eventId, a.eventId);
      assert.deepEqual(Object.keys(found).sort(), ['eventId', 'reviewRequired', 'status']);
    });
  }
  await test('owner isolation and invalid request IDs', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    const input = {
      ...s.page.creationInput(s.env.app.globalData.user),
      requestId: 'qa109_owner_lookup'
    };
    ok(await s.db.call('event', 'create', input));
    s.db.data.users.push({
      ...s.db.data.users[0],
      _id: 'b',
      openid: 'actor-b'
    });
    s.db.setActor('actor-b');
    assert.equal(ok(await s.db.call('event', 'lookupCreation', {
      requestId: input.requestId
    })).eventId, null);
    for (const requestId of ['', {}, 'short', 'bad request!']) assert.equal((await s.db.call('event', 'lookupCreation', {
      requestId
    })).ok, false);
    s.db.data.users[1].roles = ['resident'];
    assert.equal((await s.db.call('event', 'lookupCreation', {
      requestId: input.requestId
    })).code, 'E_FORBIDDEN');
  });
  await test('legacy client and transaction ownership change', async () => {
    const s = setup('none', 'property');
    await s.page.onShow();
    const input = s.page.creationInput(s.env.app.globalData.user);
    ok(await s.db.call('event', 'create', input));
    assert.equal((s.db.data.events || []).length, 1);
    s.db.faults.beforeTransaction = data => {
      data.users[0].communityId = 'another';
    };
    const r = await s.db.call('event', 'create', {
      ...input,
      requestId: 'qa109_changed_owner'
    });
    assert.equal(r.code, 'E_FORBIDDEN');
    assert.equal((s.db.data.events || []).length, 1);
  });
  await test('absent result / lookup failure / explicit retry reuses ID', async () => {
    const s = setup('none', 'admin');
    const original = s.db.call;
    let failCreate = true,
      failLookup = false;
    s.db.call = async (name, action, input) => {
      if (action === 'create' && failCreate) {
        failCreate = false;
        throw Error('合成未送达');
      }
      if (action === 'lookupCreation' && failLookup) throw Error('合成读取失败');
      return original(name, action, input);
    };
    await s.page.onShow();
    await s.page.createActivity();
    const id = s.page.receipt.requestId;
    assert.equal((s.db.data.events || []).length, 0);
    s.page.onUnload();
    const p = s.env.instance('miniprogram/events/manage/manage.js');
    failLookup = true;
    await p.onShow();
    assert.equal(p.data.recovery, 'lookup');
    assert.equal((s.db.data.events || []).length, 0);
    failLookup = false;
    await p.createActivity();
    assert.equal(p.data.recovery, 'confirm');
    assert.equal((s.db.data.events || []).length, 0);
    await p.createActivity();
    assert.equal((s.db.data.events || []).length, 1);
    assert.equal(p.receipt.requestId, id);
    assert.equal(p.data.recovery, 'done');
    p.newActivity();
    assert.equal(p.receipt, null);
    assert.equal(p.data.title, '');
    assert.equal(Object.keys(s.env.store).length, 0);
  });
  for (const lifecycle of ['onHide', 'onUnload', 'identity', 'refresh']) await test('late create / ' + lifecycle, async () => {
    const s = setup('none', 'admin');
    const original = s.db.call,
      d = deferred();
    let reached;
    const started = new Promise(r => reached = r);
    s.db.call = async (name, action, input) => {
      const r = await original(name, action, input);
      if (action === 'create') {
        reached();
        await d.promise;
      }
      return r;
    };
    await s.page.onShow();
    const task = s.page.createActivity();
    await started;
    if (lifecycle === 'identity') {
      const b = {
        ...s.db.data.users[0],
        _id: 'b',
        openid: 'actor-b'
      };
      s.db.data.users.push(b);
      s.db.setActor('actor-b');
      s.env.app.globalData.user = b;
    } else if (lifecycle === 'refresh') await s.page.load();else s.page[lifecycle]();
    d.resolve();
    await task;
    assert.equal(s.env.requests.filter(r => r[1] === 'publish').length, 0);
    assert.equal((s.db.data.events || []).length, 1);
    if (lifecycle === 'identity') {
      assert.equal(s.page.data.title, '');
      assert.equal(s.page.receipt, null);
    } else {
      await s.page.onShow();
      assert.equal(s.page.data.recovery, 'submit');
      await s.page.createActivity();
      assert.equal((s.db.data.events || []).length, 1);
    }
  });
  await test('storage unavailable / no request sent', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    s.env.wx.setStorageSync = () => {
      throw Error('合成存储失败');
    };
    await s.page.createActivity();
    assert.equal((s.db.data.events || []).length, 0);
    assert.equal(s.page.data.title, '合成活动创建重试');
  });
  await test('double click / one create', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    await Promise.all([s.page.createActivity(), s.page.createActivity()]);
    assert.equal((s.db.data.events || []).length, 1);
    assert.equal(s.env.requests.filter(r => r[1] === 'create').length, 1);
  });
  await test('transaction conflict then retry / one activity and ledger', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    s.page.setData({
      sponsorName: '合成赞助',
      sponsorAmount: '5'
    });
    const input = {
      ...s.page.creationInput(s.env.app.globalData.user),
      requestId: 'qa109_conflict_retry'
    };
    const run = s.db.db.runTransaction;
    let once = true;
    s.db.db.runTransaction = async work => {
      if (once) {
        once = false;
        throw Object.assign(Error('conflict'), {
          code: 'DATABASE_TRANSACTION_CONFLICT'
        });
      }
      return run(work);
    };
    assert.equal((await s.db.call('event', 'create', input)).code, 'E_CONFLICT');
    assert.equal((s.db.data.events || []).length, 0);
    ok(await s.db.call('event', 'create', input));
    ok(await s.db.call('event', 'create', input));
    assert.equal(s.db.data.events.length, 1);
    assert.equal(s.db.data.ledger.length, 1);
  });
  await test('sponsor write fails / event transaction rolls back', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    s.page.setData({
      sponsorName: '合成赞助',
      sponsorAmount: '5'
    });
    const input = {
      ...s.page.creationInput(s.env.app.globalData.user),
      requestId: 'qa109_ledger_rollback'
    };
    const collection = s.db.db.collection;
    let once = true;
    s.db.db.collection = table => {
      const c = collection(table);
      if (table === 'ledger') {
        const doc = c.doc;
        c.doc = id => {
          const d = doc(id),
            set = d.set;
          d.set = async v => {
            if (once) {
              once = false;
              throw Error('合成账本失败');
            }
            return set(v);
          };
          return d;
        };
      }
      return c;
    };
    assert.equal((await s.db.call('event', 'create', input)).ok, false);
    assert.equal((s.db.data.events || []).length, 0);
    ok(await s.db.call('event', 'create', input));
    assert.equal(s.db.data.events.length, 1);
    assert.equal(s.db.data.ledger.length, 1);
  });
  for (const failure of [false, true]) await test('late publish after hide / ' + (failure ? 'lost response' : 'success'), async () => {
    const s = setup('none', 'admin'),
      original = s.db.call,
      d = deferred();
    let reached;
    const started = new Promise(r => reached = r);
    s.db.call = async (n, a, i) => {
      const r = await original(n, a, i);
      if (a === 'publish') {
        reached();
        await d.promise;
        if (failure) throw Error('合成迟到错误');
      }
      return r;
    };
    await s.page.onShow();
    const t = s.page.createActivity();
    await started;
    s.page.onHide();
    const before = JSON.stringify(s.page.data);
    d.resolve();
    await t;
    assert.equal(JSON.stringify(s.page.data), before);
    await s.page.onShow();
    assert.equal(s.page.data.recovery, 'done');
    assert.equal(s.db.data.events.length, 1);
  });
  await test('stored draft survives absent result and edits retain request ID', async () => {
    const s = setup('none', 'admin');
    await s.page.onShow();
    const input = s.page.creationInput(s.env.app.globalData.user);
    s.env.store[s.page.storageKey] = {
      requestId: 'qa109_edit_missing',
      input,
      form: {
        title: '原活动',
        desc: '原说明',
        location: '原地点',
        startDate: s.page.data.startDate,
        endDate: s.page.data.endDate,
        deadlineDate: s.page.data.deadlineDate
      }
    };
    await s.page.load();
    assert.equal(s.page.data.recovery, 'confirm');
    s.page.input({
      currentTarget: {
        dataset: {
          field: 'title'
        }
      },
      detail: {
        value: '修正后的原活动'
      }
    });
    await s.page.createActivity();
    assert.equal(s.page.receipt.requestId, 'qa109_edit_missing');
    assert.equal(s.db.data.events[0].title, '修正后的原活动');
  });
  await test('review rejected / original activity can be resubmitted', async () => {
    const s = setup('none', 'property'); await s.page.onShow(); await s.page.createActivity();
    const item = s.db.data.events[0];
    item.reviewRequestedAt = new Date(Date.now() - 20000); item.reviewedAt = new Date(Date.now() - 10000);
    item.reviewNote = '合成驳回';
    await s.page.load(); assert.equal(s.page.data.recovery, 'submit');
    await s.page.createActivity(); assert.equal(s.page.data.recovery, 'done');
    assert.equal(s.db.data.events.length, 1); assert.ok(item.reviewRequestedAt > item.reviewedAt);
  });
  console.log(JSON.stringify({
    passed: results.length,
    results
  }, null, 2));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
