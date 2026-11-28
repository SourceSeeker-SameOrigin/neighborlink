const { currentVisit, readList } = require('../utils/visible-list');

const empty = { list: [], hasMore: false, nextOffset: 0, moreError: '' };

function rating(item) {
  return { ...item, ratingText: item.ratingCount ? (item.ratingSum / item.ratingCount).toFixed(1) : '暂无评价' };
}

// One read sequence covers both first-page reloads and attempts to append a page.
function read(page, append, failure, fetch) {
  if (append && (page.data.loading || !page.data.hasMore)) return;
  const offset = append ? page.data.nextOffset : 0;
  const reset = { ...empty, merchant: null, reportError: '' };
  const visible = currentVisit(page);
  const owner = getApp().globalData.user;
  const scopeChanged = page.catalogScope && page.catalogScope !== JSON.stringify([owner?._id, owner?.communityId, page.merchantId]);
  const pending = readList(page, append && !scopeChanged ? { moreError: '' } : reset, failure, async (user, options) => {
    const scope = JSON.stringify([user._id, user.communityId, page.merchantId]);
    if (append && scope !== page.catalogScope) { page.load(); return; }
    try {
      const result = await fetch(user, { ...options, redirectOnForbidden: false }, offset);
      if (!options.isActive()) return;
      if (result.hasMore && !(Number.isSafeInteger(result.nextOffset) && result.nextOffset > offset)) throw Error('分页位置无效，请重试');
      page.catalogScope = scope;
      const entries = append ? page.data.list.concat(result.list) : result.list;
      return { ...result, list: Array.from(new Map(entries.map(item => [item._id, item])).values()),
        hasMore: result.hasMore === true, nextOffset: result.nextOffset || 0, moreError: '' };
    } catch (e) {
      if (!append) throw e;
      if (['E_INVALID_PARAM', 'E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND', 'E_NOT_FOUND', 'E_UNAUTHORIZED'].includes(e.code)) {
        return { ...reset, error: e.message || failure };
      }
      return { moreError: e.message || failure };
    }
  }, null, reset);
  const sequence = page._readSequence;
  return pending.then(() => {
    // Session lookup can fail before the page fetch runs; an unknown identity cannot reuse a prior catalog.
    if (append && visible() && page._readSequence === sequence && page.data.error && page.data.list.length) page.setData(reset);
  });
}

function canOpen(page, id) {
  const user = getApp().globalData.user;
  return currentVisit(page)() && page.catalogScope === JSON.stringify([user?._id, user?.communityId, page.merchantId]) &&
    !page.data.error && page.data.list.some(item => item._id === id);
}
module.exports = { empty, rating, read, canOpen };
