const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const listAll = require('../../utils/list-all');
Page({
  data: { loading: true, ready: false, uploading: false, busy: false, error: '', errorKind: '', provider: null, communities: [], communityIndex: 0,
    levels: ['邻居帮手（门口任务）', '认证服务员（可入户）'], levelIndex: 0,
    realName: '', idLast4: '', agreed: false, phone: '', kycFileId: '', avatarFileId: '' },
  onLoad() { return this.load(); },
  onShow() { this._hidden = false; if (this.wasHidden) { this.wasHidden = false; return this.load(); } },
  onHide() { this._hidden = true; this.wasHidden = true; this.readSequence = (this.readSequence || 0) + 1; this.clearOwnerData(); },
  onUnload() { this._closed = true; this.readSequence = (this.readSequence || 0) + 1; this.clearOwnerData(); },
  currentOwner(sequence = this.readSequence) {
    const user = getApp().globalData.user;
    return !this._closed && !this._hidden && sequence === this.readSequence && !!this.userId &&
      user?._id === this.userId && user?.communityId === this.userCommunityId;
  },
  clearOwnerData() {
    this.setData({ ready: false, provider: null, communities: [], phone: '', kycFileId: '', avatarFileId: '' });
  },
  canEdit() {
    return this.currentOwner() && this.data.ready && !this.data.loading && !this.data.busy && !this.data.uploading &&
      (!this.data.provider || this.data.provider.status === 'rejected');
  },
  async load() {
    if (this._closed || this._hidden || this._loading || this.data.busy || this.data.uploading) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this._loading = true;
    if (this.userId && (getApp().globalData.user?._id !== this.userId ||
        getApp().globalData.user?.communityId !== this.userCommunityId)) {
      this.pendingPhotoResult = null;
      this.clearOwnerData();
      this.setData({ realName: '', idLast4: '', agreed: false, levelIndex: 0, communityIndex: 0 });
    }
    const selectedCommunity = this.data.communities[this.data.communityIndex]?._id;
    this.setData({ loading: true, ready: false, error: '', errorKind: '' });
    try {
      const user = await getApp().ensureSession();
      if (this._closed || this._hidden || sequence !== this.readSequence ||
          getApp().globalData.user?._id !== user._id) return;
      if (!user._id) throw new Error('登录资料不完整，请重新加载');
      this.userId = user._id;
      this.userCommunityId = user.communityId;
      const communities = await listAll('catalog', 'listCommunities');
      if (!this.currentOwner(sequence)) return;
      const status = await api.call('provider', 'myStatus');
      if (!this.currentOwner(sequence)) return;
      this.setData({ communities, phone: user.phone || '', provider: status.provider, ready: true,
        communityIndex: Math.max(0, communities.findIndex(item => item._id === (selectedCommunity || user.communityId))) });
      if (this.pendingPhotoResult?.userId === user._id && this.pendingPhotoResult.communityId === user.communityId) {
        this.setData({ [this.pendingPhotoResult.field]: this.pendingPhotoResult.fileId }); this.pendingPhotoResult = null;
      }
    } catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message || '加载失败，请重试', errorKind: 'load' }); }
    finally { this._loading = false; if (this.currentOwner(sequence)) this.setData({ loading: false }); }
  },
  change(event) {
    if (!this.canEdit()) return;
    const field = event.currentTarget.dataset.field;
    if (!['realName', 'idLast4', 'communityIndex', 'levelIndex'].includes(field)) return;
    this.setData({ [field]: event.detail.value });
  },
  agree(event) { if (this.canEdit()) this.setData({ agreed: event.detail.value.includes('yes') }); },
  async phone(event) {
    if (!this.canEdit() || !event.detail.code) return;
    const sequence = this.readSequence, userId = this.userId;
    this.setData({ busy: true, error: '', errorKind: '' });
    try { const user = await api.call('user', 'bindPhone', { code: event.detail.code }); if (this.currentOwner(sequence) && user?._id === userId) { getApp().globalData.user = user; this.setData({ phone: user.phone }); } }
    catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message, errorKind: 'operation' }); }
    finally { if (this.currentOwner(sequence)) this.setData({ busy: false }); }
  },
  async photo(event) {
    if (!this.canEdit() || !this.userId) return;
    const userId = this.userId, communityId = this.userCommunityId;
    const avatar = event.currentTarget.dataset.type === 'avatar';
    this.setData({ uploading: true, error: '', errorKind: '' });
    try {
      const files = await uploadPhotos((avatar ? 'providers/' : 'kyc/') + userId, 1);
      if (!this._closed && getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId && files[0]) {
        this.pendingPhotoResult = { userId, communityId, field: avatar ? 'avatarFileId' : 'kycFileId', fileId: files[0] };
        if (this.currentOwner() && this.data.ready) {
          this.setData({ [this.pendingPhotoResult.field]: files[0] }); this.pendingPhotoResult = null;
        }
      }
    } catch (error) { if (this.currentOwner()) this.setData({ error: error.message || '未完成拍照上传，请重试', errorKind: 'operation' }); }
    finally { this.setData({ uploading: false }); if (!this._closed && !this._hidden && !this.data.ready) await this.load(); }
  },
  async submit() {
    if (!this.canEdit()) return;
    const sequence = this.readSequence;
    if (!this.data.communities[this.data.communityIndex]) { this.setData({ error: '请选择服务小区' }); return; }
    this.setData({ busy: true, error: '', errorKind: '' });
    try {
      const provider = await api.call('provider', 'apply', { communityId: this.data.communities[this.data.communityIndex]._id,
        realName: this.data.realName, idLast4: this.data.idLast4, appliedLevel: Number(this.data.levelIndex) + 1,
        kycFileId: this.data.kycFileId, avatarFileId: this.data.avatarFileId, agreed: this.data.agreed });
      if (!this.currentOwner(sequence)) return;
      this.setData({ provider });
      wx.showToast({ title: '申请已提交', icon: 'success' });
    } catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message, errorKind: 'operation' }); }
    finally { if (this.currentOwner(sequence)) this.setData({ busy: false }); }
  }
});
