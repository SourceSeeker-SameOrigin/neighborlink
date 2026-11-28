const api = require('../../utils/api');
const { merchantStatusNames } = require('../../utils/status-labels');
Page({
  data: { loading: true, error: '', merchant: null, merchantStatusNames },
  onShow() { this.visible = true; return this.load(); },
  onHide() {
    this.visible = false;
    this.read = (this.read || 0) + 1;
    // 保留 QA17 的数据快照，但返回重新核验前不展示业务内容。
    this.setData({ loading: true, error: '' });
  },
  onUnload() { this.visible = false; this.read = (this.read || 0) + 1; },
  async load() {
    if (!this.visible) return;
    const read = this.read = (this.read || 0) + 1;
    const app = getApp();
    let userId = app.globalData.user?._id;
    const current = () => this.visible && this.read === read &&
      (!userId || app.globalData.user?._id === userId);
    this.setData({ loading: true, error: '' });
    try {
      const user = await app.ensureSession();
      if (!current()) return;
      userId = user?._id;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      const result = await api.call('merchant', 'myApplication', {},
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      this.setData({ merchant: result.merchant });
    } catch (error) { if (current()) this.setData({ error: error.message || '工作台加载失败' }); }
    finally { if (current()) this.setData({ loading: false }); }
  },
  apply() { wx.navigateTo({ url: '/merchant/apply/apply' }); },
  services() { wx.navigateTo({ url: '/merchant/services/services' }); },
  orders() { wx.navigateTo({ url: '/merchant/orders/orders' }); }
});
