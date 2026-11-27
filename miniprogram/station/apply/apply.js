const api = require('../../utils/api');
const STATUS = { pending: '审核中', approved: '已通过', rejected: '未通过' };
Page({
  data: { loading: true, ready: false, busy: false, error: '', loadError: false, communities: [], communityIndex: 0, stationIndex: 0, application: null },
  onShow() {
    this.hidden = false;
    if (this.closed) return;
    this.setData({ busy: !!this.submitting });
    return this.load();
  },
  onHide() { this.hidden = true; this.invalidateReads(); this.setData({ ready: false, communities: [], application: null }); },
  onUnload() { this.closed = true; this.invalidateReads(); this.setData({ ready: false, communities: [], application: null }); },
  invalidateReads() {
    this.viewVersion = (this.viewVersion || 0) + 1;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.loadInFlight = false;
  },
  visible() { return !this.closed && !this.hidden; },
  currentUser() { const user = getApp().globalData.user; return !!this.userId && user?._id === this.userId && user?.communityId === this.userCommunityId; },
  canEdit() { return this.visible() && this.currentUser() && this.data.ready && !this.data.loading && !this.submitting; },
  async load() {
    if (!this.visible() || this.loadInFlight || this.submitting) return;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    let userId, communityId;
    const current = () => this.visible() && sequence === this.loadSequence &&
      (!userId || (getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId));
    const selected = this.data.communities[this.data.communityIndex];
    const selectedStation = selected && selected.stations[this.data.stationIndex];
    this.loadInFlight = true;
    this.setData({ loading: true, ready: false, error: '', loadError: false });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (!user || !user._id) throw new Error('登录状态不可用，请重试');
      userId = user._id; communityId = user.communityId;
      if (!current()) return;
      const [options, mine] = await Promise.all([
        api.call('station', 'applicationOptions', {}, { loading: false, silent: true, isActive: current }),
        api.call('station', 'myApplication', {}, { loading: false, silent: true, isActive: current })
      ]);
      if (!current()) return;
      const communities = options.list || [];
      const keepSelection = !this.userId || this.userId === user._id;
      const selectedCommunityId = keepSelection && selected ? selected._id : mine.application && mine.application.communityId;
      const communityIndex = Math.max(0, communities.findIndex(item => item._id === selectedCommunityId));
      const community = communities[communityIndex];
      const stationCode = keepSelection && selectedStation && community && selected._id === community._id
        ? selectedStation.code : mine.application && mine.application.stationCode;
      const stationIndex = Math.max(0, (community && community.stations || []).findIndex(item => item.code === stationCode));
      this.userId = user._id;
      this.userCommunityId = user.communityId;
      this.setData({ communities, application: mine.application, communityIndex, stationIndex, ready: true });
    } catch (error) { if (current()) this.setData({ error: error.message || '驿站申请信息加载失败', loadError: true }); }
    finally { if (current()) { this.loadInFlight = false; this.setData({ loading: false }); } }
  },
  chooseCommunity(event) {
    const index = Number(event.detail.value);
    if (this.canEdit() && Number.isInteger(index) && this.data.communities[index]) this.setData({ communityIndex: index, stationIndex: 0 });
  },
  chooseStation(event) {
    const index = Number(event.detail.value), community = this.data.communities[this.data.communityIndex];
    if (this.canEdit() && Number.isInteger(index) && community && community.stations[index]) this.setData({ stationIndex: index });
  },
  async submit() {
    if (!this.canEdit()) return;
    const community = this.data.communities[this.data.communityIndex];
    const station = community && community.stations[this.data.stationIndex];
    if (!community || !station) { this.setData({ error: '请选择小区和驿站' }); return; }
    const version = this.viewVersion || 0;
    const userId = this.userId, communityId = this.userCommunityId;
    const current = () => this.visible() && (this.viewVersion || 0) === version &&
      getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId;
    let submitted = false;
    this.submitting = true;
    this.setData({ busy: true, error: '', loadError: false });
    try {
      await api.call('station', 'apply', { communityId: community._id, stationCode: station.code }, { loading: false, silent: true, isActive: current });
      submitted = true;
      if (current()) wx.showToast({ title: '申请已提交', icon: 'success' });
    } catch (error) { if (current()) this.setData({ error: error.message || '申请提交失败' }); }
    finally {
      this.submitting = false;
      if (this.visible()) {
        this.setData({ busy: false });
        if (submitted || !current()) await this.load();
      }
    }
  },
  statusText(status) { return STATUS[status] || status; }
});
