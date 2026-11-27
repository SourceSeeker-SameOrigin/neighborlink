const api = require('../../utils/api');
const ISSUE_MODES = ['claim', 'auto_new_user', 'referral', 'event', 'manual'];
const MODE_LABELS = ['用户领取', '新用户自动发放', '推荐发放', '活动发放', '管理员手动发放'];
const KIND_LABELS = ['满减券', '比例减免券', '免单券'];
const EMPTY = { name: '', kind: 'amount_off', value: '100', maxOff: '100', threshold: '0',
  servicesText: 'all', validDays: '30', totalLimit: '100', perUserLimit: '1', issueMode: 'claim',
  communitiesText: 'all', status: 'active', phone: '', userIdsText: '' };
Page({
  data: { loading: false, saving: false, error: '', rows: [], form: { ...EMPTY }, modeLabels: MODE_LABELS,
    kindOptions: ['amount_off', 'percent_off', 'free'], kindLabels: KIND_LABELS, kindIndex: 0, modeIndex: 0, issueTemplateIndex: 0,
    kindNames: { amount_off: '满减券', percent_off: '比例减免券', free: '免单券' },
    statusNames: { active: '发放中', paused: '已暂停' } },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.sequence = (this.sequence || 0) + 1; this.clearPrivate(); },
  onUnload() { this.closed = true; this.sequence = (this.sequence || 0) + 1; this.clearPrivate(); },
  clearPrivate() { this.setData({ rows: [], form: { ...EMPTY }, issueTemplateIndex: 0 }); this.ownerId = null; },
  currentAdmin(sequence = this.sequence) {
    const user = getApp().globalData.user;
    return !this.hidden && !this.closed && sequence === this.sequence && !!this.ownerId &&
      user?._id === this.ownerId && user.roles?.includes('admin');
  },
  async load() {
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '', rows: [] });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.sequence || getApp().globalData.user?._id !== user._id) return;
      if (!user.roles.includes('admin')) throw new Error('只有运营管理员可管理优惠券');
      if (this.ownerId && this.ownerId !== user._id) this.clearPrivate();
      this.ownerId = user._id;
      const result = await api.call('coupon', 'adminTemplates', {}, { loading: false, silent: true });
      if (!this.currentAdmin(sequence)) return;
      this.setData({ rows: result.list, issueTemplateIndex: Math.max(0, result.list.findIndex(item => item._id === this.data.form.issueTemplateId)) });
    } catch (error) { if (!this.hidden && !this.closed && sequence === this.sequence) { this.clearPrivate(); this.setData({ error: error.message || '加载失败' }); } }
    finally { if (!this.hidden && !this.closed && sequence === this.sequence) this.setData({ loading: false }); }
  },
  field(event) {
    const field = event.currentTarget.dataset.field;
    const value = ['servicesText', 'communitiesText'].includes(field) && event.detail.value.trim() === '全部' ? 'all' : event.detail.value;
    this.setData({ ['form.' + field]: value });
  },
  chooseMode(event) {
    const modeIndex = Number(event.detail.value);
    if (!ISSUE_MODES[modeIndex]) return;
    this.setData({ modeIndex, 'form.issueMode': ISSUE_MODES[modeIndex] });
  },
  edit(event) {
    if (!this.currentAdmin()) return;
    const row = this.data.rows[event.currentTarget.dataset.index];
    if (!row) return;
    this.setData({ kindIndex: Math.max(0, this.data.kindOptions.indexOf(row.kind)), modeIndex: Math.max(0, ISSUE_MODES.indexOf(row.issueMode)), form: { ...EMPTY, ...row,
      templateId: row._id, servicesText: row.services.join(','), communitiesText:
        row.communityIds === 'all' ? 'all' : row.communityIds.join(',') } });
  },
  reset() { this.setData({ form: { ...EMPTY }, kindIndex: 0, modeIndex: 0, issueTemplateIndex: 0, error: '' }); },
  chooseKind(event) {
    const kindIndex = Number(event.detail.value);
    this.setData({ kindIndex, 'form.kind': this.data.kindOptions[kindIndex] });
  },
  async save() {
    if (!this.currentAdmin() || this.data.saving) return;
    const sequence = this.sequence;
    const form = this.data.form;
    this.setData({ saving: true, error: '' });
    try {
      const services = form.servicesText.trim() === 'all' ? ['all'] : form.servicesText.split(',').map(value => value.trim()).filter(Boolean);
      const communityIds = form.communitiesText.trim() === 'all' ? 'all' : form.communitiesText.split(',').map(value => value.trim()).filter(Boolean);
      const template = { ...form, services, communityIds, value: Number(form.value), maxOff: Number(form.maxOff),
        threshold: Number(form.threshold), validDays: Number(form.validDays), totalLimit: Number(form.totalLimit),
        perUserLimit: Number(form.perUserLimit) };
      delete template.servicesText; delete template.communitiesText; delete template.phone; delete template.userIdsText;
      await api.call('coupon', 'saveTemplate', template);
      if (!this.currentAdmin(sequence)) return;
      this.reset(); await this.load();
    } catch (error) { if (this.currentAdmin(sequence)) this.setData({ error: error.message || '保存失败' }); }
    finally { if (this.currentAdmin()) this.setData({ saving: false }); }
  },
  templatePick(event) {
    const item = this.data.rows[Number(event.detail.value)];
    this.setData({ issueTemplateIndex: item ? Number(event.detail.value) : 0, 'form.issueTemplateId': item && item._id || '' });
  },
  async toggleStatus(event) {
    if (!this.currentAdmin() || this.data.saving) return;
    const row = this.data.rows[event.currentTarget.dataset.index];
    if (!row) return;
    const sequence = this.sequence;
    this.setData({ saving: true });
    try { await api.call('coupon', 'saveTemplate', { ...row, templateId: row._id,
      status: row.status === 'active' ? 'paused' : 'active' }); if (this.currentAdmin(sequence)) await this.load(); }
    catch (error) { if (this.currentAdmin(sequence)) this.setData({ error: error.message || '更新模板状态失败' }); }
    finally { if (this.currentAdmin()) this.setData({ saving: false }); }
  },
  async issue() {
    if (!this.currentAdmin() || this.data.saving) return;
    const sequence = this.sequence;
    const selected = this.data.rows.find(row => row._id === this.data.form.issueTemplateId) || this.data.rows[0];
    if (!selected) { this.setData({ error: '请先创建优惠券模板' }); return; }
    this.setData({ saving: true, error: '' });
    try {
      const phone = this.data.form.phone.trim();
      const userIds = this.data.form.userIdsText.split(/[\s,，]+/).filter(Boolean);
      const result = await api.call('coupon', 'manualIssue', { templateId: selected._id,
        ...(phone ? { phone } : { userIds }) });
      if (!this.currentAdmin(sequence)) return;
      wx.showToast({ title: '成功 ' + result.issued + '，重复 ' + result.duplicates + '，失败 ' + result.failures.length,
        icon: result.failures.length ? 'none' : 'success' });
      await this.load();
      if (result.failures.length) this.setData({ error: result.failures.map(item => item.userId + '：' + item.message).join('；') });
    } catch (error) { if (this.currentAdmin(sequence)) this.setData({ error: error.message || '发放失败' }); }
    finally { if (this.currentAdmin(sequence)) this.setData({ saving: false }); }
  }
});
