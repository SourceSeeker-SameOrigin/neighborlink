// The real membership entry dispatch with a synthetic read-only order store.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const rows = new Map();
let reads = 0;
const server = {
  get: async (collection, id) => { assert.equal(collection, 'orders'); reads++; return rows.get(id) || null; },
  entry: actions => async (event, openid = 'resident-a') => actions[event.action](event, { openid })
};
const dependencies = {
  'wx-server-sdk': { init() {}, DYNAMIC_CURRENT_ENV: 'synthetic' },
  crypto,
  './lib/shared/server': { createServer: () => server },
  './lib/shared/payFlow': { createPayFlow: () => ({}) },
  './lib/shared/validate': require(path.join(root, 'cloudfunctions/_shared/validate.js'))
};
const filename = path.join(root, 'cloudfunctions/membership/index.js');
const sandboxModule = { exports: {} };
vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})',
  { Promise, Date, process: { env: {} }, console }, { filename })(
  id => dependencies[id] || {}, sandboxModule, sandboxModule.exports);

(async () => {
  const requestId = 'synthetic_request_123';
  const id = 'mp_' + crypto.createHash('sha256').update('resident-a:' + requestId).digest('hex').slice(0, 40);
  const absent = await sandboxModule.exports.main({ action: 'lookupBuy', requestId });
  assert.equal(absent.orderId, null);
  rows.set(id, { _id: id, kind: 'membership_purchase', userOpenid: 'resident-a',
    planCode: 'visit_monthly', communityId: 'community-a', addressId: 'address-a',
    detail: { slot: 'morning' }, status: 'pending_pay' });
  const own = await sandboxModule.exports.main({ action: 'lookupBuy', requestId });
  assert.equal(own.orderId, id);
  assert.equal(own.planCode, 'visit_monthly');
  assert.equal(own.addressId, 'address-a');
  assert.equal(own.slot, 'morning');
  assert.equal(own.status, 'pending_pay');
  const other = await sandboxModule.exports.main({ action: 'lookupBuy', requestId }, 'resident-b');
  assert.equal(other.orderId, null);
  rows.set(id, { ...rows.get(id), userOpenid: 'resident-b' });
  await assert.rejects(sandboxModule.exports.main({ action: 'lookupBuy', requestId }),
    error => error.code === 'E_FORBIDDEN');
  assert.equal(reads, 4);
  console.log(JSON.stringify({ scope: 'Real membership lookup action; synthetic read-only store',
    absent: absent.orderId, ownOrder: own.orderId, otherResident: other.orderId, reads }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
