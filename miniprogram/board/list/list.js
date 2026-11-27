const ads = require('../../utils/ads');
const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { ads: [], adError: '', loading: false, error: '', needsBinding: true, posts: [], type: 'ask', scope: 'community', federationEnabled: false,
    types: [{ code: 'task', label: '悬赏' }, { code: 'ask', label: '求助' }, { code: 'carry', label: '出行帮带' }] },
  onLoad(options = {}) { if (options.type === 'carry') this.setData({ type: 'carry' }); },
  onHide() { ads.clear(this); lifecycle.onHide.call(this); this.setData({ posts: [], hasMore: false, needsBinding: true }); },
  onUnload() { ads.clear(this); lifecycle.onUnload.call(this); this.setData({ posts: [], hasMore: false, needsBinding: true }); },
  retryAds() { if (this.listOwnerId === getApp().globalData.user?._id && this.listCommunityId === getApp().globalData.user?.communityId) return ads.load(this, 'board_top', this.adCommunityId); },
  recordAd(event) { ads.record(this,event.currentTarget.dataset.id,'ad_view'); },
  openAd(event) { ads.open(this,event); },
  load(reset = true) {
    const append = reset === false;
    const { type, scope, posts } = this.data;
    const owner = getApp().globalData.user;
    const sameOwner = this.listOwnerId === owner?._id && this.listCommunityId === owner?.communityId;
    if (!append) ads.clear(this);
    return readList(this, append && sameOwner ? {} : { posts: [], hasMore: false, federationEnabled: false }, '需求列表加载失败', async (user, options) => {
      const { communityId, buildingId } = user;
      if (!communityId || !buildingId) {
        ads.clear(this);
        return { needsBinding: true, posts: [], hasMore: false, federationEnabled: false, scope: 'community' };
      }
      this.setData({ needsBinding: false });
      if (append && !sameOwner) {
        this.setData({ posts: [], hasMore: false, federationEnabled: false });
        ads.clear(this);
      }
      const community = await api.call('catalog', 'getCommunity', { communityId }, options);
      if (!options.isActive()) return;
      if (!community.enabledFeatures.board) throw new Error('需求广场暂未开放');
      const federationEnabled = !!community.enabledFeatures.federation;
      const selectedScope = federationEnabled && type !== 'task' ? scope : 'community';
      const sameList = append && this.listOwnerId === user._id && this.listCommunityId === communityId && scope === selectedScope;
      if (!sameList) {
        this.setData({ posts: [], hasMore: false, scope: selectedScope });
        await ads.load(this, 'board_top', communityId, options.isActive);
        if (!options.isActive()) return;
      }
      const previous = sameList ? posts : [];
      const result = await api.call('board', 'list', { type, scope: selectedScope, offset: previous.length }, options);
      if (!options.isActive()) return;
      this.listCommunityId = communityId;
      this.listOwnerId = user._id;
      return { federationEnabled, posts: previous.concat(result.list.map(this.formatPost)), hasMore: result.hasMore };
    }, null, { posts: [], hasMore: false, federationEnabled: false, needsBinding: true });
  },
  formatPost(post) { return { ...post, timeText: display(post.createdAt), typeText: post.type === 'task' ? '悬赏' : post.type === 'carry' ? '出行帮带' : '求助',
    rewardText: post.reward ? yuan(post.reward) : '', slotText: post.slot ? post.slot.date + ' ' + post.slot.start + '—' + post.slot.end : '' }; },
  chooseType(event) { const type = event.currentTarget.dataset.type;
    this.setData({ type, ...(type === 'task' ? { scope: 'community' } : {}) }); this.load(true); },
  chooseScope(event) { this.setData({ scope: event.currentTarget.dataset.scope }); this.load(true); },
  currentList() { const user = getApp().globalData.user; return !this._hidden && !this._unloaded && this.listOwnerId === user?._id && this.listCommunityId === user?.communityId; },
  bindAddress() { wx.navigateTo({ url: '/pages/bind/bind' }); },
  create() { if (!this.currentList()) return this.bindAddress(); if (this.data.needsBinding) return this.bindAddress(); wx.navigateTo({ url: '/board/create/create?type=' + this.data.type }); },
  open(event) { if (this.currentList() && this.data.posts.some(item => item._id === event.currentTarget.dataset.id)) wx.navigateTo({ url: '/board/detail/detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  more() { if (this.data.hasMore && !this.data.loading) return this.load(false); }
});
