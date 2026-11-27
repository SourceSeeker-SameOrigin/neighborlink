const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { toFen } = require('../../utils/money');
Page({
  data: { ready: false, loadError: false, loading: true, busy: false, error: '', itemId: '', scope: 'community', federationEnabled: false,
    scopeOptions: ['本小区', '联合社区'],
    escrowEnabled: false, tradeModes: ['线下信息交易', '平台担保交易'], tradeModeValues: ['offline', 'escrow'], tradeModeIndex: 0,
    title: '', desc: '', category: '', priceYuan: '', condition: 'used', conditionOptions: ['全新', '几乎全新', '有使用痕迹'],
    conditionValues: ['new', 'like_new', 'used'], conditionIndex: 2, negotiable: true, images: [] },
  onLoad(options) { this.itemId = options.id || ''; this.setData({ itemId: this.itemId }); this.requestId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2); },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.readSequence = (this.readSequence || 0) + 1; this.setData({ ready: false }); },
  onUnload() { this.closed = true; this.readSequence = (this.readSequence || 0) + 1; this.setData({ ready: false }); },
  currentCreate() { const user = getApp().globalData.user; return !this.hidden && !this.closed && !!this.user &&
    user?._id === this.user._id && user?.communityId === this.user.communityId && this.data.ready; },
  clearOtherDraft() {
    this.pendingPhotos = null; this.requestId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    this.setData({ title: '', desc: '', category: '', priceYuan: '', condition: 'used', conditionIndex: 2,
      negotiable: true, images: [], scope: 'community', tradeModeIndex: 0, tradeMode: 'offline', busy: false });
    this.draftInitialized = false;
  },
  async load() {
    if (this.loadInFlight) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.loadInFlight = true;
    this.setData({ loading: true, ready: false, loadError: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      if (this.user && (this.user._id !== user._id || this.user.communityId !== user.communityId)) this.clearOtherDraft();
      this.user = user;
      const community = await api.call('catalog', 'getCommunity', { communityId: user.communityId }, { loading: false, silent: true });
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      if (!community.enabledFeatures.idle) throw new Error('闲置交易暂未开放');
      this.setData({ federationEnabled: community.enabledFeatures.federation, escrowEnabled: community.enabledFeatures.idleEscrow });
      if (this.itemId) {
        const result = await api.call('idle', 'detail', { itemId: this.itemId }, { loading: false, silent: true });
        if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
        const item = result.item;
        if (!item.seller) throw new Error('无权编辑此商品');
        const conditionIndex = this.data.conditionValues.indexOf(item.condition);
        if (!this.draftInitialized) this.setData({ title: item.title, desc: item.desc, category: item.category, priceYuan: (item.price / 100).toFixed(2),
          condition: item.condition, conditionIndex, negotiable: item.negotiable, scope: item.scope, images: item.images,
          tradeMode: item.tradeMode, tradeModeIndex: this.data.tradeModeValues.indexOf(item.tradeMode) });
        this.draftInitialized = true;
      }
      this.setData({ ready: true });
      if (this.pendingPhotos?.userId === user._id && this.pendingPhotos.communityId === user.communityId) {
        this.setData({ images: this.pendingPhotos.files }); this.pendingPhotos = null;
      }
    } catch (error) { if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ loadError: true, error: error.message || '页面加载失败' }); }
    finally { this.loadInFlight = false; if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  field(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  switch(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  scope(event) { this.setData({ scope: Number(event.detail.value) === 1 ? 'federation' : 'community' }); },
  tradeMode(event) { const tradeModeIndex = Number(event.detail.value); this.setData({ tradeModeIndex,
    tradeMode: this.data.tradeModeValues[tradeModeIndex] }); },
  condition(event) { const conditionIndex = Number(event.detail.value); this.setData({ conditionIndex, condition: this.data.conditionValues[conditionIndex] }); },
  async photos() {
    if (!this.currentCreate() || this.data.loading || this.data.busy) return;
    const userId = this.user._id, communityId = this.user.communityId;
    try { const files = await uploadPhotos('idle/' + userId, 9);
      if (getApp().globalData.user?._id !== userId || getApp().globalData.user?.communityId !== communityId) return;
      if (this.currentCreate()) this.setData({ images: files });
      else if (!this.closed) this.pendingPhotos = { userId, communityId, files };
    } catch (error) { if (this.currentCreate()) this.setData({ error: error.message || '图片上传失败' }); }
  },
  async submit() {
    if (!this.currentCreate() || this.data.loading || this.data.busy) return;
    const ownerId = this.user._id, communityId = this.user.communityId, sequence = this.readSequence;
    const price = toFen(this.data.priceYuan);
    if (!price || price < 1) { this.setData({ error: '请填写有效的价格' }); return; }
    this.setData({ busy: true, error: '' });
    const item = { title: this.data.title, desc: this.data.desc, category: this.data.category || '其他', price,
      condition: this.data.condition, tradeMode: this.data.tradeMode || 'offline', negotiable: this.data.negotiable, images: this.data.images,
      scope: this.data.scope };
    try {
      let result;
      if (this.itemId) result = await api.call('idle', 'update', { itemId: this.itemId, item });
      else result = await api.call('idle', 'create', { requestId: this.requestId, communityId: this.user.communityId, item });
      if (!this.currentCreate() || this.readSequence !== sequence || this.user._id !== ownerId || this.user.communityId !== communityId) return;
      if (result.imageWarnings && result.imageWarnings.length) wx.showToast({ title: '商品已发布，部分图片未提交审核', icon: 'none' });
      wx.redirectTo({ url: '/idle/detail/detail?id=' + encodeURIComponent(result.itemId || this.itemId) });
    } catch (error) { if (this.currentCreate() && this.readSequence === sequence) this.setData({ error: error.message || '发布失败' }); }
    finally { if (this.currentCreate() && this.readSequence === sequence) this.setData({ busy: false }); }
  }
});
