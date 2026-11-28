const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display, slotText } = require('../../utils/time');
const subscriptions = require('../../utils/subscriptions');
Page({
  data: { ready: false, loading: true, savingPoster: false, busy: false, error: '', provider: null, tasks: [], todayCount: 0, todayIncome: '0.00' },
  onShow() { this.visible = true; return this.load({ preservePoster: true }); },
  clearContext() {
    if (!this.posterRequest?.native) this.posterRequest = null;
    this.context = null; this.operation = null; this.read = (this.read || 0) + 1;
    this.setData({ ready: false, busy: false, savingPoster: !!this.posterRequest, provider: null, tasks: [], hasMore: false,
      todayCount: 0, todayIncome: '0.00', insuranceText: '', stationDeliveryEnabled: false, reminderHint: '' });
  },
  onHide() { this.visible = false; this.clearContext(); },
  onUnload() { this.posterRequest = null; this.onHide(); },
  current(context) {
    return Boolean(context && this.visible && this.read === context.read &&
      getApp().globalData.user?._id === context.userId);
  },
  rows(list) { return list.map(order => ({ ...order, amountText: yuan(order.pricing.payAmount + order.pricing.goodsCap),
    createdText: display(order.createdAt), slotText: slotText(order.slot) })); },
  async load(options = {}) {
    if (!this.visible) return;
    if (!options.preservePoster) this.posterRequest = null;
    this.clearContext();
    this.pageError = false;
    const read = this.read;
    let userId, communityId;
    const pageCurrent = () => this.visible && this.read === read;
    const current = () => pageCurrent() && (!userId || (getApp().globalData.user?._id === userId &&
      getApp().globalData.user?.communityId === communityId));
    const apiOptions = { loading: false, silent: true, redirectOnForbidden: false, isActive: current };
    this.setData({ remainingReminders: subscriptions.remaining() });
    this.setData({ loading: true, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id; communityId = user?.communityId;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (this.posterRequest && this.posterRequest.userId !== userId) this.posterRequest = null;
      if (!current()) return;
      const result = await api.call('provider', 'myStatus', {}, apiOptions);
      if (!current()) return;
      let tasks = { list: [], hasMore: false };
      if (result.provider?.status === 'approved') {
        tasks = await api.call('provider', 'myTasks', {}, apiOptions);
        if (!current()) return;
      }
      this.setData({ provider: result.provider, todayCount: result.todayCount, todayIncome: yuan(result.todayIncome),
        tasks: this.rows(tasks.list), hasMore: tasks.hasMore,
        stationDeliveryEnabled: Boolean(getApp().globalData.community && getApp().globalData.community.features &&
          getApp().globalData.community.features.stationDelivery),
        insuranceText: result.provider ? display(result.provider.insuranceUntil).slice(0, 10) : '' });
      this.context = { userId, read };
      this.setData({ ready: true, savingPoster: !!this.posterRequest });
    } catch (error) { if (current()) { this.posterRequest = null; this.setData({ savingPoster: false, error: error.message || '加载失败，请重试' }); } }
    finally {
      if (current()) { this.setData({ loading: false }); this.applyPosterResult(); }
      else if (pageCurrent() && userId) this.setData({ loading: false, error: '登录身份已变化，请重新加载' });
    }
  },
  retry() { return this.pageError ? this.more() : this.load(); },
  async more() {
    if (!this.visible || this.data.loading || this.data.busy || this.data.savingPoster || !this.data.hasMore) return;
    if (!this.current(this.context)) return this.load();
    const context = this.context = { ...this.context, read: ++this.read };
    const current = () => this.context === context && this.current(context);
    this.pageError = false;
    this.setData({ loading: true, ready: false, error: '' });
    try {
      const result = await api.call('provider', 'myTasks', { offset: this.data.tasks.length },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (current()) this.setData({ tasks: [...this.data.tasks, ...this.rows(result.list)], hasMore: result.hasMore, ready: true });
    } catch (error) { if (current()) {
      this.pageError = error.code !== 'E_FORBIDDEN';
      if (!this.pageError) this.clearContext();
      this.setData({ loading: false, error: error.message });
    } }
    finally { if (current()) this.setData({ loading: false }); }
  },
  async duty(event) {
    if (!this.visible || this.data.loading || this.data.busy || !this.data.ready) return;
    const context = this.context;
    if (!this.current(context)) return this.load();
    if (this.data.provider?.status !== 'approved') return;
    const operation = this.operation = {};
    const current = () => this.operation === operation && this.context === context && this.current(context) && this.data.ready;
    const on = Boolean(event.detail.value);
    this.setData({ busy: true, error: '' });
    try {
      await api.call('provider', 'setDuty', { on }, { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (on) {
        await subscriptions.request(['newTask'], { isActive: current });
        if (!current()) return;
        const count = subscriptions.remaining();
        this.setData({ remainingReminders: count, reminderHint: count < 3 ? '提醒次数少于 3 次，可再次点击订阅补充' : '' });
      }
      await this.load();
    }
    catch (error) { if (current()) this.setData({ error: error.message, 'provider.onDuty': !on }); }
    finally { if (current()) { this.operation = null; this.setData({ busy: false }); } }
  },
  async subscribeMore() {
    if (!this.visible || this.data.loading || this.data.busy || !this.data.ready) return;
    const context = this.context;
    if (!this.current(context)) return this.load();
    if (this.data.provider?.status !== 'approved') return;
    const current = () => this.context === context && this.current(context) && this.data.ready;
    await subscriptions.request(['newTask'], { isActive: current });
    if (!current()) return;
    const count = subscriptions.remaining();
    this.setData({ remainingReminders: count, reminderHint: count < 3 ? '提醒次数少于 3 次，可再次点击订阅补充' : '' });
  },
  applyPosterResult() {
    const request = this.posterRequest;
    if (!request?.result || !this.current(this.context) || !this.data.ready || this.data.loading) return;
    this.posterRequest = null;
    this.setData({ savingPoster: false });
    if (request.userId !== this.context.userId) return;
    if (request.result.error) this.setData({ error: request.result.error });
    else wx.showToast({ title: '推荐码已保存', icon: 'success' });
  },
  async saveReferralPoster() {
    if (!this.visible || !this.data.ready || this.data.loading || this.data.savingPoster) return;
    const context = this.context;
    if (!this.current(context)) return this.load();
    if (this.data.provider?.status !== 'approved') return;
    const request = this.posterRequest = { userId: context.userId, native: false };
    const current = () => this.posterRequest === request && this.context === context && this.current(context) && this.data.ready;
    const fail = error => {
      if (!current()) return;
      this.posterRequest = null;
      this.setData({ savingPoster: false, error: error.errMsg || error.message || '推荐码保存失败' });
    };
    this.setData({ savingPoster: true, error: '' });
    try {
      const result = await api.call('provider', 'referralPoster', {},
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      wx.downloadFile({ url: result.tempFileURL, success: file => {
        if (!current()) return;
        if (file.statusCode !== 200) return fail(Error('推荐码下载失败'));
        request.native = true;
        const finish = async result => {
          if (this.posterRequest !== request) return;
          if (getApp().globalData.user?._id !== request.userId) { this.posterRequest = null; return; }
          request.result = result;
          // 相册授权可能隐藏页面，返回后重新核验原本人资格再显示结果。
          if (this.visible) await this.load({ preservePoster: true });
        };
        try { wx.saveImageToPhotosAlbum({ filePath: file.tempFilePath,
          success: () => finish({}), fail: error => finish({ error: error.errMsg || '保存失败，请检查相册权限' }) }); }
        catch (error) { finish({ error: error.message || '保存失败，请检查相册权限' }); }
      }, fail });
    } catch (error) { fail(error); }
  },
  task(event) {
    if (!this.visible || this.data.loading || !this.data.ready) return;
    if (!this.current(this.context)) return this.load();
    const id = event.currentTarget.dataset.id;
    if (this.data.tasks.some(task => task._id === id)) wx.navigateTo({ url: '/provider/task/task?id=' + encodeURIComponent(id) });
  }
});
