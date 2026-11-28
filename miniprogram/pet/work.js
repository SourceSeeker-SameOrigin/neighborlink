const entryDisplay = require('../utils/entry-display');
const api = require('../utils/api');
const { uploadPhotos, uploadVideo } = require('../utils/media');
Page({
  data: { busy: false, readingEntry: false, missingRecord: false, loading: true, error: '', orderId: '', visits: [], entryPassword: '' },
  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onShow() { this.visible = true; return this.load({ preserveMedia: true }); },
  leavePage() {
    this.visible = false; this.taskRead = (this.taskRead || 0) + 1;
    this.taskContext = null;
    if (this.visitAction?.stage !== 'media') this.visitAction = null;
    entryDisplay.clear(this);
    this.setData({ visits: [], parentStatus: '', entryMode: '' });
  },
  onHide() { this.leavePage(); },
  onUnload() { this.visitAction = null; this.leavePage(); },
  async load(options = {}) {
    if (options.preserveMedia !== true) this.visitAction = null;
    if (!this.orderId || !this.visible) return;
    const token = this.taskRead = (this.taskRead || 0) + 1;
    const orderId = this.orderId;
    let userId;
    const current = () => this.visible && this.taskRead === token && this.orderId === orderId &&
      (!userId || getApp().globalData.user?._id === userId);
    this.taskContext = null;
    entryDisplay.clear(this);
    this.setData({ busy: !!this.visitAction, loading: true, error: '', visits: [], parentStatus: '', entryMode: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user && user._id;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      if (!current()) return;
      const result = await api.call('pet', 'listVisits', { orderId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      this.setData({ visits: result.list || [], parentStatus: result.status, entryMode: result.entryMode });
      this.taskContext = { userId, orderId, read: token };
    } catch (error) { if (current()) this.setData({ error: error.message || '上门清单加载失败' }); }
    finally { if (current()) { this.setData({ loading: false }); await this.finishMedia(); } }
  },
  reveal(event) {
    if (!this.visible || this.data.loading) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const visitId = event.currentTarget.dataset.id;
    if (!this.orderId || this.data.entryMode !== 'password' || !this.data.visits.some(v => v._id === visitId && v.status === 'pending')) return;
    const current = () => this.visible && this.taskContext === context && this.taskRead === context.read &&
      getApp().globalData.user?._id === context.userId && this.orderId === context.orderId &&
      this.data.entryMode === 'password' && this.data.visits.some(v => v._id === visitId && v.status === 'pending');
    return entryDisplay.reveal(this, () => api.call('pet', 'revealEntry', { orderId: context.orderId, visitId },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: current }), current, () => this.load());
  },
  closeSecret() { entryDisplay.clear(this); },
  actionAllowed(request) {
    const context = this.taskContext;
    return this.visible && !this.data.loading && context &&
      context.userId === request.userId && context.orderId === request.orderId &&
      getApp().globalData.user?._id === request.userId && this.orderId === request.orderId &&
      this.data.parentStatus === 'in_service' &&
      this.data.visits.some(v => v._id === request.visitId && v.status === 'pending');
  },
  beginAction(event) {
    if (!this.visible || this.data.loading || this.visitAction) return null;
    const context = this.taskContext;
    if (!context || context.userId !== getApp().globalData.user?._id || context.orderId !== this.orderId) {
      this.load(); return null;
    }
    const request = { ...context, visitId: event.currentTarget.dataset.id, stage: 'choice' };
    if (!this.actionAllowed(request)) return null;
    this.visitAction = request;
    this.setData({ busy: true, error: '' });
    return request;
  },
  actionCurrent(request) {
    return this.visitAction === request && this.actionAllowed(request) && this.taskContext.read === request.read;
  },
  async releaseAction(request) {
    if (this.visitAction !== request) return;
    this.visitAction = null;
    if (!this.visible) return;
    this.setData({ busy: false });
    if (getApp().globalData.user?._id !== request.userId || this.orderId !== request.orderId) await this.load();
  },
  async finishMedia() {
    const request = this.visitAction;
    if (!request || request.stage !== 'media' || !this.visible || this.data.loading) return;
    if (!this.actionAllowed(request)) return this.releaseAction(request);
    if (!request.result) return;
    request.read = this.taskContext.read;
    request.stage = 'submit';
    try {
      if (request.result.error) throw request.result.error;
      await api.call('pet', 'markDone', { orderId: request.orderId, visitId: request.visitId, ...request.result.media },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.actionCurrent(request) });
      if (this.actionCurrent(request)) await this.load();
    } catch (error) {
      if (this.actionCurrent(request) && !/cancel/i.test(error.errMsg || error.message || '')) this.setData({ error: error.message || '提交服务结果失败' });
    } finally { await this.releaseAction(request); }
  },
  async done(event) {
    const request = this.beginAction(event);
    if (!request) return;
    try {
      const choice = await new Promise(resolve => wx.showActionSheet({ itemList: ['拍摄 2 张照片', '录制视频'], success: resolve, fail: () => resolve(null) }));
      if (!choice || !this.actionCurrent(request)) return;
      request.stage = 'media';
      const folder = 'pet/' + request.orderId;
      try {
        const media = choice.tapIndex === 0 ? { photos: await uploadPhotos(folder, 2, { loading: false }) } : { videoFileId: await uploadVideo(folder) };
        request.result = { media };
      } catch (error) { request.result = { error }; }
      if (this.visitAction !== request) return;
      // 系统相机返回后，重新读取同人同任务的状态，才接纳上传结果。
      if (this.visible) await this.load({ preserveMedia: true });
    } catch (error) {
      if (this.actionCurrent(request)) this.setData({ error: error.message || '提交服务结果失败' });
    } finally {
      if (request.stage !== 'media' || !request.result || this.visible) await this.releaseAction(request);
    }
  },
  async missed(event) {
    const request = this.beginAction(event);
    if (!request) return;
    try {
      const answer = await new Promise(resolve => wx.showModal({ title: '标记本次未完成', content: '系统将按本次上门金额发起部分退款。确认记录吗？', success: resolve, fail: () => resolve(null) }));
      if (!answer?.confirm || !this.actionCurrent(request)) return;
      await api.call('pet', 'markMissed', { orderId: request.orderId, visitId: request.visitId, reason: '服务员登记未完成' },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.actionCurrent(request) });
      if (this.actionCurrent(request)) await this.load();
    } catch (error) { if (this.actionCurrent(request)) this.setData({ error: error.message || '登记失败' }); }
    finally { await this.releaseAction(request); }
  }
});
