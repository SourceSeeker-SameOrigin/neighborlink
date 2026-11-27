const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { yuan, toFen } = require('../../utils/money');
const { fingerprint } = require('../../utils/intent-fingerprint');
const emptyDraft = () => ({ title: '', desc: '', priceTypeIndex: 0, price: '', unit: '次', images: [] });
Page({
  data: { ready: false, loadError: false, loading: true, busy: false, error: '', pageError: false,
    recoveredServiceId: '', recoveryHint: '', recoveryError: false,
    list: [], hasMore: false, types: ['固定价', '预约后报价'], ...emptyDraft() },
  onShow() { this.visible = true; return this.load({ preserveMedia: true }); },
  clearContext() {
    this.read = (this.read || 0) + 1;
    this.context = null;
    this.setData({ ready: false, loading: false, list: [], hasMore: false, busy: !!this.operation });
  },
  onHide() {
    this.visible = false;
    if (this.operation?.stage !== 'media') this.operation = null;
    this.clearContext();
  },
  onUnload() { this.operation = null; this.onHide(); },
  current(context) {
    const user = getApp().globalData.user;
    return !!(context && this.visible && context.read === this.read &&
      context.userId === user?._id && context.merchantId === user?.merchantId);
  },
  async load(options = {}) {
    const append = options.append === true;
    if (!this.visible || (append && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    if (append && !this.current(this.context)) return this.load();
    if (options.preserveMedia !== true) this.operation = null;
    if (!append) { this.clearContext(); this.offset = 0; }
    else { this.read++; this.context = null; }
    const read = this.read;
    let userId, merchantId;
    const current = () => this.visible && this.read === read && (!userId ||
      (getApp().globalData.user?._id === userId && getApp().globalData.user?.merchantId === merchantId));
    this.setData({ loading: true, ready: false, loadError: false, pageError: false, error: '', busy: !!this.operation });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id; merchantId = user?.merchantId;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (this.draftOwner && (this.draftOwner.userId !== userId || this.draftOwner.merchantId !== merchantId)) {
        this.operation = null;
        this.pendingSave = null; this.lookupChecked = false;
        this.setData({ ...emptyDraft(), recoveredServiceId: '', recoveryHint: '', recoveryError: false });
      }
      this.draftOwner = { userId, merchantId };
      this.requestKey = 'merchantServiceRequest:' + userId + ':' + merchantId;
      if (!this.pendingSave) {
        try {
          const saved = wx.getStorageSync(this.requestKey);
          if (saved?.userId === userId && saved?.merchantId === merchantId &&
              typeof saved.requestId === 'string' && typeof saved.intentHash === 'string') {
            this.pendingSave = saved; this.lookupChecked = false;
          }
        } catch (_) {}
      }
      if (this.pendingSave && !this.lookupChecked) {
        const found = await api.call('merchant', 'lookupService', { requestId: this.pendingSave.requestId },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
        if (!current()) return;
        if (!found || !Object.prototype.hasOwnProperty.call(found, 'serviceId')) throw Error('未能核实上次保存，请重新查询');
        this.lookupChecked = true;
        if (found.serviceId) {
          this.setData({ recoveredServiceId: found.serviceId, recoveryHint: '', recoveryError: false });
          try { wx.removeStorageSync(this.requestKey); } catch (_) {}
          this.pendingSave = null;
        } else this.setData({ recoveryHint: '暂未查到上次服务。请重填并核对内容，再用原编号提交。', recoveryError: false });
      }
      const result = await api.call('merchant', 'myServices', { offset: append ? this.offset : 0 },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      const batch = result.list || [];
      if (!Array.isArray(batch) || (result.hasMore && !batch.length)) throw Error('服务分页结果异常，请重试');
      const offset = (append ? this.offset : 0) + batch.length;
      if (result.nextOffset !== undefined && result.nextOffset !== offset) throw Error('服务分页位置异常，请重试');
      const rows = append ? this.data.list.slice() : [], ids = new Set(rows.map(item => item._id));
      const list = rows.concat(batch.filter(item => { if (ids.has(item._id)) return false; ids.add(item._id); return true; })
        .map(item => ({ ...item, priceText: yuan(item.price) })));
      this.offset = offset;
      this.context = { userId, merchantId, read };
      this.setData({ list, hasMore: result.hasMore === true, ready: true, busy: !!this.operation });
    } catch (error) {
      if (current()) {
        const retain = append && !['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND'].includes(error.code);
        this.operation = null;
        if (!retain) this.clearContext();
        else this.context = { userId, merchantId, read };
        this.setData({ ready: false, loading: false, busy: false, loadError: true, pageError: retain,
          recoveryError: Boolean(this.pendingSave && !this.lookupChecked), error: error.message || '服务加载失败' });
      }
    } finally {
      if (current()) { this.setData({ loading: false }); this.finishMedia(); }
    }
  },
  more() { return this.load({ append: true }); },
  retry() { return this.load({ append: this.data.pageError }); },
  startNewService() {
    if (!this.canEdit() || this.data.busy || this.pendingSave && !this.lookupChecked) return;
    const requestId = this.pendingSave?.requestId;
    this.pendingSave = null; this.lookupChecked = false;
    if (requestId) try { const saved = wx.getStorageSync(this.requestKey);
      if (saved?.requestId === requestId) wx.removeStorageSync(this.requestKey); } catch (_) {}
    this.setData({ ...emptyDraft(), recoveredServiceId: '', recoveryHint: '', recoveryError: false, error: '' });
  },
  canEdit() { return this.current(this.context) && this.data.ready && !this.data.loading && !this.data.busy; },
  input(event) {
    if (!this.canEdit()) return;
    const field = event.currentTarget.dataset.field;
    if (['title', 'desc', 'price', 'unit'].includes(field)) this.setData({ [field]: event.detail.value });
  },
  chooseType(event) {
    if (!this.canEdit()) return;
    const index = Number(event.detail.value);
    if (index === 0 || index === 1) this.setData({ priceTypeIndex: index });
  },
  begin(stage) {
    if (!this.visible || !this.data.ready || this.data.loading || this.data.busy) return null;
    if (!this.current(this.context)) { this.load(); return null; }
    const request = this.operation = { ...this.context, stage };
    this.setData({ busy: true, error: '', loadError: false });
    return request;
  },
  active(request) { return this.operation === request && this.current(request) && this.data.ready && !this.data.loading; },
  release(request) {
    if (this.operation !== request) return;
    this.operation = null;
    if (!this.visible) return;
    if (!this.current(this.context)) { this.load(); return; }
    this.setData({ busy: false });
  },
  finishMedia() {
    const request = this.operation;
    if (!request || request.stage !== 'media' || !this.visible || this.data.loading) return;
    if (!this.current(this.context) || !this.data.ready || request.userId !== this.context.userId || request.merchantId !== this.context.merchantId) {
      this.release(request); return;
    }
    if (!request.result) return;
    request.read = this.read;
    const { images, error } = request.result;
    if (error) {
      if (!/cancel/i.test(error.errMsg || error.message || '')) this.setData({ error: error.message || '图片上传失败' });
    } else this.setData({ images: [...this.data.images, ...images].slice(0, 9), error: '' });
    this.release(request);
  },
  async photos() {
    if (this.data.images.length >= 9) return;
    const request = this.begin('media');
    if (!request) return;
    try { request.result = { images: await uploadPhotos('merchant-services/' + request.userId, Math.min(3, 9 - this.data.images.length), { loading: false }) }; }
    catch (error) { request.result = { error }; }
    if (this.operation !== request) return;
    if (this.visible) await this.load({ preserveMedia: true });
  },
  async save() {
    if (this.data.recoveredServiceId || this.data.recoveryError) return;
    const request = this.begin('save');
    if (!request) return;
    try {
      const type = this.data.priceTypeIndex ? 'quote' : 'fixed';
      const price = type === 'fixed' ? toFen(this.data.price) : 0;
      if (price === null) throw Error('价格最多保留两位小数');
      const data = { title: this.data.title, desc: this.data.desc, priceType: type,
        price, unit: this.data.unit, status: 'off', images: this.data.images.slice() };
      const intentHash = fingerprint(data);
      if (this.pendingSave && !this.lookupChecked) throw Error('请先核对上次服务保存结果');
      if (this.pendingSave && this.pendingSave.intentHash !== intentHash)
        throw Error('内容与上次保存不同。请恢复原内容，或明确开始新服务。');
      if (!this.pendingSave) this.pendingSave = { userId: request.userId, merchantId: request.merchantId,
        requestId: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2), intentHash };
      this.lookupChecked = true;
      try { wx.setStorageSync(this.requestKey, this.pendingSave); } catch (_) {}
      const result = await api.call('merchant', 'upsertService', { ...data, requestId: this.pendingSave.requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.active(request) });
      if (!this.active(request)) return;
      try { const saved = wx.getStorageSync(this.requestKey);
        if (saved?.requestId === this.pendingSave.requestId) wx.removeStorageSync(this.requestKey); } catch (_) {}
      this.pendingSave = null;
      this.setData({ ...emptyDraft(), recoveredServiceId: result.serviceId, recoveryHint: '', recoveryError: false });
      await this.load();
    } catch (error) {
      if (this.active(request)) {
        if (this.pendingSave) {
          try {
            const found = await api.call('merchant', 'lookupService', { requestId: this.pendingSave.requestId },
              { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.active(request) });
            if (!this.active(request)) return;
            this.lookupChecked = true;
            if (found?.serviceId) {
              this.setData({ recoveredServiceId: found.serviceId, recoveryHint: '', recoveryError: false, error: '' });
              try { wx.removeStorageSync(this.requestKey); } catch (_) {}
              this.pendingSave = null;
            } else this.setData({ error: error.message || '服务保存失败', recoveryHint: '暂未查到上次服务，请核对内容后重试。' });
          } catch (_) { if (this.active(request)) this.setData({ error: '保存结果待核对，请重新加载', recoveryError: true }); }
        } else this.setData({ error: error.message || '服务保存失败' });
      }
    }
    finally { this.release(request); }
  }
});
