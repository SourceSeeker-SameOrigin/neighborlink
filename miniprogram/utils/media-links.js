// In-memory only. Business data retains file IDs; signed URLs never enter drafts.
const entries = new Map();
const pending = new Map();
function register(media, refresh) {
  for (const [file, value] of Object.entries(media || {})) entries.set(file, { ...value, refresh });
  while (entries.size > 1000) entries.delete(entries.keys().next().value);
}
async function resolve(file, force = false) {
  if (!file) return '';
  if (!entries.has(file) && !file.startsWith('cloud://')) return file;
  if (pending.has(file)) return pending.get(file);
  const request = (async () => {
    let item = entries.get(file);
    if (item) {
      if (force || !item.url || item.expiresAt <= Date.now() + 5000) {
        // Drop the previous capability before checking current business permissions again.
        entries.set(file, { ...item, url: '', expiresAt: 0 });
        await item.refresh();
        item = entries.get(file);
      }
      if (!item || !item.url || item.expiresAt <= Date.now()) throw new Error(item && item.error || '图片已不可访问，请刷新');
      return item.url;
    }
    // Newly uploaded, unsaved files: client SDK still enforces creator-only storage access.
    const response = await wx.cloud.getTempFileURL({ fileList: [file] });
    const found = (response.fileList || []).find(row => row.fileID === file && row.status === 0 && row.tempFileURL);
    if (!found) throw new Error('图片暂不可用，请重试');
    return found.tempFileURL;
  })();
  pending.set(file, request);
  try { return await request; } finally { pending.delete(file); }
}
async function preview(options, isActive = () => true) {
  try {
    const urls = await Promise.all(options.urls.map(file => resolve(file)));
    if (!isActive()) return;
    const index = options.urls.indexOf(options.current);
    wx.previewImage({ ...options, urls, current: urls[Math.max(0, index)] });
  } catch (error) {
    if (isActive()) wx.showToast({ title: error.message || '图片暂不可用', icon: 'none' });
  }
}
module.exports = { register, resolve, preview };
