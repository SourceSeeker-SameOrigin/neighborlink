// Synthetic orders and media only. Run with node from this repository's root.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { cleanVisitResult } = require('../../../cloudfunctions/_shared/petFlow');
const api = require('../../../miniprogram/utils/api');
const links = require('../../../miniprogram/utils/media-links');

async function run() {
  const order = { _id: 'test-order', serviceCode: 'pet', userOpenid: 'actor',
    communityId: 'c', detail: { entry: 'key_handover' }, status: 'delivered' };
  const folder = 'cloud://synthetic/pet/' + order._id + '/';
  const photos = [folder + 'a.jpg', folder + 'b.jpg'];
  const videoFileId = folder + 'sample.mp4';
  const photoVisit = cleanVisitResult({ photos }, order);
  const videoVisit = cleanVisitResult({ videoFileId }, order);
  assert.throws(() => cleanVisitResult({ photos: [photos[0]] }, order));
  assert.throws(() => cleanVisitResult({ photos, videoFileId }, order));
  console.log('PASS two photos or one video; rejects one photo and mixed submission');
  const db = fixture({ records: {
    communities: [{ _id: 'c', status: 'active', features: { pet: true } }],
    users: ['actor','other'].map(openid => ({ _id: openid, openid, roles: ['resident'], communityId: 'c' })),
    orders: [order],
    visits: [photoVisit, videoVisit].map((media, i) => ({
      _id: 'visit-' + i, parentOrderId: order._id, date: '2026-11-16', seq: i + 1, status: 'done', ...media
    }))
  }});
  const tabs = [];
  let intercept = null;
  global.wx = { switchTab: ({url}) => tabs.push(url), cloud: {
    callFunction: async ({ name, data }) => {
      if (intercept) await intercept;
      return { result: await db.call(name, data.action, data) };
    }
  }};
  const resident = runtime((...args) => api.call(...args)).instance('miniprogram/pet/reports');
  resident.onLoad({id:order._id});
  const read = () => resident.onShow();
  await read();
  const list = resident.data.visits;
  assert.equal(list.length, 2);
  assert.deepEqual([...db.signed.map(x => x.fileID)].sort(), [...photos,videoFileId].sort());
  assert.ok(db.signed.every(x => x.maxAge === 600));
  for (const file of [...photos,videoFileId]) assert.match(await links.resolve(file), /^https:/);
  console.log('PASS owner obtains both visits and three synthetic signed URLs');
  const invalid = 'cloud://synthetic/pet/other-order/private.jpg';
  db.data.visits[0].photos.push(invalid);
  const crossScope = await db.call('pet','listVisits',{orderId:order._id});
  assert.equal(crossScope.ok,true);
  assert.equal(crossScope.data._media[invalid].url,'');
  assert.ok(!db.signed.some(x => x.fileID === invalid));
  db.data.visits[0].photos.pop();
  console.log('PASS media associated with a different order is not signed');

  const beforeRefresh = db.signed.length;
  assert.match(await links.resolve(videoFileId,true),/^https:/);
  assert.equal(db.signed.length,beforeRefresh + 3);
  console.log('PASS authorized video refresh checks the record and signs current media');
  db.setActor('other');
  const signed = db.signed.length;
  await read();
  assert.match(resident.data.error,/无权/);
  assert.equal(tabs.length, 0);
  assert.equal(db.signed.length, signed);
  console.log('PASS direct permission denial stays on the page and signs no new files');
  let component;
  global.Component = definition => { component = definition; };
  require('../../../miniprogram/components/private-media/index');
  for (const [phase, file] of [
    ['visible', photos[0]], ['after detach', photos[0]],
    ['visible', videoFileId], ['after detach', videoFileId]
  ]) {
    const kind = file === videoFileId ? 'video' : 'image';
    let release;
    intercept = new Promise(resolve => { release = resolve; });
    const signedBefore = db.signed.length;
    const instance = { ...component.methods, properties: { src: file, kind }, data: {},
      setData(patch) { Object.assign(this.data,patch); } };
    tabs.length = 0;
    const refreshing = instance.failed();
    if (phase === 'after detach') component.lifetimes.detached.call(instance);
    release();
    await refreshing;
    assert.equal(db.signed.length,signedBefore);
    assert.ok(!instance.data.url);
    assert.equal(tabs.length, 0, phase + ': unexpected navigation');
    intercept = null;
    if (phase === 'visible') {
      assert.match(instance.data.error,/无权/);
      db.setActor('actor');
      await instance.retry();
      assert.equal(instance.data.error,'');
      assert.match(instance.data.url,/^https:/);
      assert.equal(tabs.length,0);
      db.setActor('other');
      console.log('PASS', kind, 'visible denial stays in place and an explicit retry recovers');
    } else {
      assert.ok(!instance.data.error);
      console.log('PASS', kind, 'detached component ignores late denial without navigation');
    }
  }
  db.setActor('actor');
  await api.call('pet','listVisits',{orderId:order._id},{loading:false,silent:true});
  db.setActor('other');
  await assert.rejects(links.resolve(videoFileId,true),error => error.code === 'E_FORBIDDEN');
  assert.deepEqual(tabs,['/pages/index/index']);
  console.log('PASS existing default redirect for a caller without the page override');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
