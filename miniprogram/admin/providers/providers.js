const api = require('../../utils/api');
const { display } = require('../../utils/time');
Page({
  data: { loading: false, busy: false, error: '', rows: [], hasMore: true, statusIndex: 0,
    statuses: ['待审核', '已通过', '已拒绝', '已停用', '全部'] },
  onShow() { this._hidden = false; return this.load(true); },
  onHide() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    this._listOwnerId = null;
    this.setData({ rows: [], loading: false, busy: false, error: '' });
  },
  onUnload() { this.onHide(); this._closed = true; },
  currentOwner(sequence = this.sequence) {
    const user = getApp().globalData.user;
    return !this._closed && !this._hidden && sequence === this.sequence &&
      this._listOwnerId && user?._id === this._listOwnerId && user.roles?.includes('admin');
  },
  clearIfChanged(ownerId) {
    if (this._closed || this._hidden || getApp().globalData.user?._id === ownerId) return;
    this._listOwnerId = null;
    this.setData({ rows: [], hasMore: false, loading: false, busy: false });
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  retry() { return this.load(this._failedReset !== false); },
  filter(event) { if (this._closed || this.data.busy) return; this.setData({ statusIndex: Number(event.detail.value) }); this.load(true); },
  async load(reset = false) {
    if (this._closed || this._hidden || (!reset && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const isActive = () => !this._closed && !this._hidden && sequence === this.sequence;
    const offset = reset ? 0 : this.data.rows.length;
    this._failedReset = reset;
    if (reset) this._listOwnerId = null;
    this.setData({ loading: true, error: '', ...(reset ? { rows: [], hasMore: true } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!isActive()) return;
      if (getApp().globalData.user?._id !== user._id || !user.roles?.includes('admin')) throw new Error('无权查看服务员审核');
      if (!reset && this._listOwnerId !== user._id) throw new Error('审核身份已变化，请重新加载');
      const result = await api.call('admin', 'listProviders', { status: ['pending', 'approved', 'rejected', 'suspended', ''][this.data.statusIndex],
        offset }, { loading: false, silent: true, redirectOnForbidden: false,
          isActive: () => isActive() && getApp().globalData.user?._id === user._id });
      if (!isActive()) return;
      if (getApp().globalData.user?._id !== user._id) { this.clearIfChanged(user._id); return; }
      const rows = result.list.map(row => { const certs = row.certs || []; return { ...row, certs,
        escortCert: certs.includes('escort'), petCert: certs.includes('pet'),
        insuranceText: display(row.insuranceUntil).slice(0, 10), note: '' }; });
      this._listOwnerId = user._id;
      this.setData({ rows: reset ? rows : [...this.data.rows, ...rows], hasMore: result.hasMore });
    } catch (error) {
      if (isActive()) {
        const clear = reset || error.code === 'E_FORBIDDEN' || !this._listOwnerId ||
          getApp().globalData.user?._id !== this._listOwnerId;
        if (clear) this._listOwnerId = null;
        this.setData({ ...(clear ? { rows: [], hasMore: false } : {}), error: error.message || '审核列表加载失败' });
      }
    }
    finally { if (isActive()) this.setData({ loading: false }); }
  },
  note(event) { if (!this.currentOwner() || this.data.loading || this.data.busy || !this.data.rows[event.currentTarget.dataset.index]) return; this.setData({ ['rows[' + event.currentTarget.dataset.index + '].note']: event.detail.value }); },
  async review(event) {
    if (!this.currentOwner() || this.data.loading || this.data.busy) return;
    const row = this.data.rows[event.currentTarget.dataset.index];
    if (!row) return;
    const level = Number(event.currentTarget.dataset.level);
    await this.perform('reviewProvider', { providerId: row._id, approved: level > 0, level, note: row.note, certs: row.certs });
  },
  async suspend(event) {
    if (!this.currentOwner() || this.data.loading || this.data.busy) return;
    const sequence = this.sequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '停用服务员', content: '停用后不能上线或接单，已有任务请到订单管理处理。', success: resolve }));
    if (answer.confirm && this.currentOwner(sequence)) await this.perform('suspendProvider', { providerId: event.currentTarget.dataset.id });
  },
  insurance(event) { this.perform('setInsurance', { providerId: event.currentTarget.dataset.id, until: event.detail.value }); },
  async certs(event) {
    if (!this.currentOwner() || this.data.loading || this.data.busy) return;
    const index = event.currentTarget.dataset.index;
    const row = this.data.rows[index];
    if (!row) return;
    const certs = event.detail.value, savedCerts = [...row.certs];
    const sequence = this.sequence;
    if (row.status === 'approved') this.setData({ busy: true, error: '' });
    this.setData({ ['rows[' + index + '].certs']: certs, ['rows[' + index + '].escortCert']: certs.includes('escort'),
      ['rows[' + index + '].petCert']: certs.includes('pet') });
    if (row.status !== 'approved') return;
    try {
      await api.call('admin', 'setCerts', { providerId: row._id, certs },
        { silent: true, redirectOnForbidden: false, isActive: () => this.currentOwner(sequence) });
      if (!this.currentOwner(sequence)) return;
      this.setData({ busy: false });
      await this.load(true);
    } catch (error) {
      if (!this.currentOwner(sequence)) return;
      this.setData({ busy: false, error: error.message || '证书保存失败，请重试',
        ['rows[' + index + '].certs']: savedCerts,
        ['rows[' + index + '].escortCert']: savedCerts.includes('escort'),
        ['rows[' + index + '].petCert']: savedCerts.includes('pet') });
    }
  },
  cleanup(event) { this.perform('cleanupProviderKyc', { providerId: event.currentTarget.dataset.id }); },
  async perform(action, data) {
    if (!this.currentOwner() || this.data.busy || this.data.loading) return;
    const sequence = this.sequence;
    this.setData({ busy: true, error: '' });
    try {
      await api.call('admin', action, data,
        { silent: true, redirectOnForbidden: false, isActive: () => this.currentOwner(sequence) });
      if (!this.currentOwner(sequence)) return;
      this.setData({ busy: false });
      await this.load(true);
    } catch (error) {
      if (this.currentOwner(sequence)) this.setData({ error: error.message || '操作结果待核对', busy: false });
    }
  },
  preview(event) { if (this.currentOwner()) require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: [event.currentTarget.dataset.url] }); }
});
