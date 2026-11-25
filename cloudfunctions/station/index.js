const { fileInFolder } = require('./lib/shared/providerData');
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { requireRole, requireApprovedProvider } = require('./lib/shared/auth');
const { ensure, integer, text } = require('./lib/shared/validate');
const { atomic, read, insert } = require('./lib/shared/transaction');
const { canWork } = require('./lib/shared/providerData');
const { parseAddressLines, deliveryItem, skippedItem, batchStatus, deliveredCount, billing, statement, statementCsv,
  providerBatchView, providerBatchDetail } = require('./lib/shared/station');
const { period } = require('./lib/shared/settlementData');
const { isEnabled } = require('./lib/shared/features');
const { stationGrant, reviewInput } = require('./lib/shared/stationApplications');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const { command, db } = server;

async function setDoorDelivery(event, { user }) {
  requireRole(user, ['resident']);
  ensure(typeof event.enabled === 'boolean', '默认送上门设置不正确');
  text(user.communityId, '小区');
  const community = await server.feature('stationDelivery', user.communityId);
  ensure(community.community && community.community.status === 'active', '小区暂不可用');
  const now = new Date();
  return atomic(server.db, async transaction => {
    const current = await read(transaction, 'users', user._id);
    ensure(current && current.openid === user.openid && current.communityId === user.communityId && !current.blocked,
      '账号状态已变化，请重新登录', 'E_CONFLICT');
    await transaction.collection('users').doc(current._id).update({ data: {
      'prefs.doorDelivery': event.enabled, updatedAt: now
    } });
    return { doorDelivery: event.enabled };
  });
}

async function stationContext(user) {
  requireRole(user, ['station']);
  const communityId = text(user.stationCommunityId || user.communityId, '小区');
  text(user.stationCode, '驿站');
  const { community } = await server.feature('stationDelivery', communityId);
  ensure(community && community.status === 'active' &&
    Array.isArray(community.stations) && community.stations.some(item => item.code === user.stationCode),
  '驿站账号尚未绑定有效小区', 'E_FORBIDDEN');
  return { community, stationCode: user.stationCode };
}

async function applicationOptions(event, { user }) {
  await server.featureEntry('stationDelivery', user, user.stationCommunityId || user.communityId);
  const [config, communities] = await Promise.all([server.config(), server.all('communities', { status: 'active' })]);
  return { list: communities.filter(community => isEnabled('stationDelivery', config, community))
    .map(community => ({ _id: community._id, name: community.name,
      stations: (community.stations || []).map(({ code, name }) => ({ code, name })) }))
    .filter(community => community.stations.length) };
}

async function myApplication(event, { openid, user }) {
  const id = 'station_app_' + crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
  const application = await server.get('stationApplications', id);
  await server.featureEntry('stationDelivery', user, application ? application.communityId : user.stationCommunityId || user.communityId);
  return { application: application ? { communityId: application.communityId, stationCode: application.stationCode,
    stationName: application.stationName, status: application.status, reviewNote: application.reviewNote || '' } : null };
}

async function apply(event, { user, openid }) {
  requireRole(user, ['resident']);
  const communityId = text(event.communityId, '小区');
  const stationCode = text(event.stationCode, '驿站');
  const { community } = await server.feature('stationDelivery', communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  const station = (community.stations || []).find(item => item.code === stationCode);
  ensure(station, '所选驿站不存在');
  ensure(!user.roles.includes('station'), '驿站账号已绑定，请联系管理员调整');
  const id = 'station_app_' + crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
  const now = new Date();
  const result = await atomic(db, async transaction => {
    const current = await read(transaction, 'stationApplications', id);
    ensure(!current || current.status === 'rejected', '驿站申请已提交，请等待管理员审核', 'E_BAD_STATE');
    const data = { userId: user._id, userOpenid: openid, communityId, stationCode, stationName: station.name,
      status: 'pending', reviewNote: '', createdAt: current ? current.createdAt : now, updatedAt: now,
      reviewedAt: null, reviewedBy: null };
    if (current) await transaction.collection('stationApplications').doc(id).update({ data });
    else await insert(transaction, 'stationApplications', { _id: id, ...data });
    return { status: 'pending' };
  });
  return result;
}

async function listApplications(event, { user }) {
  requireRole(user, ['admin']);
  const status = event.status || 'pending';
  ensure(['pending', 'approved', 'rejected'].includes(status), '审核状态不正确');
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('stationApplications').where({ status }).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  const users = await Promise.all(rows.data.map(row => server.get('users', row.userId)));
  return { list: rows.data.map((row, index) => ({ _id: row._id, communityId: row.communityId,
    stationCode: row.stationCode, stationName: row.stationName, status: row.status, reviewNote: row.reviewNote || '',
    createdAt: row.createdAt, phone: users[index] && users[index].phone ? users[index].phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
    applicant: users[index] && users[index].nickname || '小程序用户' })), hasMore: rows.data.length === 20 };
}

async function reviewApplication(event, { user, openid }) {
  requireRole(user, ['admin']);
  const { applicationId, status, reviewNote } = reviewInput(event);
  const now = new Date();
  return atomic(db, async transaction => {
    const application = await read(transaction, 'stationApplications', applicationId);
    ensure(application && application.status === 'pending', '申请已处理或不存在', 'E_CONFLICT');
    const applicant = await read(transaction, 'users', application.userId);
    ensure(applicant && applicant.openid === application.userOpenid && !applicant.blocked, '申请人账号状态异常', 'E_CONFLICT');
    const community = await read(transaction, 'communities', application.communityId);
    ensure(community && community.status === 'active' && (community.stations || []).some(item => item.code === application.stationCode),
      '申请对应的小区或驿站配置已失效', 'E_CONFLICT');
    await transaction.collection('stationApplications').doc(application._id).update({ data: {
      status, reviewNote, reviewedBy: openid, reviewedAt: now, updatedAt: now
    } });
    if (status === 'approved') {
      await transaction.collection('users').doc(applicant._id).update({ data: stationGrant(applicant, community._id, application.stationCode, now) });
    }
    return { status };
  });
}

function addressMatches(user, address, buildingId, communityId) {
  const primary = user.communityId === communityId && user.buildingId === buildingId &&
    user.unit === address.unit && user.room === address.room;
  const saved = (user.addresses || []).some(item => item.communityId === communityId && item.buildingId === buildingId &&
    item.unit === address.unit && item.room === address.room);
  return primary || saved;
}

function creationBatchId(stationCode, requestId) {
  text(requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
  return 'station_' + crypto.createHash('sha256').update(stationCode + ':' + requestId).digest('hex').slice(0, 32);
}

function batchCreationResult(batch, inputCount = batch.inputCount) {
  return { batchId: batch._id, eligibleCount: batch.items.length,
    skippedCount: Math.max(0, inputCount - batch.items.length), repeated: true };
}

function sameBatchCreator(batch, user) {
  ensure(batch.stationCode === user.stationCode && batch.communityId === (user.stationCommunityId || user.communityId) &&
    (!batch.creationOwnerId || batch.creationOwnerId === user._id), '无权读取该批次创建结果', 'E_FORBIDDEN');
}

async function lookupBatchCreation(event, { user }) {
  requireRole(user, ['station']);
  text(user.stationCommunityId || user.communityId, '小区');
  text(user.stationCode, '驿站');
  const batch = await server.get('deliveryBatches', creationBatchId(user.stationCode, event.requestId));
  if (!batch) return { batchId: null };
  sameBatchCreator(batch, user);
  ensure(batch.creationOwnerId === user._id && Number.isSafeInteger(batch.inputCount),
    '历史批次缺少本人创建凭据，请到工作台核对', 'E_FORBIDDEN');
  return batchCreationResult(batch);
}

async function createBatch(event, { user }) {
  const { community, stationCode } = await stationContext(user);
  const batchId = creationBatchId(stationCode, event.requestId);
  const addresses = parseAddressLines(event.lines);
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(addresses)).digest('hex');
  const checkPrevious = previous => {
    sameBatchCreator(previous, user);
    ensure(!previous.creationInputHash || previous.creationInputHash === inputHash,
      '请求编号已用于不同门牌清单，请先核对原批次', 'E_CONFLICT');
    return batchCreationResult(previous, previous.inputCount ?? addresses.length);
  };
  const existing = await server.get('deliveryBatches', batchId);
  if (existing) return checkPrevious(existing);
  const buildings = await server.all('buildings', { communityId: community._id });
  const byName = new Map(buildings.map(building => [building.name, building]));
  const resolved = addresses.map(address => {
    const building = byName.get(address.buildingName);
    ensure(building && Array.isArray(building.units) && building.units.includes(address.unit), `门牌不存在：${address.buildingName}-${address.unit}-${address.room}`);
    return { ...address, buildingId: building._id };
  });
  const candidates = [];
  for (let start = 0; start < resolved.length; start += 10) {
    const group = resolved.slice(start, start + 10);
    const results = await Promise.all(group.map(async (address, offset) => {
      const [primary, saved] = await Promise.all([
        db.collection('users').where({ communityId: community._id, buildingId: address.buildingId,
          unit: address.unit, room: address.room }).limit(20).get(),
        db.collection('users').where({ addresses: command.elemMatch({ communityId: community._id,
          buildingId: address.buildingId, unit: address.unit, room: address.room }) }).limit(20).get()
      ]);
      const matching = new Map();
      for (const resident of [...primary.data, ...saved.data]) {
        if (resident.prefs && resident.prefs.doorDelivery === true && addressMatches(resident, address, address.buildingId, community._id)) {
          matching.set(resident._id, resident);
        }
      }
      const resident = matching.values().next().value;
      return resident ? { address, userId: resident._id, sourceIndex: start + offset } : null;
    }));
    candidates.push(...results.filter(Boolean));
  }
  const result = await atomic(db, async transaction => {
    const actor = await read(transaction, 'users', user._id);
    ensure(actor && !actor.blocked && actor.openid === user.openid && actor.roles?.includes('station') &&
      actor.stationCode === stationCode && (actor.stationCommunityId || actor.communityId) === community._id,
    '驿站身份已变化，请重新核对', 'E_FORBIDDEN');
    const previous = await read(transaction, 'deliveryBatches', batchId);
    if (previous) return checkPrevious(previous);
    const items = [];
    for (const candidate of candidates) {
      const currentResident = await read(transaction, 'users', candidate.userId);
      if (!currentResident || currentResident.blocked || currentResident.prefs?.doorDelivery !== true ||
        !addressMatches(currentResident, candidate.address, candidate.address.buildingId, community._id)) continue;
      items.push({ _id: 'item_' + candidate.sourceIndex, userId: currentResident._id, buildingId: candidate.address.buildingId,
        buildingName: candidate.address.buildingName, unit: candidate.address.unit, room: candidate.address.room,
        consented: true, status: 'pending', photoFileId: null, at: null, failReason: '' });
    }
    if (!items.length) return { batchId: null, eligibleCount: 0, skippedCount: addresses.length, repeated: false };
    const now = new Date();
    await insert(transaction, 'deliveryBatches', { _id: batchId, communityId: community._id, stationCode,
      creationOwnerId: user._id, creationInputHash: inputHash, inputCount: addresses.length,
      items, providerId: null, providerOpenid: null, status: 'open', createdAt: now, updatedAt: now,
      priceSnapshot: community.prices && community.prices.stationDelivery || {} });
    return { batchId, eligibleCount: items.length, skippedCount: addresses.length - items.length, repeated: false };
  });
  return result;
}

async function listMyBatches(event, { user }) {
  const { community, stationCode } = await stationContext(user);
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('deliveryBatches').where({ communityId: community._id, stationCode })
    .orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  return { list: rows.data.map(batch => {
    const items = Array.isArray(batch.items) ? batch.items : [];
    return { _id: batch._id, status: batch.status, createdAt: batch.createdAt, itemCount: items.length,
    deliveredCount: items.filter(item => item.status === 'delivered').length,
    failedCount: items.filter(item => item.status === 'failed').length, skippedCount: items.filter(item => item.status === 'skipped').length,
    providerId: batch.providerId || null };
  }), hasMore: rows.data.length === 20 };
}

async function exportStatement(event, { user }) {
  let community, stationCode;
  if (event.communityId !== undefined || event.stationCode !== undefined || !user.roles.includes('station')) {
    requireRole(user, ['admin']);
    const context = await server.feature('stationDelivery', text(event.communityId, '小区'));
    community = context.community;
    stationCode = text(event.stationCode, '驿站');
    ensure(community && (community.stations || []).some(item => item.code === stationCode), '小区或驿站不存在');
  } else ({ community, stationCode } = await stationContext(user));
  const range = period(event);
  const rows = await server.all('deliveryBatches', { communityId: community._id, stationCode, status: 'done',
    completedAt: command.gte(range.from).and(command.lt(range.to)) });
  const result = statement(rows, range.from, range.to);
  const file = await cloud.uploadFile({ cloudPath: `exports/station/${stationCode}/${Date.now()}.csv`,
    fileContent: Buffer.from(statementCsv(result), 'utf8') });
  const urls = await cloud.getTempFileURL({ fileList: [file.fileID] });
  ensure(urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL, '对账文件生成失败', 'E_INTERNAL');
  return { fileId: file.fileID, tempFileURL: urls.fileList[0].tempFileURL, count: result.rows.length,
    gross: result.gross, provider: result.provider };
}

async function providerFor(openid) {
  const provider = await server.one('providers', { openid });
  requireApprovedProvider(provider, 1);
  return provider;
}

async function providerHall(event, { openid }) {
  const provider = await providerFor(openid);
  canWork(provider, new Date(), 1, true);
  await server.feature('stationDelivery', provider.communityId);
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('deliveryBatches').where({ communityId: provider.communityId, status: 'open' })
    .orderBy('createdAt', 'asc').skip(offset).limit(20).get();
  return { list: rows.data.map(providerBatchView).filter(row => row.itemCount > 0), hasMore: rows.data.length === 20 };
}

async function acceptBatch(event, { openid }) {
  text(event.batchId, '驿站批次');
  const [provider, batch] = await Promise.all([providerFor(openid), server.get('deliveryBatches', event.batchId)]);
  ensure(batch && batch.communityId === provider.communityId, '批次不存在或不属于当前小区', 'E_FORBIDDEN');
  canWork(provider, new Date(), 1, true);
  await server.feature('stationDelivery', batch.communityId);
  return atomic(db, async transaction => {
    const current = await read(transaction, 'deliveryBatches', batch._id);
    const currentProvider = await read(transaction, 'providers', provider._id);
    ensure(currentProvider && currentProvider.openid === openid &&
      currentProvider.communityId === provider.communityId && current && current.communityId === currentProvider.communityId,
    '服务员或批次归属已变化，请刷新后重试', 'E_FORBIDDEN');
    const now = new Date();
    canWork(currentProvider, now, 1, true);
    ensure(current && current.status === 'open', '批次已被其他服务员接走', 'E_CONFLICT');
    const eligible = (current.items || []).filter(item => item.consented === true && item.status === 'pending');
    ensure(eligible.length > 0, '批次没有可配送的住户');
    await transaction.collection('deliveryBatches').doc(current._id).update({ data: {
      status: 'assigned', providerId: currentProvider._id, providerOpenid: openid, acceptedAt: now, updatedAt: now
    } });
    return { batchId: current._id, status: 'assigned' };
  });
}

async function assignedBatch(batchId, openid) {
  text(batchId, '驿站批次');
  const [provider, batch] = await Promise.all([providerFor(openid), server.get('deliveryBatches', batchId)]);
  ensure(batch && batch.providerId === provider._id && batch.providerOpenid === openid &&
    batch.communityId === provider.communityId, '无权操作该驿站批次', 'E_FORBIDDEN');
  await server.feature('stationDelivery', batch.communityId);
  return { provider, batch };
}

async function providerBatch(event, { openid }) {
  const { batch } = await assignedBatch(event.batchId, openid);
  return providerBatchDetail(batch);
}

async function readAssignedBatch(transaction, batch, provider, openid) {
  const current = await read(transaction, 'deliveryBatches', batch._id);
  const currentProvider = await read(transaction, 'providers', provider._id);
  ensure(currentProvider && currentProvider.openid === openid &&
    currentProvider.communityId === provider.communityId && current &&
    current.providerId === currentProvider._id && current.providerOpenid === openid &&
    current.communityId === currentProvider.communityId,
  '服务员或批次归属已变化，请刷新后重试', 'E_FORBIDDEN');
  requireApprovedProvider(currentProvider, 1);
  return { current, currentProvider };
}

async function startBatch(event, { openid }) {
  const { provider, batch } = await assignedBatch(event.batchId, openid);
  canWork(provider, new Date(), 1);
  ensure(batch.status === 'assigned', '该批次当前不能开始服务', 'E_BAD_STATE');
  if (batch.startedAt) return { batchId: batch._id, status: batch.status, startedAt: batch.startedAt };
  const now = new Date();
  const result = await atomic(db, async transaction => {
    const { current, currentProvider } = await readAssignedBatch(transaction, batch, provider, openid);
    canWork(currentProvider, new Date(), 1);
    ensure(current.status === 'assigned', '批次状态已变化，请刷新后重试', 'E_CONFLICT');
    if (current.startedAt) return { startedAt: current.startedAt };
    await transaction.collection('deliveryBatches').doc(current._id).update({ data: { startedAt: now, updatedAt: now } });
    return { startedAt: now };
  });
  return { batchId: batch._id, status: 'assigned', startedAt: result.startedAt };
}

async function checkDoorDeliveryConsent(event, { openid }) {
  const { provider, batch } = await assignedBatch(event.batchId, openid);
  ensure(batch.status === 'assigned' && batch.startedAt, '请先开始配送', 'E_BAD_STATE');
  text(event.itemId, '门牌记录');
  return atomic(db, async transaction => {
    const { current } = await readAssignedBatch(transaction, batch, provider, openid);
    ensure(current.status === 'assigned' && current.startedAt,
      '批次状态已变化，请刷新后重试', 'E_CONFLICT');
    const index = (current.items || []).findIndex(item => item._id === event.itemId);
    ensure(index >= 0, '门牌记录不存在');
    const item = current.items[index];
    ensure(item.consented === true && item.status === 'pending', '该门牌当前不能继续配送', 'E_BAD_STATE');
    const resident = await read(transaction, 'users', item.userId);
    if (resident && resident.communityId === current.communityId && resident.prefs && resident.prefs.doorDelivery === true) {
      return { allowed: true, status: 'pending' };
    }
    const now = new Date();
    const items = current.items.slice();
    items[index] = { ...item, ...skippedItem(item, '住户已撤回送上门授权', now) };
    const eligibleItems = items.filter(row => row.consented === true);
    const status = batchStatus(eligibleItems);
    const data = { items, status, updatedAt: now };
    if (status === 'done') {
      const amounts = billing(deliveredCount(eligibleItems), current.priceSnapshot || {});
      if (amounts.gross > 0) await insert(transaction, 'ledger', { _id: 'station_' + current._id,
        refType: 'station_delivery', refId: current._id, communityId: current.communityId,
        stationCode: current.stationCode, providerId: provider._id, amounts,
        settled: { provider: false, property: false }, settlementIds: { provider: null, property: null }, createdAt: now });
      Object.assign(data, { completedAt: now, amounts, ledgerId: amounts.gross > 0 ? 'station_' + current._id : null });
    }
    await transaction.collection('deliveryBatches').doc(current._id).update({ data });
    return { allowed: false, status: 'skipped', reason: '住户已撤回送上门授权', batchStatus: status };
  });
}

async function recordDelivery(event, { openid }) {
  const { provider, batch } = await assignedBatch(event.batchId, openid);
  ensure(batch.status === 'assigned' && batch.startedAt, '请先开始配送', 'E_BAD_STATE');
  text(event.itemId, '门牌记录');
  ensure(['delivered', 'failed'].includes(event.status), '配送结果不正确');
  if (event.status === 'delivered') fileInFolder(event.photoFileId, 'station/' + batch._id);
  return atomic(db, async transaction => {
    const { current } = await readAssignedBatch(transaction, batch, provider, openid);
    ensure(current.status === 'assigned' && current.startedAt,
      '批次状态已变化，请刷新后重试', 'E_CONFLICT');
    const index = (current.items || []).findIndex(item => item._id === event.itemId);
    ensure(index >= 0, '门牌记录不存在');
    const item = current.items[index];
    ensure(item.consented === true, '该住户未同意送上门');
    ensure(item.userId, '门牌缺少住户关联，请联系驿站管理员', 'E_CONFIG');
    const resident = await read(transaction, 'users', item.userId);
    if (!resident || resident.communityId !== current.communityId || !resident.prefs || resident.prefs.doorDelivery !== true) {
      const now = new Date();
      const items = current.items.slice();
      items[index] = { ...item, ...skippedItem(item, '住户已撤回送上门授权', now) };
      const eligibleItems = items.filter(row => row.consented === true);
      const status = batchStatus(eligibleItems);
      const data = { items, status, updatedAt: now, ...(status === 'done' ? { completedAt: now } : {}) };
      if (status === 'done') {
        const amounts = billing(deliveredCount(eligibleItems), current.priceSnapshot || {});
        if (amounts.gross > 0) await insert(transaction, 'ledger', { _id: 'station_' + current._id,
          refType: 'station_delivery', refId: current._id, communityId: current.communityId,
          stationCode: current.stationCode, providerId: provider._id, amounts,
          settled: { provider: false, property: false }, settlementIds: { provider: null, property: null }, createdAt: now });
        data.amounts = amounts;
        data.ledgerId = amounts.gross > 0 ? 'station_' + current._id : null;
      }
      await transaction.collection('deliveryBatches').doc(current._id).update({ data });
      return { batchId: current._id, itemId: event.itemId, status: 'skipped', reason: '住户已撤回送上门授权', batchStatus: status };
    }
    if (event.status === 'delivered') {
      ensure(resident && resident.communityId === current.communityId, '住户资料不存在', 'E_CONFIG');
    }
    const now = new Date();
    const patch = deliveryItem(item, event, current._id, now);
    const items = current.items.slice();
    items[index] = { ...item, ...patch };
    const eligibleItems = items.filter(row => row.consented === true);
    const status = batchStatus(eligibleItems);
    const data = { items, status, updatedAt: now, ...(status === 'done' ? { completedAt: now } : {}) };
    if (status === 'done') {
      const amounts = billing(deliveredCount(eligibleItems), current.priceSnapshot || {});
      if (amounts.gross > 0) await insert(transaction, 'ledger', { _id: 'station_' + current._id,
        refType: 'station_delivery', refId: current._id, communityId: current.communityId,
        stationCode: current.stationCode, providerId: provider._id, amounts,
        settled: { provider: false, property: false }, settlementIds: { provider: null, property: null }, createdAt: now });
      data.amounts = amounts;
      data.ledgerId = amounts.gross > 0 ? 'station_' + current._id : null;
    }
    await transaction.collection('deliveryBatches').doc(current._id).update({ data });
    return { batchId: current._id, itemId: event.itemId, status, batchStatus: status };
  });
}

exports.main = server.entry({ setDoorDelivery, listMyBatches, exportStatement, lookupBatchCreation, providerHall, acceptBatch, providerBatch,
  createBatch, startBatch, checkDoorDeliveryConsent, recordDelivery, applicationOptions, myApplication, apply,
  listApplications, reviewApplication }, ['resident', 'admin', 'station', 'provider'], 'station');
