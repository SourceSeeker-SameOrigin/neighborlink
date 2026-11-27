// Execute the actual workbench page at fixed instants under three device timezones.
// No cloud call, clipboard write, or native dialog is made.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const PAGE = 'miniprogram/station/workbench/workbench.js';
const cases = [
  { instant: '2026-11-30T16:05:00Z', beijingMonth: '2026-12' },
  { instant: '2026-12-31T16:05:00Z', beijingMonth: '2027-01' }
];
function run() {
  const OriginalDate = global.Date, originalZone = process.env.TZ;
  const results = [];
  try {
    for (const item of cases) {
      const timestamp = OriginalDate.parse(item.instant);
      class FixedDate extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [timestamp])); }
        static now() { return timestamp; }
      }
      global.Date = FixedDate;
      for (const timezone of ['Asia/Shanghai', 'UTC', 'America/Los_Angeles']) {
        process.env.TZ = timezone;
        const page = runtime().instance(PAGE);
        page.onLoad();
        page.visible = true;
        results.push({ instant: item.instant, timezone, expectedBeijingMonth: item.beijingMonth,
          actualDefaultMonth: page.data.month, matches: page.data.month === item.beijingMonth });
        page.monthChange({ detail: { value: '2026-09' } });
        page.onHide();
        results.push({ instant: item.instant, timezone, case: 'manual-month-survives-hide',
          expectedMonth: '2026-09', actualMonth: page.data.month,
          matches: page.data.month === '2026-09' });
      }
    }
  } finally {
    global.Date = OriginalDate;
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
  return { scope: 'actual P62 onLoad with synthetic clock only', cases: results,
    matched: results.filter(item => item.matches).length,
    mismatched: results.filter(item => !item.matches).length,
    cloudCalls: 0 };
}
if (require.main === module) {
  const report = run();
  console.log(JSON.stringify(report, null, 2));
  if (report.mismatched) process.exitCode = 1;
}
module.exports = { run };
