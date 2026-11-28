const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { uploadPhotos } = require('../../utils/media');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', order: null, photos: [], note: '' },
  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.sequence = (this.sequence || 0) + 1; this.setData({ order: null, photos: [], busy: false }); },
  onUnload() { this.closed = true; this.pendingPhotos = null; this.sequence = (this.sequence || 0) + 1; this.setData({ order: null, photos: [], busy: false }); },
  currentOrder(sequence = this.sequence) { const user = getApp().globalData.user; return !this.hidden && !this.closed &&
    sequence === this.sequence && !!this.ownerId && user?._id === this.ownerId &&
    user?.communityId === this.ownerCommunityId && this.data.order?._id === this.orderId; },
  async load() {
    if (!this.orderId) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '', order: null, photos: [] });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.sequence || getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const order = await api.call('order', 'detail', { orderId: this.orderId }, { loading: false, silent: true });
      if (this.hidden || this.closed || sequence !== this.sequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      if (!order.idleSale || !order.idleSale.seller) throw new Error('无权查看此担保订单');
      this.setData({ order, priceText: yuan(order.idleSale.price), payoutText: yuan(order.idleSale.sellerAmount) });
      if (order.status === 'accepted' && this.pendingPhotos?.ownerId === user._id &&
          this.pendingPhotos.orderId === this.orderId) {
        this.setData({ photos: this.pendingPhotos.files }); this.pendingPhotos = null;
      }
    } catch (error) { if (!this.hidden && !this.closed && sequence === this.sequence) this.setData({ error: error.message || '订单加载失败' }); }
    finally { if (!this.hidden && !this.closed && sequence === this.sequence) this.setData({ loading: false }); }
  },
  async accept() {
    if (!this.currentOrder()) return;
    const sequence = this.sequence;
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try { await api.call('idle', 'acceptSale', { orderId: this.orderId }); if (this.currentOrder(sequence)) await this.load(); }
    catch (error) { if (this.currentOrder(sequence)) this.setData({ error: error.message || '接单失败' }); }
    finally { if (this.currentOrder()) this.setData({ busy: false }); }
  },
  async photos() {
    if (!this.currentOrder()) return;
    const sequence = this.sequence, ownerId = this.ownerId, orderId = this.orderId;
    try { const photos = await uploadPhotos('idle-delivery/' + orderId, 3);
      if (getApp().globalData.user?._id !== ownerId || this.orderId !== orderId || this.closed) return;
      if (this.currentOrder(sequence) && this.data.order?.status === 'accepted') this.setData({ photos });
      else { this.pendingPhotos = { ownerId, orderId, files: photos }; if (!this.hidden) await this.load(); } }
    catch (error) { if (this.currentOrder(sequence)) this.setData({ error: error.message || '交付凭证上传失败' }); }
  },
  note(event) { this.setData({ note: event.detail.value }); },
  async deliver() {
    if (!this.currentOrder()) return;
    const sequence = this.sequence;
    if (this.data.busy) return;
    if (!this.data.photos.length) { this.setData({ error: '请先拍摄交付凭证' }); return; }
    this.setData({ busy: true, error: '' });
    try { await api.call('idle', 'deliverSale', { orderId: this.orderId, photos: this.data.photos, note: this.data.note }); if (this.currentOrder(sequence)) await this.load(); }
    catch (error) { if (this.currentOrder(sequence)) this.setData({ error: error.message || '提交交付失败' }); }
    finally { if (this.currentOrder()) this.setData({ busy: false }); }
  },
  preview(event) {
    if (!this.currentOrder()) return; require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: this.data.photos }); }
});
