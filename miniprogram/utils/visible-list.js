// Only the newest read in the current visit may update the page.
const lifecycle = {
  onShow() {
    if (this._unloaded) return;
    this._hidden = false;
    return this.load();
  },
  onHide() {
    this._hidden = true;
    this._visit = (this._visit || 0) + 1;
  },
  onUnload() {
    this._unloaded = true;
  }
};

function currentVisit(page) {
  const visit = page._visit;
  return () => !page._hidden && !page._unloaded && page._visit === visit;
}

function currentUserAction(visible) {
  const userId = getApp().globalData.user?._id;
  const communityId = getApp().globalData.user?.communityId;
  return () => Boolean(userId) && getApp().globalData.user?._id === userId &&
    getApp().globalData.user?.communityId === communityId && visible();
}

async function readList(page, initial, failureMessage, fetchList, pendingWrite, scopeReset = initial) {
  const visible = currentVisit(page);
  if (!visible()) return;
  const sequence = page._readSequence = (page._readSequence || 0) + 1;
  const active = () => visible() && page._readSequence === sequence;
  let userId, communityId;
  const scopedActive = () => active() && (!userId ||
    (getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId));
  page.setData({ ...initial, loading: true, error: '' });
  try {
    // A return during an explicit claim must read the resulting inventory.
    if (pendingWrite) await pendingWrite.catch(() => {});
    if (!active()) return;
    const user = await getApp().ensureSession();
    if (!active()) return;
    userId = user?._id;
    communityId = user?.communityId;
    if (!scopedActive()) return;
    const patch = await fetchList(user, { loading: false, silent: true, isActive: scopedActive });
    if (scopedActive() && patch) page.setData(patch);
  } catch (error) {
    if (scopedActive()) page.setData({ error: error.message || failureMessage });
  } finally {
    if (active()) page.setData({ ...(scopedActive() ? {} : scopeReset), loading: false });
  }
}

module.exports = { lifecycle, currentVisit, currentUserAction, readList };
