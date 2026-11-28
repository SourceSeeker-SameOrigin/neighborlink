const { fileInFolder } = require('./providerData');

const MAX_AGE = 600;
const FIELDS = new Set(['photos', 'photoByItem', 'images', 'receiptPhoto', 'videoFileId', 'avatarFileId', 'kycFileIds', 'licenseFileId', 'imageFileId', 'photoFileId', 'fileId']);
const READS = {
  order: ['detail'], provider: ['myStatus'], admin: ['listProviders'],
  board: ['list', 'detail'], idle: ['list', 'detail', 'mine', 'sales'],
  chat: ['pull', 'adminPull'], pet: ['listVisits'],
  merchant: ['listForCommunity', 'servicesForMerchant', 'adminList', 'myServices', 'adminServices', 'merchantOrders'],
  content: ['homeContent', 'adsForSlot', 'listNotices', 'listAds'], event: ['list', 'detail', 'adminList'],
  station: ['providerBatch', 'listMyBatches']
};

function filesInView(value, key = '', output = new Set()) {
  if (typeof value === 'string') {
    if (FIELDS.has(key) && value) output.add(value);
  } else if (Array.isArray(value)) value.forEach(item => filesInView(item, key, output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([field, item]) => filesInView(item, key === 'photoByItem' ? key : field, output));
  return output;
}
function matchesFolder(file, folders) {
  return folders.some(folder => {
    try { fileInFolder(file, folder); return true; } catch (_) { return false; }
  });
}
// Only files already included by the authorized business view are candidates. No caller-supplied file list.
async function decorateMedia(cloud, server, domain, action, input, result) {
  if (!READS[domain] || !READS[domain].includes(action) || !result) return result;
  const candidates = filesInView(result);
  if (!candidates.size) return result;
  const allowed = new Set(), users = new Map();
  async function userId(openid) {
    if (!openid) return '';
    if (!users.has(openid)) users.set(openid, await server.one('users', { openid }));
    return users.get(openid) && users.get(openid)._id || '';
  }
  function allow(view, folders) {
    for (const file of filesInView(view)) if (matchesFolder(file, folders.filter(Boolean))) allowed.add(file);
  }
  async function rows(collection, views, folderFor) {
    for (const view of views.filter(Boolean)) {
      if (!filesInView(view).size || !view._id) continue;
      const record = await server.get(collection, view._id);
      if (record) allow(view, await folderFor(record));
    }
  }
  const list = result.list || [];
  async function providerFolders(p, kyc = false) {
    const id = p.userId || await userId(p.openid);
    return id ? ['providers/' + id, ...(kyc && p.status === 'pending' ? ['kyc/' + id] : [])] : [];
  }
  async function orderFolders(o) {
    const folders = ['orders/' + o._id, 'idle-delivery/' + o._id, 'merchant-orders/' + o._id, 'vacant/' + o._id];
    if (o.kind === 'idle_purchase') {
      const sellerId = await userId(o.sellerOpenid);
      if (sellerId) folders.push('idle/' + sellerId);
    }
    if (o.providerId) {
      const p = await server.get('providers', o.providerId);
      if (p) folders.push(...await providerFolders(p));
    }
    return folders;
  }
  if (domain === 'order') await rows('orders', [result], orderFolders);
  if (domain === 'provider') await rows('providers', [result.provider], p => providerFolders(p));
  if (domain === 'admin') await rows('providers', list, p => providerFolders(p, true));
  if (domain === 'board') await rows('posts', result.post ? [result.post] : list, async p => {
    const id = p.authorUserId || await userId(p.authorOpenid); return id ? ['board/' + id] : [];
  });
  if (domain === 'idle') {
    if (action === 'sales') await rows('orders', list, orderFolders);
    else await rows('idleItems', result.item ? [result.item] : list, async p => {
      const id = await userId(p.sellerOpenid); return id ? ['idle/' + id] : [];
    });
  }
  if (domain === 'chat') allow(result, ['chat/' + result.conversationId]);
  if (domain === 'pet') allow(result, ['pet/' + input.orderId]);
  if (domain === 'station') allow(result, ['station/' + input.batchId]);
  if (domain === 'event') await rows('events', result._id ? [result] : list, async p => {
    const id = await userId(p.mediaOwnerOpenid || p.ownerOpenid); return id ? ['events/' + id] : [];
  });
  if (domain === 'merchant') {
    const services = ['servicesForMerchant', 'myServices', 'adminServices'].includes(action);
    if (action === 'merchantOrders') await rows('orders', list, orderFolders);
    else {
      await rows(services ? 'merchantServices' : 'merchants', list, async p => {
        const id = await userId(services ? p.ownerOpenid : p.staffOpenids && p.staffOpenids[0]);
        return id ? [services ? 'merchant-services/' + id : 'merchants/' + id + '/license'] : [];
      });
      if (result.merchant) await rows('merchants', [result.merchant], async p => {
        const id = await userId(p.staffOpenids && p.staffOpenids[0]); return id ? ['merchants/' + id + '/license'] : [];
      });
    }
  }
  if (domain === 'content') {
    const notices = action === 'homeContent' ? result.notices || [] : action === 'listNotices' ? list : [];
    const ads = ['homeContent','adsForSlot'].includes(action) ? result.ads || [] : action === 'listAds' ? list : [];
    for (const [collection, views] of [['notices', notices], ['ads', ads]]) await rows(collection, views, async p => {
      const id = await userId(p.mediaOwnerOpenid || p.createdBy); return id ? [collection + '/' + id] : [];
    });
  }
  const media = Object.fromEntries([...candidates].map(file => [file, { url: '', expiresAt: 0, error: '图片归属无法确认，请重新上传' }]));
  const ids = [...allowed];
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    try {
      const signed = await cloud.getTempFileURL({ fileList: batch.map(fileID => ({ fileID, maxAge: MAX_AGE })) });
      for (const item of signed.fileList || []) if (batch.includes(item.fileID) && item.status === 0 && /^https:\/\//.test(item.tempFileURL)) {
        media[item.fileID] = { url: item.tempFileURL, expiresAt: Date.now() + MAX_AGE * 1000 };
      }
      for (const file of batch) if (!media[file].url) media[file].error = '图片暂不可用，请重试';
    } catch (_) { for (const file of batch) media[file].error = '图片暂不可用，请重试'; }
  }
  return { ...result, _media: media };
}

module.exports = { MAX_AGE, READS, filesInView, matchesFolder, decorateMedia };
