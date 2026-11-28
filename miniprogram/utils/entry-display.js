// 明文只交给发起读取的当前可见任务。每次刷新、离页或关闭都会使旧读取失效。
function clear(page) {
  page.entryRead = (page.entryRead || 0) + 1;
  page.setData({ entryPassword: '', readingEntry: false });
}
async function reveal(page, read, isCurrent = () => true, reload = async () => {}) {
  if (!page.visible || page.data.loading || page.data.readingEntry) return;
  clear(page);
  const token = page.entryRead;
  page.setData({ readingEntry: true, error: '' });
  try {
    const result = await read();
    if (page.visible && token === page.entryRead && isCurrent()) page.setData({ entryPassword: result.entry });
  } catch (error) {
    if (page.visible && token === page.entryRead && isCurrent()) page.setData({ error: error.message || '门锁信息暂不可用' });
  } finally {
    if (page.visible && token === page.entryRead) {
      if (isCurrent()) page.setData({ readingEntry: false });
      else { clear(page); await reload(); }
    }
  }
}
module.exports = { clear, reveal };
