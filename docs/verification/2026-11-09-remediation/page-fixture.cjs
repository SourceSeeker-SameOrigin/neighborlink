// Isolated page-flow regression: no real cloud, identity, phone, or address writes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = process.cwd();
const results = [];
function runtime(call = async () => { throw Error('Unexpected API call'); }, overrides = {}) {
  const store = {}, navigation = [], requests = [], cache = new Map();
  const app = { globalData: { user: { _id: 'fixture', roles: ['resident'] }, community: null },
    ensureSession: async () => app.globalData.user };
  const wx = { getStorageSync: key => store[key], setStorageSync: (key, value) => { store[key] = value; }, removeStorageSync: key => delete store[key],
    navigateTo: o => navigation.push(['navigateTo', o.url]),
    redirectTo: o => navigation.push(['redirectTo', o.url]),
    switchTab: o => navigation.push(['switchTab', o.url]), showToast() {} };
  function load(file) {
    file = path.resolve(root, file); if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file);
    let definition; const module = { exports: {} };
    const requireLocal = id => {
      const target = path.resolve(path.dirname(file), id) + '.js';
      if (target === path.join(root, 'miniprogram/utils/api.js')) return { call: async (...args) => {
        requests.push(args); return call(...args);
      } };
      if (target === path.join(root, 'miniprogram/utils/payment.js')) return overrides.payment || { pay: async () => { throw Error('No payment'); } };
      if (target === path.join(root, 'miniprogram/utils/media.js') && overrides.media) return overrides.media;
      if (!id.startsWith('.')) throw Error('External dependencies forbidden');
      return load(path.resolve(path.dirname(file), id));
    };
    vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})',
      { wx, getApp: () => app, Page: value => { definition = value; }, Date, Promise, console,
        setTimeout: overrides.setTimeout || (() => 1), clearTimeout: overrides.clearTimeout || (() => {}), setInterval: () => 1, clearInterval() {} }, { filename: file })(requireLocal, module, module.exports);
    const value = definition || module.exports; cache.set(file, value); return value;
  }
  function instance(definition) {
    const page = typeof definition === 'string' ? load(definition) : definition;
    return { ...page, data: JSON.parse(JSON.stringify(page.data || {})), setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g,'.$1').split('.'); let target = this.data;
        while (parts.length > 1) { const part = parts.shift(); target = target[part] ||= {}; }
        target[parts[0]] = value;
      }
    } };
  }
  return { app, wx, store, navigation, requests, load, instance };
}

module.exports={runtime};
