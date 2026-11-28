const api = require('../utils/api');
const { lifecycle, readList } = require('../utils/visible-list');

Page({
  ...lifecycle,
  data: { missingRecord: false, loading: true, error: '', visits: [] },

  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onHide() {
    lifecycle.onHide.call(this);
    this.setData({ visits: [] });
  },
  onUnload() {
    lifecycle.onUnload.call(this);
    this.setData({ visits: [] });
  },
  load() {
    if (!this.orderId) return;
    return readList(this, { visits: [] }, '记录加载失败，请重试', async (_, options) => {
      const result = await api.call('pet', 'listVisits', { orderId: this.orderId }, {
        ...options, redirectOnForbidden: false, mediaRedirectOnForbidden: false
      });
      return { visits: result.list || [] };
    });
  }
});
