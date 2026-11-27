// Actual admin settlement implementation with synthetic records; no CloudBase calls.
const assert = require('node:assert/strict');
const { adminSettlementActions } = require('../../../cloudfunctions/_shared/adminSettlements');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

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
  async update({ data }) { for (const [key, value] of Object.entries(data)) {
    const parts = key.split('.'); let target = records[table][id];
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    target[parts.at(-1)] = value;
  } },
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
  assert.equal(preview.rows[0].total, 200);
  assert.equal(preview.rows[0].supplementOf, first.settlements[0]._id);
  const second = await api.settlementCreate(input, context);
  assert.notEqual(second.settlements[0]._id, first.settlements[0]._id);
  assert.deepEqual(second.settlements[0].ledgerIds, ['late']);
  assert.equal(rows.late.settlementIds.property, second.settlements[0]._id);
  const marked = await api.settlementMarkPaid({ settlementId: first.settlements[0]._id }, context);
  assert.equal(marked.status, 'paid');
  assert.equal(rows.first.settled.property, true);
  const markedAgain = await api.settlementMarkPaid({ settlementId: first.settlements[0]._id }, context);
  assert.equal(markedAgain.status, 'paid');
  assert.equal(rows.late.settled.property, false);
  // Paying the original period never consumes a supplemental ledger row.
  const laterPreview = await api.settlementPreview(input, context);
  assert.equal(laterPreview.rows.length, 0);
  const afterPaid = await api.settlementCreate(input, context);
  assert.equal(afterPaid.settlements[0]._id, second.settlements[0]._id);
  assert.equal(rows.late.settlementIds.property, second.settlements[0]._id);
  rows.lateAfterPayment = { _id: 'lateAfterPayment', refType: 'order', refId: 'order-2', communityId: 'community-1',
    amounts: { property: 300 }, settled: { property: false }, settlementIds: {}, createdAt: new Date('2026-11-11') };
  const postPaymentPreview = await api.settlementPreview(input, context);
  assert.equal(postPaymentPreview.rows[0].total, 300);
  const postPayment = await api.settlementCreate(input, context);
  assert.equal(postPayment.settlements[0].supplementOf, first.settlements[0]._id);
  assert.equal(rows.lateAfterPayment.settlementIds.property, postPayment.settlements[0]._id);
  assert.equal(records.settlements[first.settlements[0]._id].status, 'paid');
  assert.equal(records.settlements[first.settlements[0]._id].total, 100);
  const largeLedger = Array.from({ length: 205 }, (_, index) => ({
    _id: `ledger-${String(index).padStart(3, '0')}`, communityId: 'c',
    createdAt: new Date('2026-11-15T00:00:00Z'), amounts: { property: 100 },
    settled: { property: false }, settlementIds: {} }));
  const large = fixture({ roles: ['admin'], records: { ledger: largeLedger } });
  const largeResult = await large.call('admin', 'settlementPreview',
    { payee: 'property', communityId: 'c', from: '2026-11-01', to: '2026-11-30' });
  assert.equal(largeResult.ok, true);
  assert.equal(largeResult.data.rows[0].ledgerIds.length, 205);
  assert.equal(largeResult.data.rows[0].total, 20500);
  assert.equal(large.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual settlement code; synthetic database only',
    unchangedRetryReusesSettlement: unchangedRetry.settlements[0]._id === first.settlements[0]._id,
    previewTotalFen: preview.rows[0].total, settlementTotalFen: second.settlements[0].total,
    settlementLedgerIds: second.settlements[0].ledgerIds,
    laterPreviewFen: 0, afterPaidReturnedStatus: afterPaid.settlements[0].status,
    lateLedgerAssigned: !!rows.late.settlementIds.property,
    postPaymentSupplementFen: postPayment.settlements[0].total,
    originalPaidTwiceWithoutDuplicate: markedAgain.status === 'paid',
    largePreviewCount: largeResult.data.rows[0].ledgerIds.length,
    largePreviewTotalFen: largeResult.data.rows[0].total, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
