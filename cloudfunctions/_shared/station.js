const { ensure, integer, text } = require('./validate');
const { csvCell } = require('./settlementData');

function parseAddressLines(value) {
  ensure(typeof value === 'string' && value.length <= 20000, '门牌列表格式不正确');
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  ensure(lines.length >= 1 && lines.length <= 100, '每批请填写 1—100 条门牌');
  const result = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const last = line.lastIndexOf('-');
    const middle = last > 0 ? line.lastIndexOf('-', last - 1) : -1;
    ensure(middle > 0 && last > middle + 1 && last < line.length - 1, `第 ${index + 1} 行格式应为“楼栋-单元-门牌”`);
    const buildingName = text(line.slice(0, middle).trim(), '楼栋', 60);
    const unit = text(line.slice(middle + 1, last).trim(), '单元', 20);
    const room = text(line.slice(last + 1).trim(), '门牌号', 30);
    const key = [buildingName, unit, room].join('\u0000');
    ensure(!seen.has(key), `第 ${index + 1} 行门牌重复`);
    seen.add(key);
    result.push({ buildingName, unit, room });
  }
  return result;
}

function deliveryItem(item, event, batchId, now = new Date()) {
  ensure(item && item.status === 'pending', '该住户已处理，请刷新后重试', 'E_CONFLICT');
  if (event.status === 'delivered') {
    const photoFileId = event.photoFileId;
    ensure(typeof photoFileId === 'string' && photoFileId.startsWith('cloud://') &&
      photoFileId.includes(`/station/${batchId}/`), '请上传本批次的送达照片');
    return { status: 'delivered', photoFileId, at: now };
  }
  ensure(event.status === 'failed', '送达结果不正确');
  const reason = event.reason === undefined ? '' : event.reason;
  ensure(typeof reason === 'string' && [...reason].length <= 100, '失败说明不能超过 100 字');
  return { status: 'failed', failReason: reason.trim(), at: now };
}

function skippedItem(item, reason, now = new Date()) {
  ensure(item && item.status === 'pending', '该住户已处理，请刷新后重试', 'E_CONFLICT');
  ensure(typeof reason === 'string' && [...reason].length >= 1 && [...reason].length <= 100, '跳过原因不正确');
  return { status: 'skipped', failReason: reason.trim(), at: now };
}

function batchStatus(items) {
  ensure(Array.isArray(items) && items.length > 0, '批次门牌列表为空', 'E_CONFIG');
  return items.some(item => item.status === 'pending') ? 'assigned' : 'done';
}

function deliveredCount(items) {
  ensure(Array.isArray(items), '批次门牌列表不正确', 'E_CONFIG');
  return items.filter(item => item.status === 'delivered').length;
}

function billing(deliveredItems, config = {}) {
  integer(deliveredItems, '已送达件数', 0, 100000);
  const perPiece = integer(config.perPiece === undefined ? 50 : config.perPiece, '每件驿站费用', 1, 1000000, 'E_CONFIG');
  const perPiecePayout = integer(config.perPiecePayout === undefined ? 40 : config.perPiecePayout,
    '每件服务员计件', 0, perPiece, 'E_CONFIG');
  return { gross: deliveredItems * perPiece, provider: deliveredItems * perPiecePayout,
    property: 0, platform: deliveredItems * (perPiece - perPiecePayout), goods: 0 };
}

function statement(batches, from, to) {
  ensure(Array.isArray(batches), '驿站批次数据不正确', 'E_CONFIG');
  const rows = batches.filter(batch => batch.status === 'done' && batch.completedAt >= from && batch.completedAt < to)
    .sort((a, b) => a.completedAt - b.completedAt || a._id.localeCompare(b._id)).map(batch => {
      const items = (batch.items || []).filter(item => item.consented === true);
      const delivered = deliveredCount(items);
      const failed = items.filter(item => item.status === 'failed').length;
      const skipped = items.filter(item => item.status === 'skipped').length;
      const amounts = batch.amounts || billing(delivered, batch.priceSnapshot || {});
      return { batchId: batch._id, stationCode: batch.stationCode, providerId: batch.providerId,
        completedAt: batch.completedAt, totalItems: items.length, delivered, failed, skipped,
        gross: amounts.gross, provider: amounts.provider };
    });
  return { rows, gross: rows.reduce((sum, row) => sum + row.gross, 0),
    provider: rows.reduce((sum, row) => sum + row.provider, 0) };
}

function statementCsv(result) {
  const header = ['批次编号', '驿站编号', '服务员编号', '完成时间', '纳入门牌数', '送达件数', '未送达件数', '撤回授权跳过数', '驿站应付（分）', '服务员计件（分）'];
  const rows = result.rows.map(row => [row.batchId, row.stationCode, row.providerId, row.completedAt.toISOString(),
    row.totalItems, row.delivered, row.failed, row.skipped, row.gross, row.provider]);
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

function providerBatchView(batch) {
  const items = (batch.items || []).filter(item => item.consented === true);
  const pending = items.filter(item => item.status === 'pending').length;
  return { _id: batch._id, stationCode: batch.stationCode, status: batch.status, createdAt: batch.createdAt,
    itemCount: items.length, pendingCount: pending, deliveredCount: deliveredCount(items),
    skippedCount: items.filter(item => item.status === 'skipped').length,
    estimatedIncome: billing(pending, batch.priceSnapshot || {}).provider };
}

function providerBatchDetail(batch) {
  return { ...providerBatchView(batch), startedAt: batch.startedAt || null,
    items: (batch.items || []).filter(item => item.consented === true).map(({ _id, buildingName, unit, room, status, photoFileId, at, failReason }) =>
      ({ _id, buildingName, unit, room, status, photoFileId: photoFileId || null, at: at || null, failReason: failReason || '' })) };
}

module.exports = { parseAddressLines, deliveryItem, skippedItem, batchStatus, deliveredCount, billing, statement, statementCsv,
  providerBatchView, providerBatchDetail };
