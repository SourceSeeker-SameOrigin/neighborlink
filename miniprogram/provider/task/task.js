const entryDisplay = require('../../utils/entry-display');
const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { slotText } = require('../../utils/time');
const { toFen, yuan } = require('../../utils/money');
const vacantItems = [{ key: 'windows', label: '门窗检查' }, { key: 'utilities', label: '水电燃气' },
  { key: 'leakMold', label: '漏水与霉斑' }, { key: 'ventilation', label: '开窗通风 30 分钟' },
  { key: 'mail', label: '代收快递信件' }, { key: 'photos', label: '巡检拍照' }];
Page({
  data: { taskReady: false, uploading: false, callingResident: false, readingEntry: false, entryPassword: '', missingRecord: false, loading: true, busy: false, error: '', order: null, photos: [], receiptPhoto: '', goodsYuan: '',
    weightsTenths: {}, visitChecks: { mental: false, diet: false, utilities: false, doors: false, medical: false }, visitNotes: '', visitAttention: false, attentionCallConfirmed: false,
    vacantItems, checklist: {}, photoByItem: {}, vacantNotes: '', vacantAttention: false, entryText: '' },
  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onShow() { this.visible = true; this.setData({ uploading: !!this.taskUpload }); return this.load({ preservePhone: true }); },
  leavePage() {
    this.visible = false; this.taskRead = (this.taskRead || 0) + 1;
    this.clearTaskContext();
    entryDisplay.clear(this);
    this.stopLocationTimer();
  },
  onHide() { this.leavePage(); },
  onUnload() { this.taskUpload = null; this.phoneRequest = null; this.leavePage(); },
  stopLocationTimer() { if (this.locationTimer) clearInterval(this.locationTimer); this.locationTimer = null; },
  clearTaskContext() {
    this.taskContext = null; this.locationRequest = null; this.locationBusy = false;
    this.setData({ taskReady: false, order: null });
    if (this.releaseRequest) { this.releaseRequest = null; this.setData({ busy: false }); }
    if (this.workRequest) { this.workRequest = null; this.setData({ busy: false }); }
    if (this.reportRequest) { this.reportRequest = null; this.setData({ busy: false }); }
  },
  async load(options = {}) {
    // 系统拨号返回可保留原请求，主动刷新则作废旧拨号回调。
    if (options.preservePhone !== true) { this.phoneRequest = null; this.setData({ callingResident: false }); }
    this.clearTaskContext();
    this.stopLocationTimer();
    if (!this.orderId || !this.visible) return;
    const token = this.taskRead = (this.taskRead || 0) + 1;
    const orderId = this.orderId;
    let userId;
    const current = () => this.visible && this.taskRead === token && this.orderId === orderId &&
      (!userId || getApp().globalData.user?._id === userId);
    entryDisplay.clear(this);
    this.setData({ loading: true, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user && user._id;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (this.draftOwner?.userId !== userId || this.draftOwner?.orderId !== orderId) {
        this.reportOutcome = null;
        this.taskUpload = null;
        this.phoneRequest = null;
        this.setData({ uploading: false, callingResident: false, photos: [], receiptPhoto: '', goodsYuan: '', weightsTenths: {},
          visitChecks: { mental: false, diet: false, utilities: false, doors: false, medical: false },
          visitNotes: '', visitAttention: false, attentionCallConfirmed: false,
          checklist: {}, photoByItem: {}, vacantNotes: '', vacantAttention: false });
        this.draftOwner = { userId, orderId };
      }
      const order = await api.call('order', 'detail', { orderId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current() || !userId || getApp().globalData.user?._id !== userId) return;
      const entryText = order.detail && ({ password: '门锁密码（点击当天读取）', key_handover: '钥匙交接', property_keybox: '物业钥匙柜' }[order.detail.entry] || '');
      const categoryNames = { paper: '纸类', plastic: '塑料', metal: '金属', clothing: '衣物', appliance: '小家电' };
      this.setData({ order, recycleRows: order.serviceCode === 'recycle' ? order.detail.categories.map(code => ({ code, name: categoryNames[code],
        value: Object.prototype.hasOwnProperty.call(this.data.weightsTenths, code) ? String(this.data.weightsTenths[code] / 10) : '' })) : [], slotText: slotText(order.slot), goodsCap: yuan(order.pricing.goodsCap),
        pickupText: order.detail && order.detail.pickupCodes ? order.detail.pickupCodes.join('、') : '', entryText });
      this.taskContext = { userId, orderId, read: token };
      this.setData({ taskReady: true });
      if (this.reportOutcome?.userId === userId && this.reportOutcome?.orderId === orderId) {
        const message = this.reportOutcome.message;
        this.reportOutcome = null;
        if (order.serviceCode === 'vacant' && order.status === 'in_service' && order.featureEnabled) {
          this.setData({ error: (message || '报告提交失败') + '；已核对任务尚未完成，请检查草稿后重试提交' });
        }
      }
      if (order.canShareLocation && ['accepted', 'in_service'].includes(order.status)) {
        this.uploadLocation();
        this.locationTimer = setInterval(() => this.uploadLocation(), 30000);
      }
    } catch (error) { if (current()) {
      this.taskUpload = null; this.phoneRequest = null;
      const pending = this.reportOutcome?.userId === userId && this.reportOutcome?.orderId === orderId;
      this.setData({ uploading: false, callingResident: false,
        error: pending ? '提交结果待核对，请重试读取。' + (error.message || '任务加载失败') : (error.message || '任务加载失败') });
    } }
    finally { if (current()) { this.setData({ loading: false }); this.applyTaskUpload(); this.applyPhoneResult(); } }
  },
  async uploadLocation() {
    const context = this.taskContext;
    const current = () => context && this.taskContext === context && this.visible &&
      this.taskRead === context.read && this.orderId === context.orderId &&
      getApp().globalData.user?._id === context.userId && this.data.order?.canShareLocation &&
      ['accepted', 'in_service'].includes(this.data.order.status);
    if (!current() || this.locationBusy) return;
    const request = this.locationRequest = {};
    this.locationBusy = true;
    try {
      const point = await new Promise((resolve, reject) => wx.getLocation({ type: 'gcj02', success: resolve, fail: reject }));
      if (!current() || this.locationRequest !== request) return;
      await api.call('provider', 'updateLocation', { orderId: context.orderId, lat: point.latitude, lng: point.longitude }, { loading: false, silent: true });
    } catch (_) { /* 用户拒绝定位或定位暂不可用时，不影响订单操作。 */ }
    finally { if (this.locationRequest === request) { this.locationRequest = null; this.locationBusy = false; } }
  },
  goods(event) { this.setData({ goodsYuan: event.detail.value }); },
  weight(event) { const v = event.detail.value; const value = /^\d{1,5}(?:\.\d)?$/.test(v) ? Math.round(Number(v) * 10) : 0;
    this.setData({ ['weightsTenths.' + event.currentTarget.dataset.code]: value,
      recycleRows: this.data.recycleRows.map(row => row.code === event.currentTarget.dataset.code ? { ...row, value: v } : row) }); },
  visitCheck(event) {
    const checked = new Set(event.detail.value || []);
    this.setData({ weightsTenths: {}, visitChecks: { mental: checked.has('mental'), diet: checked.has('diet'),
      utilities: checked.has('utilities'), doors: checked.has('doors'), medical: checked.has('medical') } });
  },
  visitNotes(event) { this.setData({ visitNotes: event.detail.value }); },
  visitAttention(event) {
    this.attentionRevision = (this.attentionRevision || 0) + 1;
    this.phoneRequest = null;
    this.setData({ visitAttention: event.detail.value, attentionCallConfirmed: false, callingResident: false });
  },
  checklist(event) { this.setData({ ['checklist.' + event.currentTarget.dataset.key]: Boolean((event.detail.value || []).length) }); },
  vacantNotes(event) { this.setData({ vacantNotes: event.detail.value }); },
  vacantAttention(event) { this.setData({ vacantAttention: event.detail.value }); },
  vacantPhoto(event) { return this.uploadTaskPhoto('vacant', event.currentTarget.dataset.key); },
  removeVacantPhoto(event) {
    if (!this.visible || this.data.loading || !this.data.taskReady || this.data.busy || this.data.uploading) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const { key, file } = event.currentTarget.dataset;
    const index = Number(event.currentTarget.dataset.index);
    if (!this.taskUploadAllowed({ ...context, serviceCode: 'vacant', type: 'vacant', key })) return;
    const photos = this.data.photoByItem[key] || [];
    if (!Number.isInteger(index) || index < 0 || index >= photos.length || photos[index] !== file) return;
    // 只编辑当前报告草稿，不删除云文件。
    this.setData({ ['photoByItem.' + key]: photos.filter((_, i) => i !== index), error: '' });
  },
  revealEntry() {
    if (!this.visible || this.data.loading || !this.data.taskReady) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const order = this.data.order;
    if (!this.orderId || this.data.busy || order?.serviceCode !== 'vacant' || order.detail?.entry !== 'password') return;
    const current = () => this.visible && this.taskContext === context && this.taskRead === context.read &&
      getApp().globalData.user?._id === context.userId && this.orderId === context.orderId && this.data.taskReady;
    return entryDisplay.reveal(this, () => api.call('vacant', 'revealEntry', { orderId: context.orderId },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: current }), current, () => this.load());
  },
  closeSecret() { entryDisplay.clear(this); },
  async submitVacantReport() {
    if (!this.visible || this.data.loading || !this.data.taskReady || this.data.busy || this.data.uploading) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const current = () => this.visible && this.taskContext === context && this.taskRead === context.read &&
      this.orderId === context.orderId && getApp().globalData.user?._id === context.userId &&
      this.data.taskReady && !this.data.loading && this.data.order?.serviceCode === 'vacant' &&
      this.data.order.featureEnabled && this.data.order.status === 'in_service';
    if (!current() || this.reportRequest) return;
    const invalid = vacantItems.filter(item => {
      const count = (this.data.photoByItem[item.key] || []).length;
      return count < 1 || count > 3;
    });
    if (invalid.length) {
      this.setData({ error: invalid.map(item => item.label).join('、') + '：每项需1—3张照片，请补拍或移除多余照片' });
      return;
    }
    const request = this.reportRequest = {};
    const active = () => this.reportRequest === request && current();
    const attention = this.data.vacantAttention;
    this.setData({ busy: true, error: '' });
    try {
      await api.call('vacant', 'recordReport', { orderId: context.orderId, checklist: this.data.checklist,
        photoByItem: this.data.photoByItem, notes: this.data.vacantNotes, attention },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      wx.showToast({ title: attention ? '报告已提交，请关注异常' : '巡检报告已提交' });
      await this.load();
    } catch (error) {
      if (active()) {
        this.reportOutcome = { userId: context.userId, orderId: context.orderId, message: error.message };
        // 提交可能已经落库；先只读核对，读取失败时不恢复旧表单或再次提交。
        await this.load();
      }
    }
    finally {
      if (this.reportRequest === request && this.visible && this.taskContext === context &&
        this.orderId === context.orderId && getApp().globalData.user?._id === context.userId) {
        this.reportRequest = null; this.setData({ busy: false });
      }
    }
  },
  photo(event) { return this.uploadTaskPhoto(event.currentTarget.dataset.type); },
  taskUploadAllowed(request) {
    const order = this.data.order;
    return this.taskContext && this.taskContext.userId === request.userId && this.taskContext.orderId === request.orderId &&
      order?.featureEnabled && order.status === 'in_service' && order.serviceCode === request.serviceCode &&
      ((request.type === 'photos' && order.serviceCode !== 'pet') || (request.type === 'receipt' && ['buy', 'meal'].includes(order.serviceCode)) ||
        (request.type === 'vacant' && order.serviceCode === 'vacant' && vacantItems.some(item => item.key === request.key)));
  },
  applyTaskUpload() {
    const request = this.taskUpload;
    if (!request || !this.visible || this.data.loading || getApp().globalData.user?._id !== request.userId || this.orderId !== request.orderId) return;
    if (!this.data.taskReady || !this.taskUploadAllowed(request)) {
      this.taskUpload = null; this.setData({ uploading: false }); return;
    }
    if (!request.result) return;
    this.taskUpload = null;
    const { files, error } = request.result;
    const patch = { uploading: false };
    if (error) patch.error = error;
    else if (files?.length) {
      if (request.type === 'receipt') patch.receiptPhoto = files[0];
      else if (request.type === 'vacant') {
        const photos = this.data.photoByItem[request.key] || [];
        if (photos.length + files.length > 3) patch.error = '每项最多3张照片，请先移除多余照片';
        else patch['photoByItem.' + request.key] = [...photos, ...files];
      }
      else patch.photos = files;
    }
    this.setData(patch);
  },
  async uploadTaskPhoto(type, key) {
    if (!this.visible || this.data.loading || !this.data.taskReady) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    if (this.data.busy || this.taskUpload) return;
    const request = { userId: context.userId, orderId: context.orderId, serviceCode: this.data.order?.serviceCode, type, key };
    if (!this.taskUploadAllowed(request)) return;
    if (type === 'vacant' && (this.data.photoByItem[key] || []).length >= 3) {
      this.setData({ error: '每项最多3张照片，请先移除再重拍' }); return;
    }
    this.taskUpload = request;
    this.setData({ uploading: true, error: '' });
    try {
      const folder = type === 'vacant' ? 'vacant/' + request.orderId + '/' + key : 'orders/' + request.orderId;
      const files = await uploadPhotos(folder, type === 'photos' ? 3 : 1, { loading: false });
      if (this.taskUpload === request) request.result = { files };
    } catch (error) {
      if (this.taskUpload === request) request.result = { error: /cancel/i.test(error.errMsg || error.message || '') ? '' : error.message || '未完成拍照上传，请重试' };
    } finally { if (this.taskUpload === request) this.applyTaskUpload(); }
  },
  async releaseTask() {
    if (!this.visible || this.data.loading || !this.data.taskReady || this.data.busy || this.releaseRequest) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId) return this.load();
    const current = () => this.visible && this.taskContext === context && this.taskRead === context.read &&
      this.orderId === context.orderId && getApp().globalData.user?._id === context.userId &&
      this.data.taskReady && !this.data.loading && this.data.order?.status === 'accepted';
    if (!current()) return;
    const request = this.releaseRequest = {};
    const active = () => this.releaseRequest === request && current();
    this.setData({ busy: true, error: '' });
    try {
      const answer = await new Promise((resolve, reject) => wx.showModal({ title: '放弃任务',
        content: '放弃后，你将不能再次接取这笔订单。确认放弃吗？', success: resolve, fail: reject }));
      if (!active() || !answer.confirm) return;
      await api.call('provider', 'release', { orderId: context.orderId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      wx.redirectTo({ url: '/provider/workbench/workbench' });
    } catch (error) {
      if (active()) this.setData({ error: error.message || '放弃任务未完成，请刷新核对后重试' });
    } finally {
      if (this.releaseRequest === request && this.visible && this.taskContext === context &&
        this.orderId === context.orderId && getApp().globalData.user?._id === context.userId) {
        this.releaseRequest = null;
        this.setData({ busy: false });
      }
    }
  },
  async act(event) {
    if (!this.orderId) return;
    const action = event.currentTarget.dataset.action;
    if (this.data.busy || this.data.uploading || !['start', 'release', 'deliver'].includes(action)) return;
    if (action === 'release') return this.releaseTask();
    if (!this.visible || this.data.loading || !this.data.taskReady || this.workRequest) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const current = () => this.visible && this.taskContext === context && this.taskRead === context.read &&
      this.orderId === context.orderId && getApp().globalData.user?._id === context.userId &&
      this.data.taskReady && !this.data.loading && this.data.order?.featureEnabled &&
      this.data.order.status === (action === 'start' ? 'accepted' : 'in_service') &&
      !(action === 'deliver' && ['vacant', 'pet'].includes(this.data.order.serviceCode));
    if (!current()) return;
    const request = this.workRequest = {};
    const active = () => this.workRequest === request && current();
    this.setData({ busy: true, error: '' });
    try {
      const actionData = this.data.order.serviceCode === 'recycle' && action === 'deliver' ? { orderId: context.orderId, weightsTenths: this.data.weightsTenths } : { orderId: context.orderId, photos: this.data.photos,
        receiptPhoto: this.data.receiptPhoto, goodsActual: toFen(this.data.goodsYuan),
        visitReport: this.data.order.serviceCode === 'visit' ? { checks: this.data.visitChecks, notes: this.data.visitNotes,
          attention: this.data.visitAttention, attentionCallConfirmed: this.data.attentionCallConfirmed } : undefined };
      await api.call('provider', action, actionData,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (active()) await this.load();
    } catch (error) { if (active()) this.setData({ error: error.message || '操作未完成，请刷新核对后重试' }); }
    finally {
      if (this.workRequest === request && this.visible && this.taskContext === context &&
        this.orderId === context.orderId && getApp().globalData.user?._id === context.userId) {
        this.workRequest = null;
        this.setData({ busy: false });
      }
    }
  },
  callResident() {
    if (!this.visible || this.data.loading || !this.data.taskReady || this.phoneRequest) return;
    const context = this.taskContext;
    if (!context || getApp().globalData.user?._id !== context.userId || this.orderId !== context.orderId) return this.load();
    const order = this.data.order;
    if (!order?.canCallResident || !order.userPhone) return;
    const request = this.phoneRequest = { userId: context.userId, orderId: context.orderId,
      phone: order.userPhone, serviceCode: order.serviceCode, attention: this.data.visitAttention,
      revision: this.attentionRevision || 0 };
    this.setData({ callingResident: true, error: '' });
    const finish = result => {
      if (this.phoneRequest !== request) return;
      request.result = result;
      this.applyPhoneResult();
    };
    try {
      wx.makePhoneCall({ phoneNumber: request.phone, success: () => finish({ success: true }),
        fail: error => finish({ error: /cancel/i.test(error.errMsg || error.message || '') ? '' : '未能发起电话联系，请重试' }) });
    } catch (_) { finish({ error: '未能发起电话联系，请重试' }); }
  },
  applyPhoneResult() {
    const request = this.phoneRequest;
    if (!request || !this.visible || this.data.loading) return;
    const context = this.taskContext, order = this.data.order;
    const valid = this.data.taskReady && context && context.userId === request.userId &&
      context.orderId === request.orderId && this.orderId === request.orderId &&
      getApp().globalData.user?._id === request.userId && order?.canCallResident &&
      order.userPhone === request.phone && order.serviceCode === request.serviceCode &&
      (this.attentionRevision || 0) === request.revision;
    if (!valid) {
      this.phoneRequest = null;
      if (context && getApp().globalData.user?._id === context.userId && this.orderId === context.orderId) {
        this.setData({ callingResident: false });
      }
      return;
    }
    if (!request.result) return;
    this.phoneRequest = null;
    const patch = { callingResident: false };
    if (request.result.error) patch.error = request.result.error;
    // 仅记录原任务发起过联系，不将系统成功回调等同于对方已接听。
    if (request.result.success && request.serviceCode === 'visit' && request.attention && this.data.visitAttention) {
      patch.attentionCallConfirmed = true;
    }
    this.setData(patch);
  },
  openChat() {
    if (!this.orderId) return; wx.navigateTo({ url: '/chat/room/room?orderId=' + encodeURIComponent(this.orderId) }); }
  ,openPetTasks() {
    if (!this.orderId) return; wx.navigateTo({ url: '/pet/work?id=' + encodeURIComponent(this.orderId) }); }
});
