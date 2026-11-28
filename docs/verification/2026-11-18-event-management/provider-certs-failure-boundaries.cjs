// Actual provider review page with synthetic administrator and intercepted cloud reads/writes.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const provider = { _id: 'synthetic-provider', status: 'approved', realName: '测试服务员',
  certs: [], kycFileIds: [], insuranceUntil: null, createdAt: new Date('2026-11-27T02:00:00Z') };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

(async () => {
  let saveFails = false;
  const env = runtime(async (name, action) => {
    if (name !== 'admin') throw new Error('Unexpected function');
    if (action === 'listProviders') return { list: [{ ...provider, certs: [...provider.certs] }], hasMore: false };
    if (action === 'setCerts') {
      if (saveFails) throw new Error('合成网络失败，证书未保存');
      return { providerId: provider._id };
    }
    throw new Error(`Unexpected action: ${action}`);
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/providers/providers.js');
  await page.load(true);
  const results = [{ case: 'initial-certificates-match-server', pass: !page.data.rows[0].escortCert,
    observed: { escortCert: page.data.rows[0].escortCert } }];
  saveFails = true;
  page.certs({ currentTarget: { dataset: { index: 0 } }, detail: { value: ['escort'] } });
  await settle();
  results.push({ case: 'failed-save-does-not-claim-certificate-active',
    pass: !page.data.rows[0].escortCert && page.data.rows[0].certs.length === 0,
    observed: { escortCert: page.data.rows[0].escortCert, certs: page.data.rows[0].certs,
      error: page.data.error, saveCalls: env.requests.filter(item => item[1] === 'setCerts').length } });
  const summary = { scope: 'actual provider review page; synthetic admin/provider; cloud writes intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.fail) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
