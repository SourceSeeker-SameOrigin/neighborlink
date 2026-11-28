// Actual page lifecycle with a synthetic first-session rejection; no cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const cases = [
  ['P14', 'miniprogram/provider/workbench/workbench.js', 'onShow'],
  ['P15', 'miniprogram/provider/hall/hall.js', 'onShow'],
  ['P17', 'miniprogram/provider/earnings/earnings.js', 'onShow'],
  ['P18', 'miniprogram/admin/dashboard/dashboard.js', 'onShow'],
  ['P19', 'miniprogram/admin/orders/orders.js', 'onShow'],
  ['P21', 'miniprogram/admin/providers/providers.js', 'onShow'],
  ['P22', 'miniprogram/admin/community/community.js', 'onLoad'],
  ['P23', 'miniprogram/admin/posters/posters.js', 'onLoad'],
  ['P24', 'miniprogram/admin/settlements/settlements.js', 'onLoad'],
  ['P26', 'miniprogram/admin/reports/reports.js', 'onShow'],
  ['P30', 'miniprogram/admin/merchants/merchants.js', 'onShow'],
  ['P31', 'miniprogram/admin/recycle/recycle.js', 'onLoad'],
  ['P32', 'miniprogram/admin/exports/exports.js', 'onShow'],
  ['P33', 'miniprogram/admin/stations/stations.js', 'onShow'],
  ['P54', 'miniprogram/merchant/apply/apply.js', 'onShow'],
  ['P61', 'miniprogram/station/apply/apply.js', 'onShow']
];

async function main() {
  for (const [pageId, file, entry] of cases) {
    const r = runtime(async () => { throw Error('Unexpected cloud call'); });
    r.app.globalData.user = null;
    r.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
    const page = r.instance(file);
    if (pageId === 'P32') page.onLoad({});
    await page[entry]();
    // P18 onShow starts its read without returning the promise.
    if (pageId === 'P18') await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.data.loading, false, `${pageId} loading`);
    assert.match(page.data.error, /synthetic login timeout/, `${pageId} error`);
    assert.equal(r.requests.length, 0, `${pageId} cloud calls`);
    if (Array.isArray(page.data.rows)) assert.equal(page.data.rows.length, 0, `${pageId} stale rows`);
    if ('ready' in page.data) assert.equal(page.data.ready, false, `${pageId} ready`);
    if ('authorized' in page.data) assert.equal(page.data.authorized, false, `${pageId} authorized`);
    if (page.onHide) page.onHide();
  }
  console.log(JSON.stringify({ scope: 'Actual page code; synthetic first-session rejection; zero cloud calls', passed: cases.map(([id]) => id) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
