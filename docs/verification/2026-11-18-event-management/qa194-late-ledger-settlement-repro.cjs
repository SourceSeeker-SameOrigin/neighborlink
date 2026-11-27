// Actual admin settlement implementation with synthetic records; no CloudBase calls.
const assert = require('node:assert/strict');
const { adminSettlementActions } = require('../../../cloudfunctions/_shared/adminSettlements');

const rows = {
  first: { _id: 'first', refType: 'order', refId: 'order-1', communityId: 'community-1',
    amounts: { property: 100 }, settled: { property: false }, settlementIds: {}, createdAt: new Date('2026-11-05') }
};
const records = { ledger: rows, settlements: {}, orders: {
  'order-1': { _id: 'order-1', communityId: 'community-1', serviceCode: 'help' },
  'order-2': { _id: 'order-2', communityId: 'community-1', serviceCode: 'help' }
} };
const transaction = { collection: table => ({ doc: id => ({
  async get() { return { data: records[table]?.[id] || null }; },
  async update({ data }) { Object.assign(records[table][id], data); },
  async set({ data }) { records[table][id] = { _id: id, ...data }; }
}) }) };
const command = { gte: () => ({ and: () => ({}) }), lt: () => ({}) };
const server = { db: { runTransaction: work => work(transaction) }, command,
  get: async (table, id) => records[table]?.[id],
  all: async table => Object.values(records[table] || {}) };
const api = adminSettlementActions({}, server);
const input = { payee: 'property', communityId: 'community-1', from: '2026-11-01', to: '2026-11-30' };
const context = { user: { _id: 'admin-1', roles: ['admin'] }, openid: 'admin-openid' };

(async () => {
  const first = await api.settlementCreate(input, context);
  assert.equal(first.settlements.length, 1);
  assert.deepEqual(first.settlements[0].ledgerIds, ['first']);
  const unchangedRetry = await api.settlementCreate(input, context);
  assert.equal(unchangedRetry.settlements[0]._id, first.settlements[0]._id);
  assert.equal(Object.keys(records.settlements).length, 1);
  rows.late = { _id: 'late', refType: 'order', refId: 'order-2', communityId: 'community-1',
    amounts: { property: 200 }, settled: { property: false }, settlementIds: {}, createdAt: new Date('2026-11-10') };
  const preview = await api.settlementPreview(input, context);
  assert.equal(preview.rows[0].total, 300);
  const second = await api.settlementCreate(input, context);
  assert.equal(second.settlements[0]._id, first.settlements[0]._id);
  assert.deepEqual(second.settlements[0].ledgerIds, ['first']);
  assert.equal(rows.late.settlementIds.property, undefined);
  // Once the original period is paid, the newer ledger is the only eligible
  // preview row, but the same deterministic settlement ID still returns old.
  rows.first.settled.property = true;
  records.settlements[first.settlements[0]._id].status = 'paid';
  const laterPreview = await api.settlementPreview(input, context);
  assert.equal(laterPreview.rows[0].total, 200);
  const afterPaid = await api.settlementCreate(input, context);
  assert.equal(afterPaid.settlements[0].status, 'paid');
  assert.equal(rows.late.settlementIds.property, undefined);
  console.log(JSON.stringify({ scope: 'actual settlement code; synthetic database only',
    unchangedRetryReusesSettlement: unchangedRetry.settlements[0]._id === first.settlements[0]._id,
    previewTotalFen: preview.rows[0].total, settlementTotalFen: second.settlements[0].total,
    settlementLedgerIds: second.settlements[0].ledgerIds,
    laterPreviewFen: laterPreview.rows[0].total, afterPaidReturnedStatus: afterPaid.settlements[0].status,
    lateLedgerAssigned: !!rows.late.settlementIds.property, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
