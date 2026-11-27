const api = require('../../utils/api');
const { lifecycle, currentVisit, currentUserAction } = require('../../utils/visible-list');
const { uploadPhotos } = require('../../utils/media');
const { ymd, addDays } = require('../../utils/time');
const { toFen } = require('../../utils/money');
const { pay } = require('../../utils/payment');
const { fingerprint } = require('../../utils/intent-fingerprint');
Page({
  data: { ready: false, loadError: false, loading: true, busy: false, error: '', recoveryHint: '', lookupError: false,
    createdPostId: '', createdOrderId: '', type: 'ask', title: '', content: '', scope: 'community',
    federationEnabled: false, scopeOptions: ['本小区', '联合社区'], directionOptions: ['求帮带', '我能帮带'],
    destinationTypes: ['境内', '境外'], direction: 'request', destination: '', destinationType: 'domestic',
    departDate: '', departTime: '09:00', returnDate: '', returnTime: '18:00', disclaimerAgreed: false, images: [],
    rewardYuan: '3.00', needEnterHome: false, slotDate: '', today: '', slotOptions: [], slotIndex: 0, slotLabel: '' },
  onLoad(options) { this.requestId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    const type = ['task', 'carry'].includes(options.type) ? options.type : 'ask';
    const today = ymd(new Date());
    this.setData({ type, scope: 'community', departDate: today, returnDate: today,
      slotDate: type === 'task' ? ymd(addDays(new Date(), 1)) : today, today }); },
  ...lifecycle,
  onShow() {
    if (this._hidden) this.setData({ busy: false });
    return lifecycle.onShow.call(this);
  },
  currentCreate() { const user = getApp().globalData.user; return currentVisit(this)() && !!this.user &&
    user?._id === this.user._id && user?.communityId === this.user.communityId && this.data.ready; },
  clearOtherDraft() {
    this.pendingPhotos = null; this.requestId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    this.pendingRequest = null; this.lookupChecked = false;
    this.setData({ title: '', content: '', images: [], scope: 'community', rewardYuan: '3.00',
      destination: '', disclaimerAgreed: false, needEnterHome: false, busy: false,
      recoveryHint: '', lookupError: false, createdPostId: '', createdOrderId: '' });
  },
  storageKey(userId) { return 'board_create_pending_' + this.data.type + '_' + userId; },
  restoreRequest(user) {
    if (this.pendingRequest) return;
    try {
      const saved = wx.getStorageSync(this.storageKey(user._id));
      if (saved?.userId === user._id && saved.communityId === user.communityId && saved.type === this.data.type) {
        this.pendingRequest = saved; this.requestId = saved.requestId; this.lookupChecked = false;
      }
    } catch (_) {}
  },
  clearRequest() {
    const requestId = this.pendingRequest?.requestId;
    const ownerId = this.pendingRequest?.userId;
    this.pendingRequest = null; this.lookupChecked = false;
    if (requestId) try {
      const key = this.storageKey(ownerId);
      const saved = wx.getStorageSync(key);
      if (saved?.requestId === requestId) wx.removeStorageSync(key);
    } catch (_) {}
  },
  async checkOriginal(active) {
    if (!this.pendingRequest || this.lookupChecked) return;
    try {
      const result = await api.call('board', 'lookupRequest', { requestId: this.pendingRequest.requestId },
        { loading: false, silent: true, isActive: active });
      if (!active()) return;
      this.lookupChecked = true;
      if (result.postId) {
        this.setData({ createdPostId: result.postId, createdOrderId: result.orderId || '', lookupError: false,
          recoveryHint: '已找到上次发布的内容，请前往原记录。' });
      } else this.setData({ lookupError: false, recoveryHint: '暂未查到上次发布。请重填并核对原内容，再用原编号提交。' });
    } catch (error) {
      if (active()) this.setData({ lookupError: true, recoveryHint: '上次发布结果待核对，请先重试读取。',
        error: error.message || '核对原发布失败' });
    }
  },
  startNewRequest() {
    if (!this.currentCreate() || this.data.busy || this.data.lookupError) return;
    this.clearRequest(); this.requestId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    this.setData({ recoveryHint: '', createdPostId: '', createdOrderId: '', error: '' });
  },
  openCreated() {
    if (!this.currentCreate() || !this.data.createdPostId) return;
    const url = this.data.createdOrderId ? '/pages/orders/detail?id=' + encodeURIComponent(this.data.createdOrderId)
      : '/board/detail/detail?id=' + encodeURIComponent(this.data.createdPostId);
    wx.redirectTo({ url });
  },
  async load() {
    if (this.loadInFlight) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.loadInFlight = true;
    this.setData({ loading: true, ready: false, loadError: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      if (this.user && (this.user._id !== user._id || this.user.communityId !== user.communityId)) this.clearOtherDraft();
      this.user = user;
      this.restoreRequest(user);
      const community = await api.call('catalog', 'getCommunity', { communityId: user.communityId }, { loading: false, silent: true });
      if (!currentVisit(this)() || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      if (!community.enabledFeatures.board || (this.data.type === 'carry' && !community.enabledFeatures.travelCarry)) throw new Error('此功能暂未开放');
      const slotOptions = (community.dutyWindows || []).map(window => ({ ...window, label: window.start + '—' + window.end }));
      if (this.data.type === 'task' && !slotOptions.length) throw new Error('小区尚未配置值班时段，暂不能发布悬赏');
      this.setData({ federationEnabled: this.data.type !== 'task' && community.enabledFeatures.federation,
        slotOptions, slotLabel: slotOptions[this.data.slotIndex] ? slotOptions[this.data.slotIndex].label : '',
        slotIndex: this.data.slotIndex });
      this.setData({ ready: true });
      await this.checkOriginal(() => currentVisit(this)() && sequence === this.readSequence &&
        getApp().globalData.user?._id === user._id && getApp().globalData.user?.communityId === user.communityId);
      if (this.pendingPhotos?.userId === user._id && this.pendingPhotos.communityId === user.communityId) {
        this.setData({ images: this.pendingPhotos.files }); this.pendingPhotos = null;
      }
    } catch (error) { if (currentVisit(this)() && sequence === this.readSequence) this.setData({ loadError: true, error: error.message || '页面初始化失败' }); }
    finally { this.loadInFlight = false; if (currentVisit(this)() && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  field(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  choose(event) {
    const field = event.currentTarget.dataset.field;
    const value = Number(event.detail.value);
    if (field === 'direction') this.setData({ direction: value === 1 ? 'offer' : 'request' });
    else if (field === 'destinationType') this.setData({ destinationType: value === 1 ? 'overseas' : 'domestic' });
    else if (field === 'slotIndex') {
      const slotIndex = Number(event.detail.value);
      this.setData({ slotIndex, slotLabel: this.data.slotOptions[slotIndex].label });
    }
    else this.setData({ [field]: event.detail.value });
  },
  agree(event) { this.setData({ disclaimerAgreed: event.detail.value.includes('agree') }); },
  toggleEnterHome(event) { this.setData({ needEnterHome: event.detail.value.includes('yes') }); },
  scope(event) { this.setData({ scope: Number(event.detail.value) === 1 ? 'federation' : 'community' }); },
  async photos() {
    if (!this.currentCreate() || this.data.loading || this.data.busy) return;
    const userId = this.user._id, communityId = this.user.communityId;
    try { const files = await uploadPhotos('board/' + userId, 3);
      if (getApp().globalData.user?._id !== userId || getApp().globalData.user?.communityId !== communityId) return;
      if (this.currentCreate()) this.setData({ images: files });
      else if (!this._unloaded) this.pendingPhotos = { userId, communityId, files };
    } catch (error) { if (this.currentCreate()) this.setData({ error: error.message || '图片上传失败' }); }
  },
  async submit() {
    if (!this.currentCreate() || this.data.loading || this.data.busy) return;
    if (this.data.createdPostId) { this.openCreated(); return; }
    if (this.data.lookupError || (this.pendingRequest && !this.lookupChecked)) {
      this.setData({ error: '请先核对上次发布结果' }); return;
    }
    const ownerId = this.user._id, communityId = this.user.communityId, sequence = this.readSequence;
    const current = () => this.currentCreate() && this.readSequence === sequence &&
      this.user._id === ownerId && this.user.communityId === communityId;
    this.setData({ busy: true, error: '' });
    try {
      const data = { requestId: this.requestId,
        communityId: this.user.communityId, type: this.data.type, scope: this.data.scope,
        title: this.data.title, content: this.data.content, images: this.data.images };
      if (this.data.type === 'task') {
        const reward = toFen(this.data.rewardYuan);
        if (!reward || reward < 300) throw new Error('悬赏金额至少为 3.00 元');
        const selectedWindow = this.data.slotOptions[this.data.slotIndex];
        if (!selectedWindow) throw new Error('请选择小区值班时段');
        data.reward = reward;
        data.needEnterHome = this.data.needEnterHome;
        data.slot = { date: this.data.slotDate, start: selectedWindow.start, end: selectedWindow.end };
      }
      if (this.data.type === 'carry') data.carry = { direction: this.data.direction, destination: this.data.destination,
        destinationType: this.data.destinationType, departAt: new Date(this.data.departDate + 'T' + this.data.departTime + ':00+08:00'),
        returnAt: this.data.returnDate && this.data.returnTime ? new Date(this.data.returnDate + 'T' + this.data.returnTime + ':00+08:00') : null,
        disclaimerAgreed: this.data.disclaimerAgreed };
      const intentHash = fingerprint({ ...data, requestId: undefined });
      if (this.pendingRequest && this.pendingRequest.intentHash !== intentHash)
        throw new Error('内容与上次发布不同，请核对原内容，或明确开始新发布');
      if (!this.pendingRequest) {
        this.pendingRequest = { userId: ownerId, communityId, type: this.data.type,
          requestId: this.requestId, intentHash };
        try { wx.setStorageSync(this.storageKey(ownerId), this.pendingRequest); } catch (_) {}
      }
      const result = await api.call('board', 'create', data, { isActive: current });
      if (!current()) return;
      this.lookupChecked = true;
      this.setData({ createdPostId: result.postId, createdOrderId: result.orderId || '', recoveryHint: '', lookupError: false });
      if (result.imageWarnings.length) wx.showToast({ title: '内容已发布，部分图片未提交审核', icon: 'none' });
      if (this.data.type === 'task') {
        if (result.paymentError || !result.payment) {
          wx.redirectTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(result.orderId) }); return;
        }
        const paid = await pay({ ...result.payment, orderId: result.orderId }, current);
        if (!current()) return;
        if (!paid) { wx.redirectTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(result.orderId) }); return; }
      }
      wx.redirectTo({ url: '/board/detail/detail?id=' + encodeURIComponent(result.postId) });
    } catch (error) {
      if (current()) {
        if (this.pendingRequest && !this.data.createdPostId) {
          this.lookupChecked = false;
          await this.checkOriginal(current);
        }
        if (current() && !this.data.createdPostId) this.setData({ error: error.message || '发布结果待核对' });
      }
    }
    finally { if (current()) this.setData({ busy: false }); }
  }
});
