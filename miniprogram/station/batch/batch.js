const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { display } = require('../../utils/time');
function owner(user) {
  return user?._id ? JSON.stringify([user._id, user.communityId || '', (user.roles || []).slice().sort()]) : '';
}
Page({
  data: { missingRecord: false, loading: true, ready: false, busy: false, error: '', batch: null },
  onLoad(options = {}) {
    this.batchId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.batchId, loading: !!this.batchId });
  },
  onShow() { this.visible = true; return this.load({ preserveMedia: true }); },
  clearContext() {
    this.read = (this.read || 0) + 1;
    this.context = null;
    this.setData({ ready: false, loading: false, batch: null, error: '', busy: !!this.operation });
  },
  onHide() {
    this.visible = false;
    if (this.operation?.stage !== 'media') this.operation = null;
    this.clearContext();
  },
  onUnload() { this.operation = null; this.onHide(); },
  current(context) {
    return !!(context && this.visible && context.read === this.read && context.batchId === this.batchId &&
      context.owner === owner(getApp().globalData.user));
  },
  async load(options = {}) {
    if (!this.visible || !this.batchId) return;
    if (options.preserveMedia !== true) this.operation = null;
    this.clearContext();
    const read = this.read, batchId = this.batchId;
    let identity = owner(getApp().globalData.user);
    const current = () => this.visible && read === this.read && batchId === this.batchId &&
      (!identity || identity === owner(getApp().globalData.user));
    this.setData({ loading: true });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      identity = owner(user);
      if (!identity) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (this.operation && (this.operation.owner !== identity || this.operation.batchId !== batchId)) this.operation = null;
      const batch = await api.call('station', 'providerBatch', { batchId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (!batch || batch._id !== batchId || !Array.isArray(batch.items)) throw Error('批次资料暂不可用，请重试');
      this.context = { owner: identity, batchId, read };
      this.setData({ ready: true, busy: !!this.operation, batch: { ...batch,
        items: batch.items.map(item => ({ ...item, atText: item.at ? display(item.at) : '' })) } });
    } catch (error) {
      if (current()) { this.operation = null; this.setData({ busy: false, error: error.message || '批次加载失败' }); }
    } finally {
      if (current()) { this.setData({ loading: false }); await this.finishMedia(); }
    }
  },
  allowed(request) {
    const batch = this.data.batch;
    if (!this.data.ready || this.data.loading || !this.current(this.context) ||
      this.context.owner !== request.owner || this.context.batchId !== request.batchId ||
      !batch || batch.status !== 'assigned') return false;
    if (request.kind === 'start') return !batch.startedAt;
    return !!(batch.startedAt && batch.items.some(item => item._id === request.itemId && item.status === 'pending'));
  },
  begin(kind, itemId) {
    if (!this.visible || !this.batchId || this.data.loading || this.data.busy || !this.data.ready) return null;
    if (!this.current(this.context)) { this.load(); return null; }
    const request = { ...this.context, kind, itemId, stage: 'choice' };
    if (!this.allowed(request)) return null;
    this.operation = request;
    this.setData({ busy: true, error: '' });
    return request;
  },
  active(request) { return this.operation === request && request.read === this.read && this.allowed(request); },
  async release(request) {
    if (this.operation !== request) return;
    this.operation = null;
    if (!this.visible) return;
    if (!this.current(this.context)) return this.load();
    this.setData({ busy: false });
  },
  options(request) { return { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.active(request) }; },
  async send(request, action, data = {}) {
    if (!this.active(request)) return;
    request.stage = 'submit';
    const result = await api.call('station', action, { batchId: request.batchId, ...data }, this.options(request));
    if (!this.active(request)) return;
    if (result?.status === 'skipped') wx.showToast({ title: '住户已撤回授权，已跳过', icon: 'none' });
    await this.load();
  },
  async start() {
    const request = this.begin('start');
    if (!request) return;
    try { await this.send(request, 'startBatch'); }
    catch (error) { if (this.active(request)) this.setData({ error: error.message || '开始配送失败' }); }
    finally { await this.release(request); }
  },
  async finishMedia() {
    const request = this.operation;
    if (!request || request.stage !== 'media' || !this.visible || this.data.loading) return;
    if (!this.allowed(request)) return this.release(request);
    if (!request.result) return;
    request.read = this.read;
    request.stage = 'submit';
    try {
      if (request.result.error) throw request.result.error;
      const file = request.result.files?.[0];
      if (!file) throw Error('未取得配送照片，请重新拍照');
      await this.send(request, 'recordDelivery', { itemId: request.itemId, status: 'delivered', photoFileId: file });
    } catch (error) {
      if (this.active(request) && !/cancel/i.test(error.errMsg || error.message || '')) this.setData({ error: error.message || '送达记录失败' });
    } finally { await this.release(request); }
  },
  async delivered(event) {
    const request = this.begin('delivered', event.currentTarget.dataset.id);
    if (!request) return;
    try {
      const consent = await api.call('station', 'checkDoorDeliveryConsent',
        { batchId: request.batchId, itemId: request.itemId }, this.options(request));
      if (!this.active(request)) return;
      if (!consent.allowed) {
        wx.showToast({ title: '住户已撤回授权，已跳过', icon: 'none' });
        await this.load();
        return;
      }
      request.stage = 'media';
      try { request.result = { files: await uploadPhotos('station/' + request.batchId, 1, { loading: false }) }; }
      catch (error) { request.result = { error }; }
      if (this.operation === request && this.visible) await this.load({ preserveMedia: true });
    } catch (error) { if (this.active(request)) this.setData({ error: error.message || '送达记录失败' }); }
    finally { if (request.stage !== 'media') await this.release(request); }
  },
  async failed(event) {
    const request = this.begin('failed', event.currentTarget.dataset.id);
    if (!request) return;
    try {
      const answer = await new Promise((resolve, reject) => wx.showModal({ title: '标记未送达', editable: true,
        placeholderText: '填写原因（选填）', success: resolve, fail: reject }));
      if (!answer.confirm || !this.active(request)) return;
      await this.send(request, 'recordDelivery', { itemId: request.itemId, status: 'failed', reason: answer.content || '' });
    } catch (error) { if (this.active(request)) this.setData({ error: error.message || '更新结果失败' }); }
    finally { await this.release(request); }
  }
});
