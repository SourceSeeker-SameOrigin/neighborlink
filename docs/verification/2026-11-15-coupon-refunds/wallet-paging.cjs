// Actual page and cloud entry using synthetic residents. The query double sorts before slicing.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run() {
  const db = fixture({ local: true });
  const now = Date.now();
  const own = Array.from({ length: 101 }, (_, i) => ({
    _id: String(i).padStart(3, '0'), openid: 'actor', templateId: 't',
    createdAt: new Date(now - Math.floor(i / 2) * 1000),
    status: i === 100 ? 'unused' : 'used', validTo: new Date(now + 86400000)
  }));
  db.data.coupons = [...own, { ...own[0], openid: 'neighbor', _id: 'other' }];
  db.data.couponTemplates = [{ _id: 't', name: '合成测试券', kind: 'amount_off', value: 100 }];
  db.data.users.push({ ...db.data.users[0], _id: 'neighbor', openid: 'neighbor' });
  const collection = db.db.collection.bind(db.db);
  db.db.collection = name => {
    const query = collection(name);
    if (name !== 'coupons') return query;
    const keys = [];
    query.orderBy = (key, direction) => { keys.push([key, direction]); return query; };
    const get = query.get;
    query.get = () => {
      db.data.coupons.sort((a, b) => {
        for (const [key, direction] of keys) {
          if (a[key] < b[key]) return direction === 'desc' ? 1 : -1;
          if (a[key] > b[key]) return direction === 'desc' ? -1 : 1;
        }
        return 0;
      });
      return get();
    };
    return query;
  };
  let fail = false, hold;
  const env = runtime(async (name, action, data) => {
    if (fail) { fail = false; throw Error('分页网络失败'); }
    const response = await db.call(name, action, data);
    if (!response.ok) throw Error(response.message);
    if (hold) { const delay = hold; hold = null; await delay; }
    return response.data;
  });
  env.app.globalData.user = db.data.users[0];
  const wallet = env.instance('miniprogram/coupons/mine/mine.js');
  await wallet.onShow();
  assert.equal(wallet.data.list.length, 20);
  assert.equal(wallet.data.list[0]._id, '001'); // Two entries have identical timestamps.
  fail = true;
  await wallet.loadMore();
  assert.match(wallet.data.moreError, /网络/);
  assert.equal(wallet.data.list.length, 20);
  assert.equal(wallet.data.offset, 20);
  const before = env.requests.length;
  await Promise.all([wallet.loadMore(), wallet.loadMore()]);
  assert.equal(env.requests.length, before + 1);
  assert.equal(wallet.data.moreError, '');
  while (wallet.data.hasMore) await wallet.loadMore();
  const ids = wallet.data.list.map(row => row._id);
  assert.equal(ids.length, 101);
  assert.equal(new Set(ids).size, 101);
  assert.equal(wallet.data.list[100].statusText, '未使用');
  assert.ok(!ids.includes('other'));
  assert.deepEqual(env.requests.map(req => req[2].offset), [0, 20, 20, 40, 60, 80, 100]);
  assert.equal((await db.call('coupon', 'mine')).data.list.length, 100);
  assert.equal((await db.call('coupon', 'mine', { offset: -1 })).code, 'E_INVALID_PARAM');
  await wallet.load();
  let release;
  hold = new Promise(resolve => { release = resolve; });
  const pending = wallet.loadMore();
  await new Promise(resolve => setImmediate(resolve));
  wallet.onHide();
  db.setActor('neighbor');
  env.app.globalData.user = db.data.users[1];
  await wallet.onShow();
  release();
  await pending;
  assert.equal(wallet.data.list.length, 1);
  assert.equal(wallet.data.list[0]._id, 'other');
  assert.equal(wallet.data.hasMore, false);
  assert.equal(db.writes.length, 0);
  console.log('QA76 passed: 101 unique, equal timestamps, retry at 20, double click, end, legacy 100, invalid offset, account switch and stale response');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
