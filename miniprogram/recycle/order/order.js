const api = require('../../utils/api');
const { fingerprint } = require('../../utils/intent-fingerprint');
Page({
  data: { loading: true, busy: false, error: '', recoveryHint: '', lookupError: false,
    createdOrderId: '', navigating: false, navigationError: '', categories: [
    { code: 'paper', name: '纸类', selected: false }, { code: 'plastic', name: '塑料', selected: false },
    { code: 'metal', name: '金属', selected: false }, { code: 'clothing', name: '衣物', selected: false },
    { code: 'appliance', name: '小家电', selected: false }
  ], note: '', slots: [], slotIndex: 0, pricing: null },
  onLoad() { return this.load(); },
  onShow() {
    if (!this.hidden) return;
    this.hidden = false;
    this.setData({ busy: !!this.creating });
    return this.load();
  },
  onHide() { this.hidden = true; this.invalidateReads(); },
  onUnload() { this.closed = true; this.invalidateReads(); },
  invalidateReads() {
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.quoteSequence = (this.quoteSequence || 0) + 1;
    this.initializing = false;
  },
  currentOwner() {
    const user = getApp().globalData.user;
    if (!this.closed && !this.hidden && this.userId && user?._id === this.userId &&
        user.communityId === this.communityId) return true;
    if (this.userId && user?._id !== this.userId) {
      this.quoteSequence = (this.quoteSequence || 0) + 1;
      this.request = null;
      this.lookupChecked = false;
      this.receipt = null;
      this.setData({ createdOrderId: '', categories: this.data.categories.map(item => ({ ...item, selected: false })),
        note: '', slots: [], slotIndex: 0, pricing: null, quoting: false, navigating: false, navigationError: '' });
    }
    return false;
  },
  async load() {
    if (this.closed || this.hidden || this.initializing ||
        (this.creating && this.userId === getApp().globalData.user?._id)) return;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    const current = () => !this.closed && !this.hidden && sequence === this.loadSequence;
    this.quoteSequence = (this.quoteSequence || 0) + 1;
    this.initializing = true;
    this.setData({ loading: true, error: '', pricing: null, quoting: false });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (getApp().globalData.user?._id !== user._id) return;
      if (this.userId && (this.userId !== user._id || this.communityId !== user.communityId)) {
        this.request = null;
        this.lookupChecked = false;
        this.receipt = null;
        this._createSequence = (this._createSequence || 0) + 1;
        this.creating = false;
        this.setData({ categories: this.data.categories.map(item => ({ ...item, selected: false })),
          note: '', slots: [], slotIndex: 0, pricing: null, quoting: false, busy: false,
          createdOrderId: '', navigating: false, navigationError: '' });
      }
      this.userId = user._id;
      this.communityId = user.communityId;
      this.receiptKey = 'recycleOrderReceipt:' + user._id;
      this.requestKey = 'recycleOrderRequest:' + user._id + ':' + user.communityId;
      if (this.receipt && this.receipt.userId !== user._id) this.receipt = null;
      if (!this.receipt) {
        try {
          const saved = wx.getStorageSync(this.receiptKey);
          if (saved && saved.userId === user._id && typeof saved.orderId === 'string' && saved.orderId) this.receipt = { userId: saved.userId, orderId: saved.orderId };
        } catch (_) { /* In-memory recovery remains available if storage cannot be read. */ }
      }
      this.setData({ createdOrderId: this.receipt ? this.receipt.orderId : '', navigating: false, navigationError: '' });
      if (this.receipt) return;
      if (!this.request) {
        try {
          const saved = wx.getStorageSync(this.requestKey);
          if (saved && saved.userId === user._id && saved.communityId === user.communityId &&
              typeof saved.requestId === 'string' && typeof saved.intentHash === 'string') {
            this.request = { requestId: saved.requestId, intentHash: saved.intentHash };
            this.setData({ categories: this.data.categories.map(item =>
              ({ ...item, selected: Array.isArray(saved.categories) && saved.categories.includes(item.code) })) });
            this.pendingSlot = saved.slot;
          }
        } catch (_) { /* The current page can still retry its in-memory request. */ }
      }
      if (this.request && !this.lookupChecked) {
        const result = await api.call('order', 'lookupRequest', { requestId: this.request.requestId },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
        if (!current()) return;
        if (!result || !Object.prototype.hasOwnProperty.call(result, 'orderId')) throw Error('未能核实上次预约，请重新查询');
        this.lookupChecked = true;
        if (result.orderId) {
          this.receipt = { userId: user._id, orderId: result.orderId };
          this.request = null;
          this.setData({ createdOrderId: result.orderId, recoveryHint: '', lookupError: false });
          try { wx.setStorageSync(this.receiptKey, this.receipt); wx.removeStorageSync(this.requestKey); } catch (_) {}
          this.openCreatedOrder();
          return;
        }
        this.setData({ recoveryHint: '暂未查到上次预约。请重填备注并核对类别、时段，再用原编号重试。', lookupError: false });
      }
      await this.refreshQuote();
    } catch (error) { if (current()) this.setData({ error: error.message || '登录状态不可用', lookupError: Boolean(this.request && !this.lookupChecked) }); }
    finally { if (current()) { this.initializing = false; this.setData({ loading: false }); } }
  },
  async category(event) {
    if (!this.currentOwner() || this.data.loading || this.data.busy || this.receipt) return;
    const code = event.currentTarget.dataset.code;
    const categories = this.data.categories.map(item => item.code === code ? { ...item, selected: !item.selected } : item);
    this.setData({ categories, pricing: null, error: '' });
    return this.refreshQuote();
  },
  async refreshQuote() {
    if (!this.currentOwner() || this.receipt) return;
    const sequence = this.quoteSequence = (this.quoteSequence || 0) + 1;
    const userId = this.userId, communityId = this.communityId;
    const current = () => !this.closed && !this.hidden && !this.receipt && sequence === this.quoteSequence &&
      getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId;
    const categories = this.data.categories;
    this.setData({ pricing: null, slots: [], error: '', quoting: false });
    if (!categories.some(item => item.selected)) return;
    if (!this.communityId) { this.setData({ error: '请先选择小区并重新加载' }); return; }
    this.setData({ quoting: true });
    try {
      const result = await api.call('order', 'quote', { serviceCode: 'recycle', communityId: this.communityId,
        detail: { categories: categories.filter(item => item.selected).map(item => item.code), note: this.data.note }, metadata: true },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      const restoredIndex = this.pendingSlot && result.slots.findIndex(item => JSON.stringify(item) === JSON.stringify(this.pendingSlot));
      const slotIndex = restoredIndex >= 0 ? restoredIndex : Math.min(this.data.slotIndex, Math.max(0, result.slots.length - 1));
      this.setData({ slots: result.slots, slotIndex, pricing: result.pricing,
        error: result.validationMessage || (result.slots.length ? '' : '暂无可预约时段') });
    } catch (error) { if (current()) this.setData({ error: error.message || '暂时无法报价' }); }
    finally { if (current()) this.setData({ quoting: false }); }
  },
  note(event) { if (this.currentOwner() && !this.data.busy && !this.receipt) this.setData({ note: event.detail.value }); },
  selectSlot(event) { if (this.currentOwner() && !this.data.busy && !this.receipt) this.setData({ slotIndex: Number(event.detail.value) }); },
  startNewRequest() {
    if (!this.currentOwner() || !this.request || !this.lookupChecked || this.data.busy) return;
    const requestId = this.request.requestId;
    this.request = null;
    this.lookupChecked = false;
    try {
      const saved = wx.getStorageSync(this.requestKey);
      if (saved && saved.requestId === requestId) wx.removeStorageSync(this.requestKey);
    } catch (_) {}
    this.setData({ recoveryHint: '', error: '' });
  },
  openCreatedOrder() {
    const receipt = this.receipt;
    if (!this.currentOwner() || !receipt || receipt.userId !== this.userId || this.data.navigating) return;
    const key = 'recycleOrderReceipt:' + receipt.userId;
    this.setData({ navigating: true, navigationError: '' });
    const fail = () => {
      if (this.currentOwner()) this.setData({ navigating: false,
        navigationError: '预约已创建，暂未打开详情，请点击下方按钮重试。不会重复预约。' });
    };
    try {
      wx.redirectTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(receipt.orderId), fail,
        success: () => {
          try {
            const saved = wx.getStorageSync(key);
            if (saved && saved.userId === receipt.userId && saved.orderId === receipt.orderId) wx.removeStorageSync(key);
          } catch (_) { /* A retained receipt can safely reopen the existing order. */ }
        } });
    } catch (_) { fail(); }
  },
  async create() {
    if (!this.currentOwner() || this.data.busy) return;
    if (this.receipt) { this.openCreatedOrder(); return; }
    if (this.data.loading || this.data.quoting || !this.data.pricing || !this.userId || this.data.lookupError) return;
    const categories = this.data.categories.filter(item => item.selected).map(item => item.code);
    const slot = this.data.slots[this.data.slotIndex];
    if (!categories.length || !slot) { this.setData({ error: '请选择回收类别和可预约时段' }); return; }
    const userId = this.userId, communityId = this.communityId, receiptKey = this.receiptKey;
    const createSequence = this._createSequence = (this._createSequence || 0) + 1;
    const current = () => !this.closed && !this.hidden && createSequence === this._createSequence &&
      getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId;
    this.creating = true;
    this.setData({ busy: true, error: '' });
    try {
      const payload = { serviceCode: 'recycle', communityId: this.communityId,
        detail: { categories, note: this.data.note }, slot };
      const signature = JSON.stringify(payload);
      const intentHash = fingerprint(payload);
      if (this.request && !this.lookupChecked) { this.setData({ error: '请先核对上次预约结果' }); return; }
      if (this.request && this.request.intentHash !== intentHash) {
        this.setData({ error: '当前内容与上次预约不同。请恢复原类别、备注和时段，或明确开始新预约。' }); return;
      }
      if (!this.request) this.request = {
        requestId: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2), intentHash };
      this.lookupChecked = true;
      try { wx.setStorageSync(this.requestKey, { userId, communityId, requestId: this.request.requestId,
        intentHash, categories, slot }); } catch (_) { /* In-memory retry remains available. */ }
      const requestId = this.request.requestId;
      const result = await api.call('order', 'create', { ...payload, requestId },
        { silent: true, redirectOnForbidden: false, isActive: current });
      if (!result || typeof result.orderId !== 'string' || !result.orderId) throw Error('未取得预约编号，请重试');
      const receipt = { userId, orderId: result.orderId };
      if (current()) { this.receipt = receipt; this.request = null; }
      try { wx.setStorageSync(receiptKey, receipt); } catch (_) { /* Keep the in-memory creation lock. */ }
      try { const saved = wx.getStorageSync(this.requestKey); if (saved?.requestId === requestId)
        wx.removeStorageSync(this.requestKey); } catch (_) {}
      if (!current()) return;
      this.setData({ createdOrderId: receipt.orderId, navigationError: '' });
      this.openCreatedOrder();
    } catch (error) { if (current()) this.setData({ error: error.message || '预约失败，请重试' }); }
    finally { if (createSequence === this._createSequence) { this.creating = false; if (current()) this.setData({ busy: false }); } }
  }
});
