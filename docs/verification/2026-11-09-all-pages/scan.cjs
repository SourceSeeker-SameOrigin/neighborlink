// Run from repository root. Isolated VM only: no real cloud, UI, or payment.
const fs = require('fs');
const path = require('path');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const output = __dirname;
const app = JSON.parse(fs.readFileSync('miniprogram/app.json'));
const routes = [...app.pages, ...app.subPackages.flatMap(s => s.pages.map(p => s.root + '/' + p))];
const unhandled = [];
let current;
process.on('unhandledRejection', error => unhandled.push({ ...current, message: error.message }));
const scenarios = [
  { name: 'network_failure', code: 'E_NETWORK', message: '合成网络失败', bound: true },
  { name: 'feature_off', code: 'E_FEATURE_OFF', message: '此功能暂未开放', bound: true },
  { name: 'unbound_network_failure', code: 'E_NETWORK', message: '合成网络失败', bound: false }
];

(async () => {
  const results = [], structure = [];
  for (const route of routes) {
    const source = 'miniprogram/' + route;
    const wxml = fs.readFileSync(source + '.wxml', 'utf8');
    const p = runtime().instance(source + '.js');
    const handlers = [...new Set([...wxml.matchAll(/\b(?:bind|catch|capture-bind|capture-catch):?[\w-]+\s*=\s*["']([\w$]+)["']/g)].map(m => m[1]))];
    const urls = [...wxml.matchAll(/\burl=["'](\/[^"'{]+)["']/g)].map(m => m[1].split('?')[0].slice(1));
    const assets = [...wxml.matchAll(/\bsrc=["'](\/assets\/[^"'{]+)["']/g)].map(m => m[1]);
    const config = JSON.parse(fs.readFileSync(source + '.json', 'utf8'));
    const missingComponents = Object.entries(config.usingComponents || {}).filter(([, value]) => {
      if (/^(plugin:|wx:)/.test(value)) return false;
      const base = value.startsWith('/') ? path.join('miniprogram', value.slice(1)) : path.resolve(path.dirname(source), value);
      return !['.js', '.json', '.wxml', '.wxss'].every(ext => fs.existsSync(base + ext));
    });
    structure.push({ route, filesComplete: ['.js', '.json', '.wxml', '.wxss'].every(ext => fs.existsSync(source + ext)),
      handlers, missingHandlers: handlers.filter(h => typeof p[h] !== 'function'),
      missingRoutes: urls.filter(url => !routes.includes(url)),
      missingAssets: assets.filter(asset => !fs.existsSync('miniprogram' + asset)), missingComponents });
    for (const scenario of scenarios) {
      current = { route, scenario: scenario.name };
      const calls = [];
      const r = runtime(async (name, action) => {
        calls.push({ name, action });
        const error = Error(scenario.message); error.code = scenario.code; throw error;
      });
      Object.assign(r.wx, { setNavigationBarTitle() {}, removeTabBarBadge() {}, setTabBarBadge() {},
        stopPullDownRefresh() {}, showModal(o) { if (o.success) o.success({ confirm: false, cancel: true }); } });
      r.app.globalData.user = { _id: 'fixture', roles: ['resident', 'admin'], addresses: [],
        ...(scenario.bound ? { communityId: 'fixture_community', buildingId: 'fixture_building' } : {}) };
      r.app.globalData.community = scenario.bound ? { _id: 'fixture_community', name: '合成小区', enabledFeatures: {} } : null;
      r.app.globalData.provider = null;
      let page, uncaught = null;
      try {
        page = r.instance(source + '.js');
        if (page.onLoad) await page.onLoad({});
        if (page.onShow) await page.onShow();
        await new Promise(setImmediate); await new Promise(setImmediate);
      } catch (error) { uncaught = error.message; }
      const data = page?.data || {};
      results.push({ ...current, calls, errors: Object.fromEntries(Object.entries(data).filter(([k, v]) => /error/i.test(k) && typeof v === 'string' && v)),
        loading: data.loading, uncaught, navigation: r.navigation });
      for (const hook of ['onHide', 'onUnload']) if (page?.[hook]) {
        try { await page[hook](); } catch (error) { results[results.length - 1].cleanupError = error.message; }
      }
    }
  }
  const report = { scope: 'Isolated VM lifecycle and static references only; API always throws; no real cloud/visual/success-flow acceptance',
    pageCount: routes.length, scenarioCount: results.length, structure, results, unhandled };
  fs.writeFileSync(path.join(output, 'scan.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pages: routes.length, scenarios: results.length,
    referenceFailures: structure.filter(s => !s.filesComplete || s.missingHandlers.length || s.missingRoutes.length || s.missingAssets.length || s.missingComponents.length),
    uncaught: results.filter(r => r.uncaught).map(({ route, scenario, uncaught }) => ({ route, scenario, uncaught })), unhandled }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
