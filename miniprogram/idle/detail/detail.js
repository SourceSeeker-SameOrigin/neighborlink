const api = require('../../utils/api');
const { lifecycle, currentVisit, currentUserAction } = require('../../utils/visible-list');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { pay } = require('../../utils/payment');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', item: null },
  onLoad(options = {}) {
    this.itemId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.itemId, loading: !!this.itemId });
  },
  ...lifecycle,
  onShow() {
    if (this._hidden) this.setData({ busy: false });
    return lifecycle.onShow.call(this);
  },
  onHide() { lifecycle.onHide.call(this); this.readSequence = (this.readSequence || 0) + 1; this.setData({ item: null, busy: false }); },
  onUnload() { lifecycle.onUnload.call(this); this.readSequence = (this.readSequence || 0) + 1; this.setData({ item: null, busy: false }); },
  currentDetail(sequence = this.readSequence) { const user = getApp().globalData.user; return currentVisit(this)() &&
    sequence === this.readSequence && !!this.ownerId && user?._id === this.ownerId &&
    user?.communityId === this.ownerCommunityId && this.data.item?._id === this.itemId; },
  async load() {
    if (!this.itemId) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.setData({ loading: true, error: '', item: null });
    try {
      const user = await getApp().ensureSession();
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const result = await api.call('idle', 'detail', { itemId: this.itemId }, { loading: false, silent: true });
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      const item = result.item;
      const conditionText = { new: '全新', like_new: '几乎全新', used: '有使用痕迹' }[item.condition] || item.condition;
      this.setData({ item: { ...item, timeText: display(item.createdAt), priceText: yuan(item.price), conditionText } });
      wx.setNavigationBarTitle({ title: item.title });
    } catch (error) { if (currentVisit(this)() && sequence === this.readSequence) this.setData({ error: error.message || '商品加载失败' }); }
    finally { if (currentVisit(this)() && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  preview(event) {
    if (!this.currentDetail()) return; require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: this.data.item.images }); },
  async contact() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    try {
      const result = await api.call('idle', 'contact', { itemId: this.itemId });
      if (this.currentDetail(sequence)) wx.makePhoneCall({ phoneNumber: result.phone });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '暂时无法联系卖家' }); }
  },
  async want() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call('chat', 'openIdle', { itemId: this.itemId });
      if (this.currentDetail(sequence)) wx.navigateTo({ url: '/chat/room/room?conversationId=' + encodeURIComponent(result.conversationId) });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '无法打开聊天' }); }
    finally { if (this.currentDetail(sequence)) this.setData({ busy: false }); }
  },
  async buy() {
    if (!this.currentDetail()) return;
    if (this.data.busy) return;
    const sequence = this.readSequence;
    const current = () => this.currentDetail(sequence);
    const answer = await new Promise(resolve => wx.showModal({ title: '担保交易',
      content: '支付后商品将为你保留；收到商品后请在 72 小时内确认。', success: resolve }));
    if (!answer.confirm || !current() || this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const requestId = 'idle_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      const result = await api.call('idle', 'buy', { itemId: this.itemId, requestId }, { isActive: current });
      if (!current()) return;
      if (result.paymentError) throw new Error('支付暂不可用，请在订单页重试');
      await pay(result, current);
      if (!current()) return;
      wx.navigateTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(result.orderId) });
      await this.load();
    } catch (error) { if (current()) this.setData({ error: error.message || '担保交易未完成' }); }
    finally { if (current()) this.setData({ busy: false }); }
  },
  carry() {
    if (!this.currentDetail()) return;
    const item = this.data.item;
    wx.navigateTo({ url: '/pages/service/help?idleTitle=' + encodeURIComponent(item.title) +
      '&idleDesc=' + encodeURIComponent(item.desc) });
  },
  edit() {
    if (!this.currentDetail()) return; wx.navigateTo({ url: '/idle/create/create?id=' + encodeURIComponent(this.itemId) }); },
  sales() { if (this.currentDetail()) wx.navigateTo({ url: '/idle/sales/sales' }); },
  async markSold() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '标记已售', content: '确认此商品已经线下售出？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('idle', 'markSold', { itemId: this.itemId }); if (this.currentDetail(sequence)) await this.load(); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '操作失败' }); }
  },
  async remove() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '下架闲置', content: '下架后邻居将看不到此商品。确定吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('idle', 'remove', { itemId: this.itemId }); if (this.currentDetail(sequence)) await this.load(); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '操作失败' }); }
  },
  async report() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '举报内容', content: '确认举报此闲置？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('idle', 'report', { itemId: this.itemId, reason: '不当内容' }); if (this.currentDetail(sequence)) wx.showToast({ title: '已提交举报', icon: 'success' }); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '举报失败' }); }
  },
  onShareAppMessage() {
    if (!this.itemId) return { title: '闲置列表', path: '/idle/list/list' }; return { title: this.data.item && this.data.item.title || '邻居闲置',
    path: '/idle/detail/detail?id=' + encodeURIComponent(this.itemId) }; }
});
