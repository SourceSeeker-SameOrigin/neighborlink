const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { slotText } = require('../../utils/time');
const subscriptions = require('../../utils/subscriptions');
Page({
  data: { ready: false, loading: false, busy: false, error: '', tasks: [], hasMore: true, stationDeliveryEnabled: false },
  onShow() {
    this.visible = true;
    clearInterval(this.timer);
    const loading = this.load(true);
    this.timer = setInterval(() => { if (!this.data.loading && !this.data.busy) this.load(true); }, 15000);
    return loading;
  },
  clearContext() {
    this.context = null; this.operation = null; this.read = (this.read || 0) + 1;
    this.nextOffset = 0;
    this.setData({ ready: false, busy: false, tasks: [], hasMore: true, stationDeliveryEnabled: false });
  },
  onHide() { this.visible = false; clearInterval(this.timer); this.clearContext(); },
  onUnload() { this.onHide(); },
  current(context) {
    return Boolean(context && this.visible && this.read === context.read && getApp().globalData.user?._id === context.userId);
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  more() { return this.load(); },
  retry() { return this.load(!this.pageError); },
  async load(reset = false) {
    if (!this.visible || (!reset && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    if (!reset && !this.current(this.context)) return this.load(true);
    if (reset) this.clearContext();
    else { this.operation = null; this.read++; }
    const read = this.read;
    let userId;
    const current = () => this.visible && this.read === read && (!userId || getApp().globalData.user?._id === userId);
    this.pageError = false;
    this.setData({ loading: true, ready: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      let nextOffset = reset ? 0 : this.nextOffset;
      let hasMore = true;
      const found = [];
      // 一次页面读取最多扫描 5 个原始批次；仍有后页时保留手动入口。
      for (let scan = 0; scan < 5 && hasMore && !found.length; scan++) {
        const result = await api.call('provider', 'hall', { offset: nextOffset },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
        if (!current()) return;
        found.push(...result.list);
        const after = Number.isInteger(result.nextOffset) ? result.nextOffset : nextOffset + result.list.length;
        if (after <= nextOffset && result.hasMore) throw Error('任务分页结果异常，请重试');
        nextOffset = after;
        hasMore = !!result.hasMore;
      }
      if (!current()) return;
      const seen = new Set((reset ? [] : this.data.tasks).map(item => item._id));
      const tasks = found.filter(item => !seen.has(item._id)).map(item => ({ ...item,
        income: yuan(item.estimatedIncome), slotText: slotText(item.slot) }));
      this.nextOffset = nextOffset;
      this.context = { userId, read };
      this.setData({ tasks: reset ? tasks : [...this.data.tasks, ...tasks], hasMore, ready: true,
        stationDeliveryEnabled: Boolean(getApp().globalData.community?.features?.stationDelivery) });
    } catch (error) {
      if (current()) {
        this.pageError = !reset && error.code !== 'E_FORBIDDEN';
        if (error.code === 'E_FORBIDDEN') this.clearContext();
        else if (!reset) this.context = { userId, read };
        this.setData({ loading: false, error: error.message || '任务加载失败' });
      }
    } finally { if (current()) this.setData({ loading: false }); }
  },
  async accept(event) {
    if (!this.visible || this.data.loading || this.data.busy || !this.data.ready) return;
    const context = this.context;
    if (!this.current(context)) return this.load(true);
    const orderId = event.currentTarget.dataset.id;
    if (!this.data.tasks.some(task => task._id === orderId)) return;
    const operation = this.operation = {};
    const current = () => this.operation === operation && this.context === context && this.current(context) && this.data.ready;
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call('provider', 'accept', { orderId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      subscriptions.consume();
      await subscriptions.request(['newTask'], { isActive: current });
      if (!current()) return;
      wx.navigateTo({ url: '/provider/task/task?id=' + encodeURIComponent(result.orderId) });
    } catch (error) { if (current()) this.setData({ error: error.message }); }
    finally { if (current()) { this.operation = null; this.setData({ busy: false }); } }
  }
});
