// Diagnostic only. Synthetic VM data, no network, no cloud writes or real identity.
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const source = 'miniprogram/admin/posters/posters.js';
(async () => {
  const emptyRuntime = runtime();
  const empty = emptyRuntime.instance(source);
  let emptyError = '';
  try { await empty.generate({ currentTarget: { dataset: { type: 'provider' } } }); }
  catch (error) { emptyError = error.message; }

  const pending = {};
  const raceRuntime = runtime((name, action, data) => new Promise((resolve, reject) => {
    pending[data.communityId] = { resolve, reject };
  }));
  const race = raceRuntime.instance(source);
  race.data.communities = [{ _id: 'synthetic_a' }, { _id: 'synthetic_b' }];
  const a = race.changeCommunity({ detail: { value: 0 } });
  const b = race.changeCommunity({ detail: { value: 1 } });
  pending.synthetic_b.resolve({ buildings: [{ _id: 'building_b' }] }); await b;
  pending.synthetic_a.resolve({ buildings: [{ _id: 'building_a' }] }); await a;

  const failed = runtime(async () => { throw Error('合成网络失败'); }).instance(source);
  failed.data.communities = [{ _id: 'synthetic_a' }];
  let selectionError = '';
  try { await failed.changeCommunity({ detail: { value: 0 } }); }
  catch (error) { selectionError = error.message; }
  const report = {
    scope: 'Isolated diagnostic only; no real cloud or generated poster',
    emptyProvider: { unhandled: emptyError, visibleError: empty.data.error, apiCalls: emptyRuntime.requests.length },
    selectionRace: { lastChosen: 'synthetic_b', actual: race.data.communities[race.data.communityIndex]._id,
      building: race.data.buildings[0]?._id },
    selectionFailure: { unhandled: selectionError, visibleError: failed.data.error },
    status: 'QA32 proposed in conversation; awaiting user decision; application code unchanged'
  };
  fs.writeFileSync(__dirname + '/qa32-repro.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
