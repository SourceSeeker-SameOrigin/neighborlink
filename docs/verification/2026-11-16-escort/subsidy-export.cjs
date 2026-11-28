const {
  fixture
} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const assert = require('node:assert/strict');
// Optionally supply the extracted admin entry to verify the exact deployment package.
const exportFrom = (env, range) => process.argv[2] ? env.load(process.argv[2]).main({
  action: 'exportSubsidyOrders',
  ...range
}) : env.call('admin', 'exportSubsidyOrders', range);
(async () => {
  const at = new Date('2026-11-17T01:00:00Z');
  const paid = {
    serviceCode: 'meal',
    communityId: 'c',
    status: 'completed',
    createdAt: at,
    completedAt: at,
    pricing: {
      payAmount: 300,
      goodsActual: 2000
    },
    payment: {
      paidAt: at
    },
    refunds: [{
      status: 'success',
      amount: 100
    }, {
      status: 'pending',
      amount: 200
    }],
    note: 'PRIVATE_MARKER'
  };
  const orders = Array.from({
    length: 101
  }, (_, i) => ({
    ...paid,
    orderNo: 'fixture_' + i
  }));
  orders.push({
    ...paid,
    orderNo: 'unpaid',
    status: 'pending_pay',
    payment: {
      paidAt: null
    },
    completedAt: null,
    pricing: {
      payAmount: 500,
      goodsActual: 0
    },
    refunds: []
  });
  orders.push({
    ...paid,
    orderNo: 'exclude_date',
    createdAt: new Date('2026-11-16T15:59:59Z')
  }, {
    ...paid,
    orderNo: 'exclude_type',
    serviceCode: 'trash'
  });
  const f = fixture({
    roles: ['admin'],
    records: {
      orders
    }
  });
  let csv;
  f.cloud.uploadFile = async o => {
    csv = o.fileContent.toString();
    return {
      fileID: 'fixture'
    };
  };
  const e = await exportFrom(f, {
    from: '2026-11-17',
    to: '2026-11-17'
  });
  assert.equal(e.ok, true, e.message);
  const lines = csv.split('\r\n');
  assert.equal(e.data.count, 102);
  assert.equal(lines.length, 103);
  assert.ok(!csv.includes('PRIVATE_MARKER') && !csv.includes('exclude_'));
  const ids = new Set(lines.slice(1).map(r => r.split(',')[0]));
  assert.equal(ids.size, 102);
  assert.ok(lines.at(-1).endsWith('"0","0","0"'));
  assert.ok(lines[1].endsWith('"300","2000","100"'));
  console.log(JSON.stringify({
    rows: e.data.count,
    unique: ids.size,
    privateFieldsExcluded: true,
    dateAndTypeExcluded: true,
    paidRow: lines[1],
    unpaidRow: lines.at(-1),
    header: lines[0]
  }));
  const no = fixture({
    roles: ['resident'],
    records: {
      orders
    }
  });
  const denied = await exportFrom(no, {
    from: '2026-11-17',
    to: '2026-11-17'
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'E_FORBIDDEN');
  console.log('resident:', denied.code);
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
