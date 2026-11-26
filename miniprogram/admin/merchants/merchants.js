const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
function appendUnique(previous, incoming) {
  return [...new Map([...previous, ...incoming].map(item => [item._id, item])).values()];
}
Page({
  data: { loading: true, ready: false, busy: false, error: '', list: [], hasMore: false, offset: 0,
    selected: null, services: [], servicesReady: false, servicesLoading: false, servicesError: '', servicesHasMore: false, servicesOffset: 0, statusIndex: 0,
    statuses: ['pending', 'approved', 'rejected', 'suspended', ''],
    statusLabels: ['待审核', '已通过', '已拒绝', '已停用', '全部'],
    statusNames: { pending: '待审核', approved: '已通过', rejected: '已拒绝', suspended: '已停用' } },
  onShow() { this._hidden = false; return this.load(true); },
  onHide() {
    this._hidden = true;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.inspectSequence = (this.inspectSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, ready: false, busy: false, list: [], hasMore: false, offset: 0,
      selected: null, services: [], servicesReady: false, servicesLoading: false,
      servicesHasMore: false, servicesOffset: 0 });
  },
  onUnload() { this._closed = true; this.onHide(); },
  currentRead() {
    const user = getApp().globalData.user;
    return Boolean(this.readContext && !this._hidden && !this._closed && this.data.ready && !this.data.loading &&
      user && user._id === this.readContext.userId && Array.isArray(user.roles) && user.roles.includes('admin'));
  },
  invalidateIdentity(message = '登录身份已变化，请重新加载') {
    if (this._hidden || this._closed) return;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.inspectSequence = (this.inspectSequence || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, ready: false, busy: false, error: message, list: [], hasMore: false, offset: 0,
      selected: null, services: [], servicesReady: false, servicesLoading: false,
      servicesHasMore: false, servicesOffset: 0 });
  },
  onReachBottom() { return this.loadMore(); },
  loadMore() { return this.load(false); },
  retry() { return this.load(this._failedReset !== false); },
  async load(reset = true) {
    if (this._closed || this._hidden || (!reset && (this.data.loading || !this.data.hasMore || this.data.busy))) return;
    if (!reset && !this.currentRead()) { this.invalidateIdentity(); return; }
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    let userId = reset ? undefined : this.readContext?.userId;
    const isActive = () => !this._closed && !this._hidden && sequence === this.loadSequence &&
      (!userId || getApp().globalData.user?._id === userId);
    const offset = reset ? 0 : this.data.offset;
    this._failedReset = reset;
    if (reset) { this.inspectSequence = (this.inspectSequence || 0) + 1; this.readContext = null; this.operation = null; }
    this.setData({ loading: true, error: '', ...(reset ? { ready: false, busy: false, list: [], offset: 0, hasMore: false,
      selected: null, services: [], servicesReady: false, servicesLoading: false,
      servicesError: '', servicesHasMore: false, servicesOffset: 0 } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!isActive()) return;
      userId = user?._id;
      if (!userId || !Array.isArray(user.roles) || !user.roles.includes('admin')) throw new Error('仅管理员可审核商家');
      const result = await api.call('merchant', 'adminList', { status: this.data.statuses[this.data.statusIndex], offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive });
      if (!isActive()) return;
      if (!result.list.length && result.hasMore) throw new Error('商家列表分页异常，请重试');
      if (reset) this.readContext = { userId, sequence };
      this.setData({ ready: true, list: appendUnique(reset ? [] : this.data.list, result.list),
        offset: offset + result.list.length, hasMore: result.hasMore });
    } catch (error) {
      if (isActive()) {
        if (error.code === 'E_FORBIDDEN') this.invalidateIdentity(error.message || '无权查看商家申请');
        else this.setData({ error: error.message || '商家申请加载失败' });
      }
    } finally {
      if (isActive()) this.setData({ loading: false });
      else if (sequence === this.loadSequence && !this._hidden && !this._closed) this.invalidateIdentity();
    }
  },
  async filter(event) {
    if (this._closed || this.data.busy) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const statusIndex = Number(event.detail.value);
    if (!Number.isInteger(statusIndex) || statusIndex < 0 || statusIndex >= this.data.statuses.length) return;
    this.setData({ statusIndex }); await this.load();
  },
  async inspect(event) {
    if (this._closed || this.data.loading || this.data.busy) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const merchant = this.data.list.find(item => item._id === event.currentTarget.dataset.id);
    if (!merchant) return;
    this.setData({ selected: merchant });
    return this.loadServices(true);
  },
  loadMoreServices() { return this.loadServices(false); },
  retryServices() { return this.loadServices(this._servicesFailedReset !== false); },
  async loadServices(reset = true) {
    const merchant = this.data.selected;
    if (this._closed || this._hidden || !merchant || (!reset && (this.data.servicesLoading || !this.data.servicesHasMore || this.data.busy))) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const context = this.readContext;
    const sequence = this.inspectSequence = (this.inspectSequence || 0) + 1;
    const isActive = () => context === this.readContext && this.currentRead() &&
      sequence === this.inspectSequence && this.data.selected?._id === merchant._id;
    const offset = reset ? 0 : this.data.servicesOffset;
    this._servicesFailedReset = reset;
    this.setData({ servicesLoading: true, servicesError: '',
      ...(reset ? { servicesReady: false, services: [], servicesOffset: 0, servicesHasMore: false } : {}) });
    try {
      const result = await api.call('merchant', 'adminServices', { merchantId: merchant._id, offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive });
      if (!isActive()) return;
      if (!result.list.length && result.hasMore) throw new Error('服务列表分页异常，请重试');
      const services = result.list.map(item => ({ ...item, priceText: yuan(item.price) }));
      this.setData({ servicesReady: true, services: appendUnique(reset ? [] : this.data.services, services), servicesOffset: offset + result.list.length,
        servicesHasMore: result.hasMore });
    } catch (error) {
      if (isActive()) {
        if (error.code === 'E_FORBIDDEN') this.invalidateIdentity(error.message || '无权查看商家服务');
        else this.setData({ servicesError: error.message || '服务加载失败' });
      }
    } finally {
      if (isActive()) this.setData({ servicesLoading: false });
      else if (context === this.readContext && !this._hidden && !this._closed && !this.currentRead()) this.invalidateIdentity();
    }
  },
  beginOperation() {
    if (this.data.busy || this.data.servicesLoading || !this.currentRead()) {
      if (!this.currentRead()) this.invalidateIdentity();
      return null;
    }
    const merchant = this.data.selected;
    if (!merchant || !this.data.list.some(item => item._id === merchant._id)) return null;
    const operation = this.operation = { context: this.readContext, merchantId: merchant._id,
      listSequence: this.loadSequence, serviceSequence: this.inspectSequence };
    this.setData({ busy: true, error: '', servicesError: '' });
    return operation;
  },
  operationCurrent(operation) {
    return this.operation === operation && this.currentRead() && this.readContext === operation.context &&
      this.loadSequence === operation.listSequence && this.inspectSequence === operation.serviceSequence &&
      this.data.selected?._id === operation.merchantId;
  },
  finishOperation(operation) {
    if (this.operation === operation) { this.operation = null; this.setData({ busy: false }); }
  },
  async review(event) {
    const approved = event.currentTarget.dataset.approved === 'true', merchant = this.data.selected;
    const operation = this.beginOperation();
    if (!operation) return;
    if (merchant.status !== 'pending') { this.finishOperation(operation); return; }
    let sent = false;
    try {
      const note = await new Promise((resolve, reject) => wx.showModal({ title: approved ? '通过商家入驻' : '拒绝商家入驻',
        editable: true, placeholderText: '审核说明（选填）',
        success: result => resolve(result.confirm ? result.content || '' : null), fail: reject }));
      if (!this.operationCurrent(operation)) { if (!this.currentRead()) this.invalidateIdentity(); return; }
      if (note === null) return;
      sent = true;
      await api.call('merchant', 'review', { merchantId: operation.merchantId, approved, note },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.operationCurrent(operation) });
      if (!this.operationCurrent(operation)) { if (!this.currentRead()) this.invalidateIdentity(); return; }
      this.finishOperation(operation);
      await this.load(true);
    } catch (error) {
      if (this.operationCurrent(operation)) {
        if (sent) this.invalidateIdentity('审核结果待核对，请重新加载');
        else this.setData({ error: '审核确认窗口未能打开，请重试' });
      } else if (!this.currentRead()) this.invalidateIdentity();
    } finally { this.finishOperation(operation); }
  },
  async serviceStatus(event) {
    const operation = this.beginOperation();
    if (!operation) return;
    const serviceId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (this.data.selected.status !== 'approved' || !this.data.servicesReady ||
        !this.data.services.some(item => item._id === serviceId) || !['on', 'off'].includes(status)) {
      this.finishOperation(operation); return;
    }
    try {
      await api.call('merchant', 'setServiceStatus', { serviceId, status },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.operationCurrent(operation) });
      if (!this.operationCurrent(operation)) { if (!this.currentRead()) this.invalidateIdentity(); return; }
      this.finishOperation(operation);
      await this.loadServices(true);
    } catch (error) {
      if (this.operationCurrent(operation)) this.invalidateIdentity('服务状态待核对，请重新加载');
      else if (!this.currentRead()) this.invalidateIdentity();
    } finally { this.finishOperation(operation); }
  }
});
