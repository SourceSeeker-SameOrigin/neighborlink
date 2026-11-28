const privacy = require('./privacy');

async function uploadPhotos(folder, count = 1, options = {}) {
  await privacy.authorize();
  const result = await new Promise((resolve, reject) => wx.chooseMedia({ count, mediaType: ['image'],
    sourceType: ['camera'], sizeType: ['compressed'], success: resolve, fail: reject }));
  if (typeof options.onChosen === 'function') options.onChosen();
  const files = [];
  const loading = options.loading !== false;
  if (loading) wx.showLoading({ title: '正在上传照片', mask: true });
  try {
    for (const item of result.tempFiles) {
      const extension = /\.(png|jpe?g|webp)$/i.exec(item.tempFilePath);
      const name = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '.' + (extension ? extension[1].toLowerCase() : 'jpg');
      const uploaded = await wx.cloud.uploadFile({ cloudPath: folder + '/' + name, filePath: item.tempFilePath });
      files.push(uploaded.fileID);
    }
    return files;
  } finally { if (loading) wx.hideLoading(); }
}

async function uploadVideo(folder) {
  await privacy.authorize();
  const result = await new Promise((resolve, reject) => wx.chooseMedia({ count: 1, mediaType: ['video'], sourceType: ['camera'],
    maxDuration: 60, camera: 'back', success: resolve, fail: reject }));
  const file = result.tempFiles && result.tempFiles[0];
  if (!file) throw new Error('未选择视频');
  const uploaded = await wx.cloud.uploadFile({ cloudPath: folder + '/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '.mp4',
    filePath: file.tempFilePath });
  return uploaded.fileID;
}

module.exports = { uploadPhotos, uploadVideo };
