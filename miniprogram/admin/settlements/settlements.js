const api = require('../../utils/api');
const listAll = require('../../utils/list-all');
const { yuan } = require('../../utils/money');
function merchantName(merchants, id) { const item = (merchants || []).find(merchant => merchant._id === id); return item ? item.name : ''; }
function previewKey(row) {
  const recipient = row.payee === 'provider' ? row.providerId : row.payee === 'merchant' ? row.merchantId : row.payee === 'seller' ? row.sellerOpenid : row.communityId;
  return JSON.stringify([row.payee, row.communityId, recipient]);
}
Page({
  data: { loading: true, ready: false, authorized: false, isAdmin: false, busy: false, error: '', communities: [], communityIndex: 0, providers: [], providerIndex: 0, merchants: [], merchantIndex: 0, sellerOpenid: '',
    payees: ['服务员', '物业', '商家', '个人卖家'], payeeIndex: 0, from: '', to: '', preview: [], previewRange: null, settlements: [],
    historyLoading: false, historyError: '', historyHasMore: false, historyOffset: 0 },
  onHide() {
    this.visible = false;
    this._loadVersion = (this._loadVersion || 0) + 1;
    this._historyVersion = (this._historyVersion || 0) + 1;
    this._previewVersion = (this._previewVersion || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: false, ready: false, authorized: false, isAdmin: false, busy: false,
      communities: [], providers: [], merchants: [], preview: [], previewRange: null,
      settlements: [], historyLoading: false, historyHasMore: false, historyOffset: 0 });
  },
  onUnload() { this._closed = true; this.onHide(); },
  onLoad() {
    this.visible = true;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    this.setData({ from: today.slice(0, 8) + '01', to: today }); return this.load();
  },
  onShow() { this.visible = true; return this.load(); },
  currentRead() {
    const context = this.readContext;
    const user = getApp().globalData.user;
    return Boolean(context && this.visible !== false && !this._closed && this.data.ready && user &&
      user._id === context.userId && Array.isArray(user.roles) &&
      (context.isAdmin ? user.roles.includes('admin') :
        user.roles.includes('property') && user.communityId === context.communityId));
  },
  currentOperation(operation, context) {
    return this.operation === operation && this.readContext === context && this.currentRead();
  },
  invalidateIdentity(context = this.readContext) {
    if (!context || this.readContext !== context || this.visible === false || this._closed || this.currentRead()) return;
    this.readContext = null;
    this.operation = null;
    this._historyVersion = (this._historyVersion || 0) + 1;
    this._previewVersion = (this._previewVersion || 0) + 1;
    this.setData({ ready: false, authorized: false, isAdmin: false, busy: false,
      communities: [], providers: [], merchants: [], preview: [], previewRange: null,
      settlements: [], historyLoading: false, historyHasMore: false, historyOffset: 0,
      error: '登录身份已变化，请重新加载' });
  },
  async load() {
    if (this._closed || this.visible === false ||
        (this._loading && this._loadingVersion === this._loadVersion)) return;
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this._loadingVersion = version;
    this._loading = true;
    this._historyVersion = (this._historyVersion || 0) + 1;
    this._previewVersion = (this._previewVersion || 0) + 1;
    this.readContext = null;
    this.operation = null;
    this.setData({ loading: true, ready: false, busy: false, error: '', authorized: false, isAdmin: false,
      communities: [], providers: [], merchants: [], preview: [], previewRange: null, settlements: [],
      historyLoading: false, historyError: '', historyHasMore: false, historyOffset: 0 });
    let userId;
    const current = () => version === this._loadVersion && this.visible !== false && !this._closed &&
      (!userId || getApp().globalData.user?._id === userId);
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      const isAdmin = user.roles.includes('admin');
      if (!isAdmin && !user.roles.includes('property')) throw new Error('无权查看结算');
      if (!current()) return;
      this.setData({ authorized: true, isAdmin });
      if (!isAdmin) {
        if (!user.communityId) throw new Error('尚未分配物业服务小区');
        const [community, settlements] = await Promise.all([
          api.call('catalog', 'getCommunity', { communityId: user.communityId }, { loading: false, silent: true }),
          api.call('admin', 'listSettlements', {}, { loading: false, silent: true })
        ]);
        if (!current()) return;
        this.readContext = { userId, isAdmin, communityId: user.communityId, version };
        this.setData({ ready: true, communities: [community], communityIndex: 0, payeeIndex: 1, providers: [], merchants: [],
          historyHasMore: settlements.hasMore === true, historyOffset: settlements.list.length,
          settlements: settlements.list.map(item => ({ ...item, totalText: yuan(item.total) })) });
        return;
      }
      const [communities, providers, settlements, merchants] = await Promise.all([
        listAll('catalog', 'listCommunities'),
        listAll('admin', 'listProviders', { status: 'approved' }),
        api.call('admin', 'listSettlements', {}, { loading: false, silent: true }), listAll('merchant', 'adminList', { status: 'approved' })
      ]);
      if (!current()) return;
      this.readContext = { userId, isAdmin, version };
      this.setData({ ready: true, communities, providers,
        historyHasMore: settlements.hasMore === true, historyOffset: settlements.list.length,
        merchants, settlements: settlements.list.map(item => ({ ...item, totalText: yuan(item.total), merchantName: merchantName(merchants, item.merchantId) })) });
    } catch (error) { if (current()) this.setData({ error: error.message || '加载失败' }); }
    finally {
      if (version === this._loadingVersion) this._loading = false;
      if (current()) this.setData({ loading: false });
      else if (version === this._loadVersion && this.visible !== false && !this._closed && userId) {
        this.setData({ loading: false, ready: false, authorized: false, isAdmin: false,
          settlements: [], error: '登录身份已变化，请重新加载' });
      }
    }
  },
  async loadMoreHistory() {
    if (this._closed || this.visible === false || !this.data.ready || this.data.loading || this.data.historyLoading || this.data.busy || !this.data.historyHasMore) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const context = this.readContext;
    const version = this._historyVersion;
    const offset = this.data.historyOffset;
    const current = () => version === this._historyVersion && this.readContext === context && this.currentRead();
    this.setData({ historyLoading: true, historyError: '' });
    try {
      const result = await api.call('admin', 'listSettlements', { offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (!Array.isArray(result.list) || (result.hasMore && !result.list.length)) throw new Error('结算记录分页异常，请重试');
      const seen = new Set(this.data.settlements.map(item => item._id));
      const additions = [];
      for (const item of result.list) {
        if (!item || !item._id) throw new Error('结算记录编号缺失，请重试');
        if (seen.has(item._id)) continue;
        seen.add(item._id);
        additions.push({ ...item, totalText: yuan(item.total), merchantName: merchantName(this.data.merchants, item.merchantId) });
      }
      this.setData({ settlements: this.data.settlements.concat(additions), historyOffset: offset + result.list.length,
        historyHasMore: result.hasMore === true });
    } catch (error) {
      if (current()) this.setData({ historyError: error.message || '结算记录加载失败，请重试' });
    } finally {
      if (current()) this.setData({ historyLoading: false });
      else this.invalidateIdentity(context);
    }
  },
  changePreviewField(field, value) {
    if (this._closed || this.visible === false || !this.data.ready || this.data[field] === value) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    if (this.data.busy && this.operation?.type !== 'preview') return;
    this._previewVersion = (this._previewVersion || 0) + 1;
    if (this.operation?.type === 'preview') this.operation = null;
    this.setData({ [field]: value, preview: [], previewRange: null, busy: false });
  },
  input(event) {
    const field = event.currentTarget.dataset.field;
    if (['from', 'to', 'sellerOpenid'].includes(field)) this.changePreviewField(field, event.detail.value);
  },
  select(event) {
    const field = event.currentTarget.dataset.field;
    if ((!this.data.busy || this.operation?.type === 'preview') &&
        ['communityIndex', 'payeeIndex', 'providerIndex', 'merchantIndex'].includes(field)) {
      this.changePreviewField(field, Number(event.detail.value));
    }
  },
  request() {
    if (!this.data.authorized || !this.currentRead()) throw new Error('请先完整加载结算选项与权限');
    const payee = !this.data.isAdmin ? 'property' : ['provider', 'property', 'merchant', 'seller'][this.data.payeeIndex];
    const community = this.data.communities[this.data.communityIndex];
    const provider = this.data.providers[this.data.providerIndex]; const merchant = this.data.merchants[this.data.merchantIndex];
    if (!community || payee === 'provider' && !provider || payee === 'merchant' && !merchant) throw new Error('请先选择小区及收款对象');
    return { payee, communityId: community._id, ...(payee === 'provider' ? { providerId: provider._id } : {}), ...(payee === 'merchant' ? { merchantId: merchant._id } : {}), ...(payee === 'seller' && this.data.sellerOpenid ? { sellerOpenid: this.data.sellerOpenid.trim() } : {}),
      from: this.data.from, to: this.data.to };
  },
  async preview() {
    if (this._closed || this.visible === false || !this.data.ready || this.data.busy) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const context = this.readContext;
    const version = this._previewVersion = (this._previewVersion || 0) + 1;
    const operation = this.operation = { type: 'preview' };
    const current = () => this.operation === operation && this.readContext === context &&
      version === this._previewVersion && this.currentRead();
    try {
      this.setData({ busy: true, error: '', preview: [], previewRange: null });
      const request = this.request();
      const previewRange = { from: request.from, to: request.to, communityName: this.data.communities[this.data.communityIndex].name };
      const result = await api.call('admin', 'settlementPreview', request,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      this.setData({ previewRange, preview: result.rows.map(item => ({ ...item, previewKey: previewKey(item),
        totalText: yuan(item.total), originalTotalText: yuan(item.originalTotal || 0),
        merchantName: merchantName(this.data.merchants, item.merchantId) })) });
    } catch (error) { if (current()) this.setData({ error: error.message || '预览失败' }); }
    finally { if (current()) this.setData({ busy: false }); else this.invalidateIdentity(context); }
  },
  async create() {
    if (this._closed || this.visible === false || this.data.busy || !this.data.ready || !this.data.isAdmin) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    let request;
    try { request = this.request(); }
    catch (error) { this.setData({ error: error.message || '结算条件不正确' }); return; }
    const context = this.readContext;
    const operation = this.operation = { type: 'create' };
    const current = () => this.currentOperation(operation, context);
    this.setData({ busy: true, error: '' });
    try {
      await api.call('admin', 'settlementCreate', request,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      await this.load();
      if (this.currentRead() && this.readContext.userId === context.userId) {
        wx.showToast({ title: '结算单已生成', icon: 'success' });
      }
    } catch (error) {
      if (current()) {
        this.readContext = null;
        this.operation = null;
        this.setData({ ready: false, authorized: false, busy: false, preview: [], settlements: [],
          error: '生成结果待核对，请重新加载' });
      }
    } finally {
      if (current()) this.setData({ busy: false });
      else this.invalidateIdentity(context);
    }
  },
  async markPaid(event) {
    if (this._closed || this.visible === false || !this.data.isAdmin || !this.data.ready || this.data.busy) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    const settlementId = event.currentTarget?.dataset?.id;
    if (!this.data.settlements.some(item => item._id === settlementId && item.status === 'draft')) return;
    const context = this.readContext;
    const operation = this.operation = { type: 'markPaid' };
    const current = () => this.currentOperation(operation, context);
    this.setData({ busy: true, error: '' });
    try {
      await api.call('admin', 'settlementMarkPaid', { settlementId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      await this.load();
    } catch (error) {
      if (current()) {
        this.readContext = null;
        this.operation = null;
        this.setData({ ready: false, authorized: false, busy: false, preview: [], settlements: [],
          error: '付款确认结果待核对，请重新加载' });
      }
    } finally {
      if (current()) this.setData({ busy: false });
      else this.invalidateIdentity(context);
    }
  },
  async exportCsv() {
    if (this._closed || this.visible === false || !this.data.isAdmin || !this.data.ready || this.data.busy) return;
    if (!this.currentRead()) { this.invalidateIdentity(); return; }
    let request;
    try { request = this.request(); }
    catch (error) { this.setData({ error: error.message || '导出条件不正确' }); return; }
    const context = this.readContext;
    const operation = this.operation = { type: 'export' };
    const current = () => this.currentOperation(operation, context);
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call('admin', 'exportCsv', request,
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      const filePath = await new Promise((resolve, reject) => wx.downloadFile({ url: result.tempFileURL,
        success: response => response.statusCode === 200 ? resolve(response.tempFilePath) : reject(new Error('CSV 下载失败')),
        fail: reject }));
      if (!current()) return;
      wx.openDocument({ filePath, fileType: 'csv', showMenu: true,
        fail: () => { if (current()) this.setData({ error: 'CSV 已下载，请使用“用其他应用打开”查看' }); } });
    } catch (error) { if (current()) this.setData({ error: error.message || '导出失败' }); }
    finally { if (current()) this.setData({ busy: false }); else this.invalidateIdentity(context); }
  }
});
