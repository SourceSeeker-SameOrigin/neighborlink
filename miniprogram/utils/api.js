let pending = 0;

async function call(name, action, data = {}, options = {}) {
  const loading = options.loading !== false;
  if (loading && pending++ === 0) wx.showLoading({ title: '请稍候', mask: true });
  try {
    const response = await wx.cloud.callFunction({ name, data: { ...data, action } });
    const result = response.result;
    if (!result || result.ok !== true) {
      const error = new Error(result && result.message || '服务暂不可用，请重试');
      error.code = result && result.code || 'E_INTERNAL';
      throw error;
    }
    if (result.data && result.data._media) {
      const links = require('./media-links');
      const snapshot = JSON.parse(JSON.stringify(data));
      const mediaRedirectOnForbidden = options.mediaRedirectOnForbidden;
      links.register(result.data._media, () => call(name, action, snapshot, {
        loading: false, silent: true, redirectOnForbidden: mediaRedirectOnForbidden, mediaRedirectOnForbidden
      }));
      delete result.data._media;
    }
    return result.data;
  } catch (error) {
    const active = typeof options.isActive !== 'function' || options.isActive();
    if (active && !options.silent) wx.showToast({ title: error.message || '网络连接失败，请重试', icon: 'none' });
    if (active && options.redirectOnForbidden !== false && error.code === 'E_FORBIDDEN') wx.switchTab({ url: '/pages/index/index' });
    throw error;
  } finally {
    if (loading && --pending === 0) wx.hideLoading();
  }
}

module.exports = { call };
