const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { merchantStatusNames } = require('../../utils/status-labels');
const CATEGORIES = ['housekeeping', 'repair', 'laundry', 'locksmith', 'haul', 'canteen', 'recycler', 'other'];
const LABELS = ['家政', '维修', '洗衣', '开锁', '清运', '食堂', '回收企业', '其他'];
Page({
  data: { loading: true, ready: false, loadError: false, uploading: false, busy: false, error: '', categories: LABELS, categoryIndex: 0, name: '', licenseName: '', creditCode: '', contactName: '', phone: '', licenseFileId: '', merchantStatusNames },
  onLoad() { return this.load(); },
  onShow() {
    this.hidden = false;
    if (this.closed) return;
    this.setData({ busy: !!this.submitting, uploading: !!this.uploading });
    return this.load();
  },
  onHide() { this.hidden = true; this.invalidateReads(); this.setData({ ready: false, existing: null }); },
  onUnload() { this.closed = true; this.pendingUpload = null; this.invalidateReads(); this.setData({ ready: false, existing: null }); },
  invalidateReads() {
    this.viewVersion = (this.viewVersion || 0) + 1;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.loadInFlight = false;
  },
  visible() { return !this.closed && !this.hidden; },
  currentUser() { const user = getApp().globalData.user; return !!this.user && user?._id === this.user._id && user?.communityId === this.user.communityId; },
  canEdit() { return this.visible() && this.currentUser() && this.data.ready && !this.data.loading && !this.submitting && !this.uploading; },
  async load() {
    if (!this.visible() || this.loadInFlight || this.submitting || this.uploading) return;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    let userId, communityId;
    const current = () => this.visible() && sequence === this.loadSequence &&
      (!userId || (getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId));
    this.loadInFlight = true;
    this.setData({ loading: true, ready: false, loadError: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (!user || !user._id) throw new Error('登录状态不可用，请重试');
      userId = user._id; communityId = user.communityId;
      if (!current()) return;
      if (this.user && !this.currentUser()) {
        this.pendingUpload = null; this.draftInitialized = false; this.phoneEdited = false;
        this.setData({ name: '', licenseName: '', creditCode: '', contactName: '', phone: '', licenseFileId: '', existing: null, categoryIndex: 0 });
      }
      const result = await api.call('merchant', 'myApplication', {}, { loading: false, silent: true, isActive: current });
      if (!current()) return;
      this.user = user;
      this.setData({ existing: result.merchant || null });
      if (!this.phoneEdited && !this.draftInitialized) this.setData({ phone: user.phone || '' });
      this.draftInitialized = true;
      this.setData({ ready: true });
      this.applyUploadResult();
    } catch (error) { if (current()) this.setData({ loadError: true, error: error.message || '加载失败' }); }
    finally { if (current()) { this.loadInFlight = false; this.setData({ loading: false }); } }
  },
  input(event) {
    if (!this.canEdit()) return;
    const key = event.currentTarget.dataset.field;
    if (!['name', 'licenseName', 'creditCode', 'contactName', 'phone'].includes(key)) return;
    if (key === 'phone') this.phoneEdited = true;
    this.setData({ [key]: event.detail.value });
  },
  chooseCategory(event) {
    const index = Number(event.detail.value);
    if (this.canEdit() && Number.isInteger(index) && CATEGORIES[index]) this.setData({ categoryIndex: index });
  },
  applyUploadResult() {
    const result = this.pendingUpload;
    if (!result || !this.visible()) return;
    this.pendingUpload = null;
    if (result.userId !== this.user._id || !this.currentUser()) return;
    if (result.fileId) this.setData({ licenseFileId: result.fileId });
    if (result.error) this.setData({ error: result.error });
  },
  async upload() {
    if (!this.canEdit()) return;
    const userId = this.user._id, version = this.viewVersion || 0;
    this.uploading = true;
    this.setData({ uploading: true, error: '', loadError: false });
    try {
      const files = await uploadPhotos('merchants/' + userId + '/license', 1, { loading: false });
      if (!this.closed && files[0] && getApp().globalData.user?._id === userId) this.pendingUpload = { userId, fileId: files[0] };
    } catch (error) {
      if (!this.closed && getApp().globalData.user?._id === userId) this.pendingUpload = { userId, error: error.message || '营业执照上传失败' };
    } finally {
      this.uploading = false;
      if (this.visible()) {
        this.setData({ uploading: false });
        // A camera may temporarily hide the page. Recheck identity on return,
        // retaining the result in memory until a successful read accepts it.
        if ((this.viewVersion || 0) !== version) await this.load();
        else if (this.currentUser()) this.applyUploadResult();
      }
    }
  },
  async submit() {
    if (!this.canEdit()) return;
    const version = this.viewVersion || 0;
    const userId = this.user._id, communityId = this.user.communityId;
    const current = () => this.visible() && (this.viewVersion || 0) === version &&
      getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId;
    this.submitting = true;
    this.setData({ busy: true, error: '', loadError: false });
    try {
      const communityId = this.user.communityId;
      await api.call('merchant', 'apply', { communityId, name: this.data.name, category: CATEGORIES[this.data.categoryIndex],
        licenseFileId: this.data.licenseFileId, licenseInfo: { name: this.data.licenseName, creditCode: this.data.creditCode },
        contactName: this.data.contactName, phone: this.data.phone }, { loading: false, silent: true, isActive: current });
      if (!current()) return;
      wx.showToast({ title: '入驻申请已提交', icon: 'success' });
      wx.navigateBack();
    } catch (error) { if (current()) this.setData({ error: error.message || '提交失败，请检查资料' }); }
    finally {
      this.submitting = false;
      if (this.visible()) {
        this.setData({ busy: false });
        if (!current()) await this.load();
      }
    }
  }
});
