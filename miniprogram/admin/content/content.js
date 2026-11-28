const api = require('../../utils/api');
const { fingerprint } = require('../../utils/intent-fingerprint');
function amountFen(value) {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(String(value));
  if (!match) throw new Error('广告金额最多保留两位小数');
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 100000000) throw new Error('广告金额超出范围');
  return amount;
}
Page({
  data: { loading: true, saving: false, uploadingImage: false, noticeReady: false, adReady: false,
    error: '', noticeError: '', adError: '', authorized: false, isAdmin: false,
    noticeRecoveryHint: '', adRecoveryHint: '', noticeLookupError: false, adLookupError: false,
    createdNoticeId: '', createdAdId: '',
    user: null, communityId: '', communities: [], communityIndex: 0, notices: [], ads: [], noticeHasMore: false,
    adHasMore: false, noticePaging: false, adPaging: false, noticeMoreError: '', adMoreError: '',
    title: '', body: '', imageFileId: '', endAt: '', pinned: false,
    adTitle: '', adImage: '', adSlot: 'home_banner', adSlots: ['home_banner', 'board_top', 'shops_top'], adPath: '/shops/list/list', adStart: '', adEnd: '', adTargetType: 'page', adTargetId: '', adPrice: '0.00', adStatus: 'draft',
    adTargetTypes: ['page', 'merchant', 'event'], adStatuses: ['draft', 'live'],
    adSlotIndex: 0, adTargetTypeIndex: 0, adStatusIndex: 0, adPathIndex: 0,
    adSlotLabels: ['首页横幅', '需求广场顶部', '社区商家顶部'],
    adTargetTypeLabels: ['小程序页面', '商家', '活动'], adStatusLabels: ['草稿', '上线'],
    adStatusNames: { draft: '草稿', live: '上线', ended: '已结束' },
    adPathLabels: ['社区商家列表', '商家详情', '社区活动列表', '活动详情'],
    adPaths: ['/shops/list/list', '/shops/detail/detail', '/events/list/list', '/events/detail/detail'] },
  onLoad() { this._visible = true; return this.load(); },
  onShow() {
    if (this._wasHidden) {
      this._visible = true;
      this.setData({ uploadingImage: Boolean(this.imageToken && this.imageToken.stage !== 'settled') });
      return this.load(true);
    }
  },
  onHide() {
    this._visible = false;
    this._wasHidden = true;
    // The native picker may temporarily hide the page before returning its image.
    if (this.imageToken && this.imageToken.stage !== 'choosing') this.imageToken = null;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.noticeSequence = (this.noticeSequence || 0) + 1;
    this.adSequence = (this.adSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, saving: false, authorized: false, isAdmin: false,
      noticeReady: false, adReady: false, user: null, communities: [], notices: [], ads: [],
      noticeHasMore: false, adHasMore: false, noticePaging: false, adPaging: false });
  },
  onUnload() { this._closed = true; this.imageToken = null; this.onHide(); },
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
  pendingKey(kind, userId) { return 'content_create_' + kind + '_' + userId; },
  restorePending(user) {
    this.pendingCreates = this.pendingCreates || {};
    for (const kind of ['notice', 'ad']) {
      if (this.pendingCreates[kind]?.userId === user._id) continue;
      this.pendingCreates[kind] = null;
      try {
        const saved = wx.getStorageSync(this.pendingKey(kind, user._id));
        if (saved?.userId === user._id && saved.kind === kind) this.pendingCreates[kind] = saved;
      } catch (_) {}
    }
  },
  clearPending(kind) {
    const pending = this.pendingCreates?.[kind];
    this.pendingCreates[kind] = null;
    if (pending) try {
      const key = this.pendingKey(kind, pending.userId);
      if (wx.getStorageSync(key)?.requestId === pending.requestId) wx.removeStorageSync(key);
    } catch (_) {}
  },
  async checkPending(kind, context) {
    const pending = this.pendingCreates?.[kind];
    if (!pending || !this.contextCurrent(context)) return;
    const prefix = kind === 'notice' ? 'notice' : 'ad';
    if (kind === 'notice' && this.data.communityId !== pending.communityId) {
      this.setData({ noticeLookupError: false,
        noticeRecoveryHint: '上次公告属于另一小区。请切回原小区核对，或明确开始新公告。' });
      return;
    }
    const active = () => this.contextCurrent(context) &&
      (kind === 'notice' ? this.data.noticeReady && this.data.communityId === pending.communityId : this.data.adReady);
    try {
      const result = await api.call('content', 'lookupCreate', { kind, requestId: pending.requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      if (result.recordId) {
        this.clearPending(kind);
        this.setData({ [prefix + 'LookupError']: false, ['created' + (kind === 'notice' ? 'Notice' : 'Ad') + 'Id']: result.recordId,
          [prefix + 'RecoveryHint']: '已找到上次保存的' + (kind === 'notice' ? '公告' : '广告') + '，不会重复创建。' });
      } else this.setData({ [prefix + 'LookupError']: false,
        [prefix + 'RecoveryHint']: '暂未查到上次保存的内容。核对原输入后可用原编号重试。' });
    } catch (error) {
      if (active()) this.setData({ [prefix + 'LookupError']: true,
        [prefix + 'RecoveryHint']: '上次保存结果待核对，请先重试读取。' });
    }
  },
  startNewCreate(event) {
    if (!this.currentRead() || this.data.saving) return;
    const kind = event.currentTarget.dataset.kind;
    if (!['notice', 'ad'].includes(kind) || this.data[kind + 'LookupError']) return;
    this.clearPending(kind);
    this.setData({ [kind + 'RecoveryHint']: '',
      ['created' + (kind === 'notice' ? 'Notice' : 'Ad') + 'Id']: '' });
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
      noticeHasMore: false, adHasMore: false, noticePaging: false, adPaging: false,
      communityId: '', error: message });
  },
  async load(resumeImage = false) {
    if (this._closed || this._visible === false) return;
    if (resumeImage !== true) this.imageToken = null;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    this.noticeSequence = (this.noticeSequence || 0) + 1;
    this.adSequence = (this.adSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: true, saving: false,
      uploadingImage: Boolean(this.imageToken && this.imageToken.stage !== 'settled'),
      noticeReady: false, adReady: false,
      error: '', noticeError: '', adError: '', authorized: false, isAdmin: false,
      user: null, communities: [], notices: [], ads: [], noticeHasMore: false, adHasMore: false,
      noticePaging: false, adPaging: false });
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
        this.clearDrafts(); this.setData({ communityId: '', noticeRecoveryHint: '', adRecoveryHint: '',
          noticeLookupError: false, adLookupError: false, createdNoticeId: '', createdAdId: '' });
      }
      this.restorePending(user);
      this.draftOwnerId = userId;
      const context = this.readContext = { userId, isAdmin, communityId: user.communityId, sequence };
      this.setData({ user, isAdmin, authorized: true });
      await Promise.all([this.prepareNotices(user, context), isAdmin ? this.loadAds(context) : Promise.resolve()]);
      if (this.contextCurrent(context)) await Promise.all([
        this.checkPending('notice', context), isAdmin ? this.checkPending('ad', context) : Promise.resolve()]);
    } catch (error) { if (current()) this.setData({ error: error.message || '加载失败' }); }
    finally {
      if (current()) { this.setData({ loading: false }); this.applyImageResult(); }
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
    this.noticeOffset = 0;
    this.setData({ noticeReady: false, noticeError: '', noticeMoreError: '', noticeHasMore: false,
      noticePaging: false, notices: [] });
    try {
      if (!communityId) throw new Error('请先配置并选择管理小区');
      let nextOffset = 0, hasMore = true;
      const found = [];
      for (let scan = 0; scan < 5 && hasMore && !found.length; scan++) {
        const result = await api.call('content', 'listNotices', { communityId, offset: nextOffset },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
        if (!current()) return;
        found.push(...(result.list || []));
        const after = Number.isInteger(result.nextOffset) ? result.nextOffset : nextOffset + (result.list || []).length;
        if (after <= nextOffset && result.hasMore) throw Error('公告分页结果异常，请重试');
        nextOffset = after;
        hasMore = !!result.hasMore;
      }
      if (current()) { this.noticeOffset = nextOffset; this.setData({ noticeReady: true,
        notices: found, noticeHasMore: hasMore }); this.applyImageResult(); }
    } catch (error) { if (current()) this.setData({ noticeError: error.message || '公告加载失败' }); }
    finally { if (!current() && this.readContext === context && !this.contextCurrent(context)) this.invalidateIdentity(); }
  },
  async loadAds(context = this.readContext) {
    if (!this.contextCurrent(context) || !context.isAdmin) { this.invalidateIdentity(); return; }
    const sequence = this.adSequence = (this.adSequence || 0) + 1;
    const current = () => sequence === this.adSequence && this.contextCurrent(context);
    this.adOffset = 0;
    this.setData({ adReady: false, adError: '', adMoreError: '', adHasMore: false, adPaging: false, ads: [] });
    try {
      const result = await api.call('content', 'listAds', { offset: 0 },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (current()) { this.adOffset = (result.list || []).length;
        this.setData({ adReady: true, ads: result.list || [], adHasMore: !!result.hasMore }); this.applyImageResult(); }
    } catch (error) { if (current()) this.setData({ adError: error.message || '广告加载失败' }); }
    finally { if (!current() && this.readContext === context && !this.contextCurrent(context)) this.invalidateIdentity(); }
  },
  async moreNotices() {
    const context = this.readContext, sequence = this.noticeSequence, communityId = this.data.communityId;
    const current = () => sequence === this.noticeSequence && this.contextCurrent(context) &&
      this.data.communityId === communityId;
    if (!current() || !this.data.noticeReady || !this.data.noticeHasMore || this.data.noticePaging) return;
    const offset = this.noticeOffset;
    this.setData({ noticePaging: true, noticeMoreError: '' });
    try {
      const result = await api.call('content', 'listNotices', { communityId, offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      const after = Number.isInteger(result.nextOffset) ? result.nextOffset : offset + (result.list || []).length;
      if (after <= offset && result.hasMore) throw Error('公告分页结果异常，请重试');
      const seen = new Set(this.data.notices.map(item => item._id));
      this.noticeOffset = after;
      this.setData({ notices: [...this.data.notices, ...(result.list || []).filter(item => !seen.has(item._id))],
        noticeHasMore: !!result.hasMore });
    } catch (error) {
      if (current()) this.setData(error.code === 'E_FORBIDDEN'
        ? { notices: [], noticeReady: false, noticeHasMore: false, noticeError: error.message || '无权查看公告' }
        : { noticeMoreError: error.message || '后续公告加载失败' });
    }
    finally { if (current()) this.setData({ noticePaging: false }); }
  },
  async moreAds() {
    const context = this.readContext, sequence = this.adSequence;
    const current = () => sequence === this.adSequence && this.contextCurrent(context);
    if (!current() || !this.data.adReady || !this.data.adHasMore || this.data.adPaging) return;
    const offset = this.adOffset;
    this.setData({ adPaging: true, adMoreError: '' });
    try {
      const result = await api.call('content', 'listAds', { offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      const seen = new Set(this.data.ads.map(item => item._id));
      this.adOffset = offset + (result.list || []).length;
      this.setData({ ads: [...this.data.ads, ...(result.list || []).filter(item => !seen.has(item._id))],
        adHasMore: !!result.hasMore });
    } catch (error) {
      if (current()) this.setData(error.code === 'E_FORBIDDEN'
        ? { ads: [], adReady: false, adHasMore: false, adError: error.message || '无权查看广告' }
        : { adMoreError: error.message || '后续广告加载失败' });
    }
    finally { if (current()) this.setData({ adPaging: false }); }
  },
  async chooseCommunity(event) {
    if (!this.data.isAdmin || this.data.saving || this.data.loading) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const communityIndex = Number(event.detail.value), community = this.data.communities[communityIndex];
    if (!community) return;
    this.setData({ communityIndex, communityId: community._id });
    await this.loadNotices();
    await this.checkPending('notice', this.readContext);
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  imageTarget(field) {
    return JSON.stringify(field === 'adImage'
      ? [this.data.communityId, this.data.adSlot, this.data.adTargetType, this.data.adTargetId, this.data.adPath]
      : [this.data.communityId]);
  },
  applyImageResult() {
    const token = this.imageToken;
    if (!token || token.stage !== 'settled' || this._visible === false || this._closed) return;
    const user = getApp().globalData.user;
    if (!user || user._id !== token.userId || this.imageTarget(token.field) !== token.target) {
      this.imageToken = null;
      this.setData({ uploadingImage: false });
      if (!this.currentRead()) this.invalidateIdentity();
      return;
    }
    if (!this.currentRead() || !(token.field === 'adImage' ? this.data.adReady : this.data.noticeReady)) return;
    this.imageToken = null;
    this.setData({ uploadingImage: false,
      ...(token.fileId ? { [token.field]: token.fileId } : {}),
      ...(token.error ? { error: token.error } : {}) });
  },
  async chooseImage(event) {
    const field = event.currentTarget.dataset.field;
    if (!['imageFileId', 'adImage'].includes(field)) return this.setData({ error: '图片用途不正确' });
    if (this.data.saving || this.data.uploadingImage || !this.currentRead() ||
        !(field === 'adImage' ? this.data.adReady && this.data.isAdmin : this.data.noticeReady)) return;
    const token = this.imageToken = { field, userId: this.readContext.userId,
      target: this.imageTarget(field), stage: 'choosing' };
    this.setData({ uploadingImage: true, error: '' });
    try {
      await require('../../utils/privacy').authorize();
      if (this.imageToken !== token || getApp().globalData.user?._id !== token.userId) return;
      const chosen = await new Promise((resolve, reject) => wx.chooseMedia({ count: 1, mediaType: ['image'], success: resolve, fail: reject }));
      if (this.imageToken !== token || getApp().globalData.user?._id !== token.userId) return;
      const file = chosen.tempFiles && chosen.tempFiles[0];
      if (!file || !file.tempFilePath) throw new Error('没有选择图片');
      const folder = field === 'adImage' ? 'ads' : 'notices';
      token.stage = 'uploading';
      const uploaded = await wx.cloud.uploadFile({ cloudPath: folder + '/' + token.userId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg', filePath: file.tempFilePath });
      token.fileId = uploaded.fileID;
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) token.error = error.errMsg ? '图片选择或上传失败' : error.message || '图片上传失败';
    } finally {
      if (this.imageToken === token) {
        token.stage = 'settled';
        this.applyImageResult();
      }
    }
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
    if (this.data.saving || this.data.uploadingImage || this.data.loading || this._visible === false || this._closed) return null;
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
    const kind = action === 'saveNotice' && !payload.noticeId ? 'notice' : action === 'saveAd' && !payload.adId ? 'ad' : null;
    if (kind) {
      if (this.data[kind + 'LookupError'] || this.data['created' + (kind === 'notice' ? 'Notice' : 'Ad') + 'Id']) {
        this.finishWrite(operation); this.setData({ error: '请先核对原记录，或明确开始新建' }); return;
      }
      const intentHash = fingerprint(payload);
      this.pendingCreates = this.pendingCreates || {};
      const pending = this.pendingCreates[kind];
      if (pending && (pending.intentHash !== intentHash || pending.communityId !== operation.communityId)) {
        this.finishWrite(operation); this.setData({ error: '内容与上次提交不同，请核对原输入，或明确开始新建' }); return;
      }
      if (!pending) {
        this.pendingCreates[kind] = { userId: operation.context.userId, communityId: operation.communityId,
          kind, requestId: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2), intentHash };
        try { wx.setStorageSync(this.pendingKey(kind, operation.context.userId), this.pendingCreates[kind]); } catch (_) {}
      }
      payload = { ...payload, requestId: this.pendingCreates[kind].requestId };
    }
    try {
      const result = await api.call('content', action, payload,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.writeCurrent(operation) });
      if (!this.writeCurrent(operation)) { this.invalidateIdentity(); return; }
      if (kind) this.clearPending(kind);
      this.setData(clear);
      this.finishWrite(operation);
      await this.load();
      if (kind && this.currentRead() && getApp().globalData.user?._id === operation.context.userId)
        this.setData({ ['created' + (kind === 'notice' ? 'Notice' : 'Ad') + 'Id']: result?.noticeId || result?.adId || '',
          [kind + 'RecoveryHint']: '已保存' + (kind === 'notice' ? '公告' : '广告') + '，如需再次创建请明确开始新建。' });
    } catch (error) {
      if (this.writeCurrent(operation)) this.invalidateIdentity('操作结果待核对，请重新加载');
    } finally {
      if (this.operation === operation) this.finishWrite(operation);
    }
  },
  async saveNotice() {
    const operation = this.beginWrite();
    if (!operation) return;
    if (this.data.createdNoticeId || this.data.noticeLookupError) {
      this.finishWrite(operation); this.setData({ error: '请先核对原公告，或明确开始新建' }); return;
    }
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
    if (this.data.createdAdId || this.data.adLookupError) {
      this.finishWrite(operation); this.setData({ error: '请先核对原广告，或明确开始新建' }); return;
    }
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
