// Actual My-page navigation with synthetic users; no requests reach a cloud.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
function check(name, user, code, expected, extra = {}) {
  const r = runtime(); const p = r.instance('miniprogram/pages/me/me.js'); const modals = [];
  r.wx.showModal = value => modals.push(value.title);
  p.data.user = user; p.data.loading = false; // Successfully initialized page, no real session.
  p.data.community = { enabledFeatures: { merchants: true, stationDelivery: true, ...extra.features } };
  p.data.provider = extra.provider || null;
  try {
    p.openWorkspace({ currentTarget: { dataset: { code } } });
    assert.deepEqual(JSON.parse(JSON.stringify({ navigation: r.navigation, modals })), expected);
    assert.equal(r.requests.length, 0);
    results.push({ name, passed: true });
  } catch (error) { results.push({ name, passed: false, error: error.message }); }
}
const resident = { _id: 'fixture', roles: ['resident'], communityId: 'fixture-community', buildingId: 'fixture-building' };
for (const code of ['provider', 'merchant', 'station']) {
  const apply = code === 'provider' ? '/provider/apply/apply' : `/${code}/apply/apply`;
  check(code + ': bound resident opens application', resident, code, { navigation: [['navigateTo', apply]], modals: [] });
  check(code + ': unbound resident opens binding', { _id: 'fixture', roles: ['resident'] }, code,
    { navigation: [['navigateTo', '/pages/bind/bind']], modals: [] });
}
for (const code of ['merchant', 'station']) {
  check(code + ': closed feature shows conditions', resident, code, { navigation: [], modals: ['本小区暂未开通'] },
    { features: { merchants: false, stationDelivery: false } });
  check(code + ': existing role opens protected workbench', { ...resident, roles: ['resident', code] }, code,
    { navigation: [['navigateTo', `/${code}/workbench/workbench`]], modals: [] });
}
check('approved provider opens workbench', resident, 'provider',
  { navigation: [['navigateTo', '/provider/workbench/workbench']], modals: [] }, { provider: { status: 'approved' } });
for (const code of ['admin', 'property']) {
  check(code + ': no role shows qualification', resident, code,
    { navigation: [], modals: [code === 'admin' ? '管理员资格' : '物业资格'] });
  check(code + ': assigned role opens shared dashboard', { ...resident, roles: ['resident', code] }, code,
    { navigation: [['navigateTo', '/admin/dashboard/dashboard']], modals: [] });
}
check('missing identity cannot navigate', null, 'provider', { navigation: [], modals: [] });
check('unknown workspace cannot navigate', resident, 'unknown', { navigation: [], modals: [] });
process.stdout.write(JSON.stringify({ mode: 'actual-page-synthetic-only', total: results.length, passed: results.filter(r => r.passed).length, results }, null, 2) + '\n');
process.exitCode = results.every(r => r.passed) ? 0 : 1;
