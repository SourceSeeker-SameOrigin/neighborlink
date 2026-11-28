const api = require('../../utils/api');
const listAll = require('../../utils/list-all');
Page({
  data: { loading: true, ready: false, communityLoading: false, communityReady: false,
    busy: false, error: '', retryAction: '', communities: [], providers: [], communityIndex: 0, providerIndex: 0,
    buildings: [], poster: null },
  onLoad() { this.visible = true; return this.load(); },
  onShow() { this.visible = true; return this.load(); },
  onHide() {
    this.visible = false;
    this._loadVersion = (this._loadVersion || 0) + 1;
    this._communityRequest = (this._communityRequest || 0) + 1;
    this._targetVersion = (this._targetVersion || 0) + 1;
    this.ownerId = null;
    this.posterScope = null;
    this.setData({ ready: false, communityReady: false, communityLoading: false, busy: false,
      communities: [], providers: [], buildings: [], poster: null });
  },
  onUnload() {
    this._closed = true;
    this.onHide();
  },
  currentOwner() {
    const user = getApp().globalData.user;
    return this.visible !== false && !this._closed && Boolean(this.ownerId && user &&
      user._id === this.ownerId && Array.isArray(user.roles) && user.roles.includes('admin'));
  },
  currentPoster() {
    const scope = this.posterScope;
    return Boolean(scope && typeof scope.url === 'string' && scope.url &&
      this.currentOwner() && this.data.ready &&
      scope.userId === this.ownerId && scope.loadVersion === this._loadVersion &&
      scope.targetVersion === this._targetVersion &&
      this.data.poster?.tempFileURL === scope.url);
  },
  async load() {
    if (this._closed || this.visible === false || this.data.busy ||
        (this._loading && this._loadingVersion === this._loadVersion)) return;
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this._loadingVersion = version;
    this._loading = true;
    this._communityRequest = (this._communityRequest || 0) + 1;
    this._targetVersion = (this._targetVersion || 0) + 1;
    const selectedCommunity = this.data.communities[this.data.communityIndex]?._id;
    this.ownerId = null;
    this.posterScope = null;
    this.setData({ loading: true, ready: false, communityReady: false, communityLoading: false,
      communities: [], providers: [], buildings: [], poster: null, error: '', retryAction: '' });
    let userId, communityId;
    const pageCurrent = () => version === this._loadVersion && this.visible !== false && !this._closed;
    const current = () => pageCurrent() && (!userId || (getApp().globalData.user?._id === userId &&
      getApp().globalData.user?.communityId === communityId));
    try {
      const user = await getApp().ensureSession();
      if (!pageCurrent()) return;
      userId = user?._id; communityId = user?.communityId;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (!user.roles.includes('admin')) throw new Error('只有运营管理员可以生成海报码');
      const communities = await listAll('catalog', 'listCommunities', {}, { isActive: current, redirectOnForbidden: false });
      if (!current()) return;
      const providers = await listAll('admin', 'listProviders', { status: 'approved' },
        { isActive: current, redirectOnForbidden: false });
      if (!current()) return;
      const communityIndex = Math.max(0, communities.findIndex(item => item._id === selectedCommunity));
      this.ownerId = userId;
      this.setData({ communities, providers, ready: true,
        communityIndex, providerIndex: 0 });
      await this.changeCommunity({ detail: { value: communityIndex } });
    } catch (error) {
      if (current()) this.setData({ error: error.message || '加载失败', retryAction: 'load' });
    } finally {
      if (version === this._loadingVersion) this._loading = false;
      if (current()) this.setData({ loading: false });
      else if (pageCurrent() && userId) this.setData({ loading: false, error: '登录身份已变化，请重新加载', retryAction: 'load' });
    }
  },
  async changeCommunity(event) {
    if (!this.data.ready || this._closed || this.visible === false) return;
    if (!this.currentOwner()) { this.setData({ busy: false }); return this.load(); }
    const communityIndex = Number(event.detail.value);
    const community = this.data.communities[communityIndex];
    const request = this._communityRequest = (this._communityRequest || 0) + 1;
    this._targetVersion = (this._targetVersion || 0) + 1;
    this.posterScope = null;
    const loadVersion = this._loadVersion;
    const current = () => request === this._communityRequest && loadVersion === this._loadVersion && this.currentOwner();
    this.setData({ communityIndex, buildings: [], poster: null, busy: false, communityReady: false,
      communityLoading: !!community, error: '', retryAction: '' });
    if (!community) return;
    try {
      const detail = await api.call('catalog', 'getCommunity', { communityId: community._id },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      this.setData({ buildings: detail.buildings || [], communityReady: true });
    } catch (error) {
      if (current()) {
        this.setData({ error: error.message || '小区读取失败，请重试', retryAction: 'community' });
      }
    } finally {
      if (current()) this.setData({ communityLoading: false });
    }
  },
  retry() {
    if (this.data.loading || this.data.communityLoading || this.data.busy) return;
    if (this.data.retryAction === 'community' && !this.currentOwner()) return this.load();
    if (this.data.retryAction === 'community') return this.changeCommunity({ detail: { value: this.data.communityIndex } });
    if (this.data.retryAction === 'load') return this.load();
  },
  async generate(event) {
    if (this.data.busy || this.data.loading || !this.data.ready || this._closed || this.visible === false) return;
    if (!this.currentOwner()) return this.load();
    const type = event.currentTarget.dataset.type;
    const target = type === 'building'
      ? this.data.communityReady && this.data.buildings.find(item => item._id === event.currentTarget.dataset.id)
      : type === 'provider' && this.data.providers[this.data.providerIndex];
    if (!target?._id) {
      this.setData({ error: type === 'provider' ? '暂无可用服务员，请先完成服务员审核' : '请先选择已加载的小区楼栋' });
      return;
    }
    const version = this._targetVersion || 0;
    const loadVersion = this._loadVersion;
    const userId = this.ownerId;
    const current = () => this.currentOwner() && this.ownerId === userId &&
      this._loadVersion === loadVersion && this._targetVersion === version;
    this.posterScope = null;
    this.setData({ busy: true, poster: null, error: '' });
    try {
      const result = await api.call('admin', 'genPoster', type === 'building' ? { buildingId: target._id } : { providerId: target._id },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (current()) {
        if (!result || typeof result.tempFileURL !== 'string' || !result.tempFileURL) {
          throw new Error('海报码暂不可用，请重试');
        }
        this.posterScope = { url: result.tempFileURL, userId, loadVersion, targetVersion: version };
        this.setData({ poster: result });
      }
    } catch (error) {
      if (current()) this.setData({ error: error.message || '生成失败，请重试' });
    } finally {
      if (current()) this.setData({ busy: false });
      else if (this.visible !== false && !this._closed && this.ownerId === userId &&
          this._loadVersion === loadVersion && getApp().globalData.user?._id !== userId) {
        this.setData({ busy: false });
        this.load();
      }
    }
  },
  providerChange(event) {
    if (!this.data.ready || this._closed || this.visible === false) return;
    if (!this.currentOwner()) { this.setData({ busy: false }); return this.load(); }
    this._targetVersion = (this._targetVersion || 0) + 1;
    this.posterScope = null;
    this.setData({ providerIndex: Number(event.detail.value), poster: null, busy: false });
  },
  preview() {
    if (!this.currentOwner() && this.visible !== false && !this._closed) { this.load(); return; }
    if (!this.currentPoster()) return;
    const poster = this.data.poster;
    return require('../../utils/media-links').preview({ urls: [poster.tempFileURL] }, () =>
      this.currentPoster() && this.data.poster?.tempFileURL === poster.tempFileURL);
  },
  save() {
    if (!this.currentOwner() && this.visible !== false && !this._closed) { this.load(); return; }
    if (!this.currentPoster()) return;
    const poster = this.data.poster;
    const scope = this.posterScope;
    const current = () => this.currentPoster() && this.posterScope === scope &&
      this.data.poster?.tempFileURL === poster.tempFileURL;
    wx.downloadFile({ url: poster.tempFileURL, success: response => {
      if (!current()) return;
      if (response.statusCode !== 200) { this.setData({ error: '图片下载失败，请重试' }); return; }
      wx.saveImageToPhotosAlbum({ filePath: response.tempFilePath,
        success: () => { if (current()) wx.showToast({ title: '已保存到相册', icon: 'success' }); },
        fail: error => { if (current()) this.setData({ error: error.errMsg || '保存失败，请检查相册权限' }); } });
    }, fail: error => { if (current()) this.setData({ error: error.errMsg || '下载失败，请重试' }); } });
  }
});
