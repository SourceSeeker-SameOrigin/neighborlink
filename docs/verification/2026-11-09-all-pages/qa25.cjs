const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const rows = require('./qa25-routes.json');
(async () => {
  const results = [];
  for (const [route, field, param, label, dest, title, nav, methods] of rows) {
    for (const value of [undefined, '', '   ', null, 123]) {
      const r = runtime(); let effects = 0;
      r.wx.showModal = () => effects++;
      r.wx.showActionSheet = () => effects++;
      r.wx.makePhoneCall = () => effects++;
      const p = r.instance('miniprogram/' + route + '.js');
      p.onLoad(value === undefined ? undefined : { [param]: value });
      assert.equal(p.data.missingRecord, true); assert.equal(p.data.loading, false);
      await p.onShow();
      if (p.load) await p.load();
      for (const method of methods.split(' ').filter(Boolean)) {
        assert.equal(typeof p[method], 'function', route + ':' + method);
        await p[method]({ currentTarget: { dataset: { id: 'fixture', action: 'confirm' } }, detail: { value: '' } });
      }
      if (p.onShareAppMessage) assert.equal(p.onShareAppMessage().path, '/' + dest);
      assert.equal(r.requests.length, 0); assert.equal(r.navigation.length, 0); assert.equal(effects, 0);
      results.push({ route, case: 'missing:' + String(value), pass: true });
    }
    const r = runtime(async () => { throw Error('合成拒绝'); });
    const p = r.instance('miniprogram/' + route + '.js');
    p.onLoad({ [param]: ' fixture-record ' });
    assert.equal(p[field], 'fixture-record'); assert.equal(p.data.missingRecord, false);
    // QA85: these task pages load only while visible; reproduce the actual page lifecycle.
    if (['pet/work','provider/task/task'].includes(route)) await p.onShow();
    else if (route === 'shops/booking/booking') { await p.onShow(); await p.submit(); } // First serviceId request is on submit.
    else if (p.load) await p.load(); else { await p.onShow(); await p.submit(); }
    assert(r.requests.some(a => a[2][field] === 'fixture-record'), route + ' normal path preserved');
    const template = fs.readFileSync('miniprogram/' + route + '.wxml', 'utf8');
    assert(template.includes('wx:if="{{missingRecord}}"'));
    assert(/<\/(?:view|block)>\s*<(?:view|block)\s+wx:else[\s>]/.test(template));
    assert(template.includes('url="/' + dest + '" open-type="' + nav + '"'));
    results.push({ route, case: 'valid identifier retains API + guarded template + return route', pass: true });
  }
  fs.writeFileSync(__dirname + '/qa25.json', JSON.stringify({ scope: 'isolated, no cloud writes', total: results.length, passed: results.length, results }, null, 2) + '\n');
  console.log('QA25: ' + results.length + '/' + results.length);
})().catch(e => { console.error(e); process.exitCode=1; });
