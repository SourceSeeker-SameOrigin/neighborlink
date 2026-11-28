const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { lifecycle, currentVisit, readList } = require('../../utils/visible-list');
const { discountText } = require('../presentation');

const STATUS = { unused: '未使用', locked: '已锁定', used: '已使用', expired: '已过期' };
function present(item) {
  return { ...item, statusText: STATUS[item.status] || item.status,
    discountText: discountText(item), validText: display(item.validTo),
    thresholdText: item.threshold ? '满 ' + yuan(item.threshold) + ' 元可用' : '无门槛' };
}

const firstPage = { offset: 0, hasMore: false, loadingMore: false, moreError: '', ownerId: '' };

Page({
  ...lifecycle,
  data: { ...firstPage, loading: true, error: '', list: [], retrying: false, retryError: '', retryMessage: '', canRetry: false },
  onHide() {
    lifecycle.onHide.call(this);
    this.setData({ ...firstPage, list: [], canRetry: false, retrying: false,
      retryError: '', retryMessage: '', loading: false, error: '' });
  },
  onUnload() { this.onHide(); lifecycle.onUnload.call(this); },
  load() {
    return readList(this, { ...firstPage, list: [], canRetry: false, retrying: false }, '优惠券加载失败', async (user, options) => {
      const result = await api.call('coupon', 'mine', { offset: 0 }, options);
      return { canRetry: true, list: result.list.map(present), ownerId: user._id,
        offset: result.nextOffset || 0, hasMore: !!result.hasMore };
    }, this._pendingClaim);
  },
  async loadMore() {
    const visible = currentVisit(this);
    const sequence = this._readSequence;
    const active = () => visible() && sequence === this._readSequence;
    if (!active() || this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const user = await getApp().ensureSession();
      if (!active()) return;
      if (user._id !== this.data.ownerId) return this.load();
      const offset = this.data.offset;
      const result = await api.call('coupon', 'mine', { offset }, { loading: false, silent: true, isActive: active });
      if (!active()) return;
      if (getApp().globalData.user?._id !== user._id) return this.load();
      const seen = new Set(this.data.list.map(item => item._id));
      const next = result.list.filter(item => !seen.has(item._id)).map(present);
      this.setData({ list: this.data.list.concat(next), offset: result.nextOffset, hasMore: !!result.hasMore });
    } catch (error) {
      if (active()) this.setData({ moreError: error.message || '优惠券加载失败，请重试' });
    } finally {
      if (active()) this.setData({ loadingMore: false });
    }
  },
  async retryWelcome() {
    const visible = currentVisit(this);
    const user = getApp().globalData.user;
    if (!visible() || !user?._id || user._id !== this.data.ownerId) {
      this.setData({ ...firstPage, list: [], canRetry: false });
      return;
    }
    const active = () => visible() && getApp().globalData.user?._id === user._id &&
      getApp().globalData.user?.communityId === user.communityId;
    if (this._pendingClaim || this.data.retrying || !this.data.canRetry) return;
    this.setData({ retrying: true, retryError: '', retryMessage: '' });
    try {
      this._pendingClaim = api.call('user', 'retryWelcomeCoupons', {},
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      await this._pendingClaim;
      if (active()) {
        this.setData({ retryMessage: '领取检查已完成，可领取的赠券已入账，已领过的不会重复发放。' });
        await this.load();
      }
    } catch (error) {
      if (active()) this.setData({ retryError: error.message || '暂未完成，请稍后重试' });
    } finally {
      this._pendingClaim = null;
      if (active()) this.setData({ retrying: false });
    }
  }
});
