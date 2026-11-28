const api = require('../../utils/api');
const { lifecycle, currentVisit, currentUserAction } = require('../../utils/visible-list');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { pay } = require('../../utils/payment');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', item: null,
    recovery: '', recoveryHint: '' },
  onLoad(options = {}) {
    this.itemId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.itemId, loading: !!this.itemId });
  },
  ...lifecycle,
  onShow() {
    if (this._hidden) this.setData({ busy: false });
    return lifecycle.onShow.call(this);
  },
  onHide() { lifecycle.onHide.call(this); this.readSequence = (this.readSequence || 0) + 1;
    this.setData({ item: null, busy: false, recovery: '', recoveryHint: '' }); },
  onUnload() { lifecycle.onUnload.call(this); this.readSequence = (this.readSequence || 0) + 1;
    this.setData({ item: null, busy: false, recovery: '', recoveryHint: '' }); },
  currentDetail(sequence = this.readSequence) { const user = getApp().globalData.user; return currentVisit(this)() &&
    sequence === this.readSequence && !!this.ownerId && user?._id === this.ownerId &&
    user?.communityId === this.ownerCommunityId && this.data.item?._id === this.itemId; },
  receiptKey(userId) { return 'idle_purchase:' + userId + ':' + this.itemId; },
  clearReceipt() {
    if (!this.receipt || !this.ownerId) return;
    const key = this.receiptKey(this.ownerId);
    try { if (wx.getStorageSync(key)?.requestId === this.receipt.requestId) wx.removeStorageSync(key); } catch (_) {}
    this.receipt = null;
  },
  openOriginal() {
    if (!this.orderId || !currentVisit(this)() || getApp().globalData.user?._id !== this.ownerId ||
        getApp().globalData.user?.communityId !== this.ownerCommunityId || this.navigating) return;
    const orderId = this.orderId;
    this.navigating = true;
    wx.navigateTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(orderId),
      success: () => this.clearReceipt(),
      fail: () => { if (currentVisit(this)()) this.setData({ error: '订单已建立，请重试打开原订单' }); },
      complete: () => { this.navigating = false; } });
  },
  async checkOriginal(current) {
    if (!this.receipt || !current()) return;
    try {
      const result = await api.call('idle', 'lookupPurchase', { itemId: this.itemId, requestId: this.receipt.requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (result.orderId) {
        this.orderId = result.orderId;
        this.setData({ recovery: 'found', recoveryHint: '已找到上次购买的订单，请前往原订单。' });
      } else this.setData({ recovery: 'confirm', recoveryHint: '未查到上次订单，请核对商品后用原编号提交。' });
    } catch (error) {
      if (current()) this.setData({ recovery: 'lookup', recoveryHint: '购买结果待核对，请先重试读取。',
        error: error.message || '原订单核对失败' });
    }
  },
  startNewPurchase() {
    if (!this.currentDetail() || this.data.busy || this.data.recovery !== 'confirm') return;
    this.clearReceipt(); this.orderId = '';
    this.setData({ recovery: '', recoveryHint: '', error: '' });
  },
  async load() {
    if (!this.itemId) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.setData({ loading: true, error: '', item: null, recovery: '', recoveryHint: '' });
    try {
      const user = await getApp().ensureSession();
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      if (this.ownerId && this.ownerId !== user._id) { this.receipt = null; this.orderId = ''; }
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const current = () => currentVisit(this)() && sequence === this.readSequence &&
        getApp().globalData.user?._id === user._id && getApp().globalData.user?.communityId === user.communityId;
      try {
        const saved = wx.getStorageSync(this.receiptKey(user._id));
        this.receipt = saved?.userId === user._id && saved.itemId === this.itemId ? saved : null;
      } catch (_) { this.receipt = null; }
      if (this.receipt) await this.checkOriginal(current);
      if (!current()) return;
      const result = await api.call('idle', 'detail', { itemId: this.itemId },
        { loading: false, silent: true, isActive: current });
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      const item = result.item;
      const conditionText = { new: '全新', like_new: '几乎全新', used: '有使用痕迹' }[item.condition] || item.condition;
      this.setData({ item: { ...item, timeText: display(item.createdAt), priceText: yuan(item.price), conditionText } });
      wx.setNavigationBarTitle({ title: item.title });
      if (this.data.recovery === 'found') this.openOriginal();
    } catch (error) { if (currentVisit(this)() && sequence === this.readSequence) {
      this.setData({ error: error.message || '商品加载失败' });
      if (this.data.recovery === 'found') this.openOriginal();
    } }
    finally { if (currentVisit(this)() && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  preview(event) {
    if (!this.currentDetail()) return; require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: this.data.item.images }); },
  async contact() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    try {
      const result = await api.call('idle', 'contact', { itemId: this.itemId },
        { isActive: () => this.currentDetail(sequence) });
      if (this.currentDetail(sequence)) wx.makePhoneCall({ phoneNumber: result.phone });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '暂时无法联系卖家' }); }
  },
  async want() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call('chat', 'openIdle', { itemId: this.itemId },
        { isActive: () => this.currentDetail(sequence) });
      if (this.currentDetail(sequence)) wx.navigateTo({ url: '/chat/room/room?conversationId=' + encodeURIComponent(result.conversationId) });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '无法打开聊天' }); }
    finally { if (this.currentDetail(sequence)) this.setData({ busy: false }); }
  },
  async buy() {
    if (!this.currentDetail()) return;
    if (this.data.busy) return;
    if (this.data.recovery === 'lookup') return this.load();
    if (this.data.recovery === 'found') return this.openOriginal();
    if (this.receipt && this.data.recovery !== 'confirm') return;
    if (this.data.item.status !== 'on_sale') return;
    if (this.receipt && this.receipt.price !== this.data.item.price) {
      this.setData({ error: '商品价格已变化，请明确开始新购买' }); return;
    }
    const sequence = this.readSequence;
    const current = () => this.currentDetail(sequence);
    const answer = await new Promise(resolve => wx.showModal({ title: '担保交易',
      content: '支付后商品将为你保留；收到商品后请在 72 小时内确认。', success: resolve }));
    if (!answer.confirm || !current() || this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const requestId = this.receipt?.requestId || 'idle_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      if (!this.receipt) {
        this.receipt = { userId: this.ownerId, itemId: this.itemId, requestId, price: this.data.item.price };
        wx.setStorageSync(this.receiptKey(this.ownerId), this.receipt);
      }
      const result = await api.call('idle', 'buy', { itemId: this.itemId, requestId }, { isActive: current });
      if (!current()) return;
      if (!result?.orderId) throw Error('购买结果待核对');
      this.orderId = result.orderId;
      this.setData({ recovery: 'found', recoveryHint: '订单已建立，请前往原订单。' });
      if (result.recovered || result.paymentError) { this.openOriginal(); return; }
      await pay(result, current);
      if (!current()) return;
      this.openOriginal();
    } catch (error) {
      if (current()) {
        if (this.receipt && !this.orderId) await this.checkOriginal(current);
        if (current() && this.data.recovery !== 'found') this.setData({ error: error.message || '购买结果待核对' });
        if (current() && this.data.recovery === 'found') this.openOriginal();
      }
    }
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
    try { await api.call('idle', 'markSold', { itemId: this.itemId },
      { isActive: () => this.currentDetail(sequence) }); if (this.currentDetail(sequence)) await this.load(); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '操作失败' }); }
  },
  async remove() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '下架闲置', content: '下架后邻居将看不到此商品。确定吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('idle', 'remove', { itemId: this.itemId },
      { isActive: () => this.currentDetail(sequence) }); if (this.currentDetail(sequence)) await this.load(); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '操作失败' }); }
  },
  async report() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '举报内容', content: '确认举报此闲置？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('idle', 'report', { itemId: this.itemId, reason: '不当内容' },
      { isActive: () => this.currentDetail(sequence) }); if (this.currentDetail(sequence)) wx.showToast({ title: '已提交举报', icon: 'success' }); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '举报失败' }); }
  },
  onShareAppMessage() {
    if (!this.itemId) return { title: '闲置列表', path: '/idle/list/list' }; return { title: this.data.item && this.data.item.title || '邻居闲置',
    path: '/idle/detail/detail?id=' + encodeURIComponent(this.itemId) }; }
});
