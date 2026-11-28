const api = require('./api');

// Selector options are published only after every page has loaded successfully.
module.exports = async function listAll(name, action, params = {}, options = {}) {
  const list = [], seen = new Set();
  let page;
  do {
    if (options.isActive && !options.isActive()) return [];
    page = await api.call(name, action, { ...params, offset: list.length },
      { loading: false, silent: true, ...options });
    if (options.isActive && !options.isActive()) return [];
    if (!Array.isArray(page?.list) || (page.hasMore && !page.list.length)) {
      throw new Error('选项列表分页异常，请重新加载');
    }
    for (const item of page.list) {
      if (!item?._id || seen.has(item._id)) throw new Error('选项列表存在缺失或重复记录，请重新加载');
      seen.add(item._id);
      list.push(item);
    }
  } while (page.hasMore);
  return list;
};
