const api = require('./api');

const KEY = 'subscriptionReminderCount';

async function request(keys, options = {}) {
  const active = () => typeof options.isActive !== 'function' || options.isActive();
  try {
    if (!active()) return 0;
    const ids = await api.call('order', 'subscriptionTemplates', {}, { loading: false, silent: true, isActive: active });
    if (!active()) return 0;
    const templates = [...new Set(keys.map(key => ids[key]).filter(Boolean))];
    if (!templates.length || typeof wx.requestSubscribeMessage !== 'function') return 0;
    const result = await new Promise((resolve, reject) => wx.requestSubscribeMessage({ tmplIds: templates, success: resolve, fail: reject }));
    if (!active()) return 0;
    const accepted = templates.filter(id => result[id] === 'accept').length;
    const count = Number(wx.getStorageSync(KEY) || 0) + accepted;
    wx.setStorageSync(KEY, count);
    return accepted;
  } catch (_) { return 0; }
}

function consume() {
  const count = Math.max(0, Number(wx.getStorageSync(KEY) || 0) - 1);
  wx.setStorageSync(KEY, count);
  return count;
}

function remaining() { return Math.max(0, Number(wx.getStorageSync(KEY) || 0)); }

module.exports = { request, consume, remaining };
