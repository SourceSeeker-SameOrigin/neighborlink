const api = require('../../utils/api');
function amountFen(value) {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(String(value));
  if (!match) throw new Error('广告金额最多保留两位小数');
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 100000000) throw new Error('广告金额超出范围');
  return amount;
}
Page({
  data: { loading: true, saving: false, noticeReady: false, adReady: false,
    error: '', noticeError: '', adError: '', authorized: false, isAdmin: false,
    user: null, communityId: '', communities: [], communityIndex: 0, notices: [], ads: [], title: '', body: '', imageFileId: '', endAt: '', pinned: false,
    adTitle: '', adImage: '', adSlot: 'home_banner', adSlots: ['home_banner', 'board_top', 'shops_top'], adPath: '/shops/list/list', adStart: '', adEnd: '', adTargetType: 'page', adTargetId: '', adPrice: '0.00', adStatus: 'draft',
    adTargetTypes: ['page', 'merchant', 'event'], adStatuses: ['draft', 'live'],
    adSlotIndex: 0, adTargetTypeIndex: 0, adStatusIndex: 0, adPathIndex: 0,
    adSlotLabels: ['首页横幅', '需求广场顶部', '社区商家顶部'],
    adTargetTypeLabels: ['小程序页面', '商家', '活动'], adStatusLabels: ['草稿', '上线'],
    adStatusNames: { draft: '草稿', live: '上线', ended: '已结束' },
    adPathLabels: ['社区商家列表', '商家详情', '社区活动列表', '活动详情'],
    adPaths: ['/shops/list/list', '/shops/detail/detail', '/events/list/list', '/events/detail/detail'] },
  onLoad() { this._visible = true; return this.load(); },
  onShow() { if (this._wasHidden) { this._visible = true; return this.load(); } },
  onHide() {
    this._visible = false;
    this._wasHidden = true;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.noticeSequence = (this.noticeSequence || 0) + 1;
    this.adSequence = (this.adSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, saving: false, authorized: false, isAdmin: false,
      noticeReady: false, adReady: false, user: null, communities: [], notices: [], ads: [] });
  },
  onUnload() { this._closed = true; this.onHide(); },
  contextCurrent(context) {
    const user = getApp().globalData.user;
    return Boolean(context && this.readContext === context && this._visible !== false && !this._closed &&
      user && user._id === context.userId && Array.isArray(user.roles) &&
      (context.isAdmin ? user.roles.includes('admin') :
        user.roles.includes('property') && user.communityId === context.communityId));
  },
  currentRead() { return this.contextCurrent(this.readContext) && this.data.authorized && !this.data.loading; },
  clearDrafts() {
    this.setData({ title: '', body: '', imageFileId: '', endAt: '', pinned: false,
      adTitle: '', adImage: '', adTargetId: '', adStart: '', adEnd: '', adPrice: '0.00' });
  },
  invalidateIdentity(message = '登录身份已变化，请重新加载') {
    if (this._visible === false || this._closed) return;
    const userId = getApp().globalData.user?._id;
    if (this.draftOwnerId && userId !== this.draftOwnerId) this.clearDrafts();
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.noticeSequence = (this.noticeSequence || 0) + 1;
    this.adSequence = (this.adSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, saving: false, authorized: false, isAdmin: false,
      noticeReady: false, adReady: false, user: null, communities: [], notices: [], ads: [],
      communityId: '', error: message });
  },
  async load() {
    if (this._closed || this._visible === false) return;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    this.noticeSequence = (this.noticeSequence || 0) + 1;
    this.adSequence = (this.adSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: true, saving: false, noticeReady: false, adReady: false,
      error: '', noticeError: '', adError: '', authorized: false, isAdmin: false,
      user: null, communities: [], notices: [], ads: [] });
    let userId;
    const current = () => sequence === this.loadSequence && this._visible !== false && !this._closed &&
      (!userId || getApp().globalData.user?._id === userId);
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      if (!user.roles.includes('admin') && !user.roles.includes('property')) throw new Error('仅管理员或物业可管理内容');
      const isAdmin = user.roles.includes('admin');
      if (this.draftOwnerId && this.draftOwnerId !== userId) {
        this.clearDrafts(); this.setData({ communityId: '' });
      }
      this.draftOwnerId = userId;
      const context = this.readContext = { userId, isAdmin, communityId: user.communityId, sequence };
      this.setData({ user, isAdmin, authorized: true });
      await Promise.all([this.prepareNotices(user, context), isAdmin ? this.loadAds(context) : Promise.resolve()]);
    } catch (error) { if (current()) this.setData({ error: error.message || '加载失败' }); }
    finally {
      if (current()) this.setData({ loading: false });
      else if (sequence === this.loadSequence && this._visible !== false && !this._closed) this.invalidateIdentity();
    }
  },
  async prepareNotices(user, context = this.readContext) {
    try {
      let communities = [];
      if (user.roles.includes('admin')) {
        let result;
        do {
          result = await api.call('catalog', 'listCommunities', { offset: communities.length }, { loading: false, silent: true });
          if (!this.contextCurrent(context)) return;
          communities.push(...result.list);
        } while (result.hasMore);
      } else {
        if (!user.communityId) throw new Error('尚未分配物业服务小区');
        communities = [await api.call('catalog', 'getCommunity', { communityId: user.communityId }, { loading: false, silent: true })];
      }
      if (!this.contextCurrent(context)) return;
      const communityIndex = Math.max(0, communities.findIndex(item => item._id === (this.data.communityId || user.communityId)));
      this.setData({ communities, communityIndex, communityId: (communities[communityIndex] || {})._id || '' });
      await this.loadNotices();
    } catch (error) { if (this.contextCurrent(context)) this.setData({ noticeError: error.message || '小区加载失败', notices: [], communities: [], communityId: '' }); }
  },
  async loadNotices() {
    const context = this.readContext;
    if (!this.contextCurrent(context)) { this.invalidateIdentity(); return; }
    const sequence = this.noticeSequence = (this.noticeSequence || 0) + 1;
    const communityId = this.data.communityId;
    const current = () => sequence === this.noticeSequence && this.contextCurrent(context) && this.data.communityId === communityId;
    this.setData({ noticeReady: false, noticeError: '', notices: [] });
    try {
      if (!communityId) throw new Error('请先配置并选择管理小区');
      const result = await api.call('content', 'listNotices', { communityId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (current()) this.setData({ noticeReady: true, notices: result.list || [] });
    } catch (error) { if (current()) this.setData({ noticeError: error.message || '公告加载失败' }); }
    finally { if (!current() && this.readContext === context && !this.contextCurrent(context)) this.invalidateIdentity(); }
  },
  async loadAds(context = this.readContext) {
    if (!this.contextCurrent(context) || !context.isAdmin) { this.invalidateIdentity(); return; }
    const sequence = this.adSequence = (this.adSequence || 0) + 1;
    const current = () => sequence === this.adSequence && this.contextCurrent(context);
    this.setData({ adReady: false, adError: '', ads: [] });
    try {
      const result = await api.call('content', 'listAds', {},
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (current()) this.setData({ adReady: true, ads: result.list || [] });
    } catch (error) { if (current()) this.setData({ adError: error.message || '广告加载失败' }); }
    finally { if (!current() && this.readContext === context && !this.contextCurrent(context)) this.invalidateIdentity(); }
  },
  async chooseCommunity(event) {
    if (!this.data.isAdmin || this.data.saving || this.data.loading) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const communityIndex = Number(event.detail.value), community = this.data.communities[communityIndex];
    if (!community) return;
    this.setData({ communityIndex, communityId: community._id });
    await this.loadNotices();
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  async chooseImage(event) {
    const field = event.currentTarget.dataset.field;
    try {
      if (!['imageFileId', 'adImage'].includes(field)) throw new Error('图片用途不正确');
      const user = await getApp().ensureSession();
      await require('../../utils/privacy').authorize();
      const chosen = await new Promise((resolve, reject) => wx.chooseMedia({ count: 1, mediaType: ['image'], success: resolve, fail: reject }));
      const file = chosen.tempFiles && chosen.tempFiles[0];
      if (!file || !file.tempFilePath) throw new Error('没有选择图片');
      const folder = field === 'adImage' ? 'ads' : 'notices';
      const uploaded = await wx.cloud.uploadFile({ cloudPath: folder + '/' + user._id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg', filePath: file.tempFilePath });
      this.setData({ [field]: uploaded.fileID });
    } catch (error) { this.setData({ error: error.errMsg ? '图片选择或上传失败' : error.message || '图片上传失败' }); }
  },
  adTargetTypeChange(event) {
    const index = Number(event.detail.value); if (!this.data.adTargetTypes[index]) return;
    this.setData({ adTargetTypeIndex: index, adTargetType: this.data.adTargetTypes[index] });
  },
  adStatusChange(event) {
    const index = Number(event.detail.value); if (!this.data.adStatuses[index]) return;
    this.setData({ adStatusIndex: index, adStatus: this.data.adStatuses[index] });
  },
  adSlotChange(event) {
    const index = Number(event.detail.value); if (!this.data.adSlots[index]) return;
    this.setData({ adSlotIndex: index, adSlot: this.data.adSlots[index] });
  },
  adPathChange(event) {
    const index = Number(event.detail.value); if (!this.data.adPaths[index]) return;
    this.setData({ adPathIndex: index, adPath: this.data.adPaths[index] });
  },
  togglePinned(event) { this.setData({ pinned: event.detail.value }); },
  beginWrite() {
    if (this.data.saving || this.data.loading || this._visible === false || this._closed) return null;
    if (!this.currentRead()) { this.invalidateIdentity(); return null; }
    const operation = this.operation = { context: this.readContext, communityId: this.data.communityId };
    this.setData({ saving: true, error: '' });
    return operation;
  },
  writeCurrent(operation) {
    return this.operation === operation && this.contextCurrent(operation.context) &&
      this.data.communityId === operation.communityId && this.data.authorized;
  },
  finishWrite(operation) {
    if (this.operation === operation) {
      this.operation = null;
      this.setData({ saving: false });
    }
  },
  async submitWrite(operation, action, payload, clear = {}) {
    if (!this.writeCurrent(operation)) { this.invalidateIdentity(); return; }
    try {
      await api.call('content', action, payload,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.writeCurrent(operation) });
      if (!this.writeCurrent(operation)) { this.invalidateIdentity(); return; }
      this.setData(clear);
      this.finishWrite(operation);
      await this.load();
    } catch (error) {
      if (this.writeCurrent(operation)) this.invalidateIdentity('操作结果待核对，请重新加载');
    } finally {
      if (this.operation === operation) this.finishWrite(operation);
    }
  },
  async saveNotice() {
    const operation = this.beginWrite();
    if (!operation) return;
    if (!this.data.noticeReady) { this.finishWrite(operation); return; }
    if (!this.data.communityId) { this.finishWrite(operation); return this.setData({ noticeError: '请先选择管理小区' }); }
    if (!this.data.endAt) { this.finishWrite(operation); return this.setData({ error: '请填写公告有效期' }); }
    const endAt = new Date(this.data.endAt + 'T23:59:59+08:00');
    if (Number.isNaN(endAt.getTime())) {
      this.finishWrite(operation);
      return this.setData({ error: '公告有效期不正确' });
    }
    return this.submitWrite(operation, 'saveNotice', { communityId: this.data.communityId,
      title: this.data.title, body: this.data.body, imageFileId: this.data.imageFileId,
      endAt: endAt.toISOString(), pinned: this.data.pinned },
    { title: '', body: '', imageFileId: '', pinned: false });
  },
  async endNotice(event) {
    const operation = this.beginWrite();
    if (!operation) return;
    const noticeId = event.currentTarget?.dataset?.id;
    if (!this.data.noticeReady || !this.data.notices.some(item => item._id === noticeId)) { this.finishWrite(operation); return; }
    return this.submitWrite(operation, 'endNotice', { noticeId });
  },
  async endAd(event) {
    const operation = this.beginWrite();
    if (!operation) return;
    const adId = event.currentTarget?.dataset?.id;
    if (!this.data.isAdmin || !this.data.adReady || !this.data.ads.some(item => item._id === adId && item.status === 'live')) {
      this.finishWrite(operation); return;
    }
    return this.submitWrite(operation, 'endAd', { adId });
  },
  async confirmAdReceived(event) {
    const operation = this.beginWrite();
    if (!operation) return;
    const ad = this.data.ads.find(item => item._id === event.currentTarget.dataset.id);
    if (!this.data.isAdmin || !this.data.adReady || !ad || ad.paymentReceivedAt || !(ad.price > 0)) {
      this.finishWrite(operation); return;
    }
    let answer;
    try {
      answer = await new Promise((resolve, reject) => wx.showModal({ title: '确认广告款已到账？',
        content: '确认后会将广告金额记入平台收入账本。', success: result => resolve(result.confirm), fail: reject }));
    } catch (error) {
      if (this.writeCurrent(operation)) {
        this.finishWrite(operation);
        this.setData({ error: '确认窗口未能打开，请重试' });
      }
      return;
    }
    if (!this.writeCurrent(operation)) { this.invalidateIdentity(); return; }
    if (!answer) { this.finishWrite(operation); return; }
    return this.submitWrite(operation, 'markAdReceived', { adId: ad._id });
  },
  async saveAd() {
    const operation = this.beginWrite();
    if (!operation) return;
    if (!this.data.isAdmin || !this.data.adReady) { this.finishWrite(operation); return; }
    if (!this.data.communityId) { this.finishWrite(operation); return this.setData({ adError: '请先选择广告投放小区' }); }
    if (!this.data.adStart || !this.data.adEnd) { this.finishWrite(operation); return this.setData({ error: '请填写广告起止日期' }); }
    try {
      const payload = { title: this.data.adTitle, imageFileId: this.data.adImage,
        slot: this.data.adSlot, communityIds: [this.data.communityId], startAt: new Date(this.data.adStart + 'T00:00:00+08:00').toISOString(),
        endAt: new Date(this.data.adEnd + 'T23:59:59+08:00').toISOString(),
        target: this.data.adTargetType === 'page' ? { type: 'page', path: this.data.adPath } : { type: this.data.adTargetType, id: this.data.adTargetId },
        price: amountFen(this.data.adPrice), status: this.data.adStatus };
      return this.submitWrite(operation, 'saveAd', payload, { adTitle: '', adImage: '', adTargetId: '' });
    } catch (error) {
      if (this.writeCurrent(operation)) { this.finishWrite(operation); this.setData({ error: error.message || '广告条件不正确' }); }
    }
  }
});
