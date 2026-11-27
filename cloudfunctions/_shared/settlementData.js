const { ensure, text } = require('./validate');
const { parseDate, addDays } = require('./time');

function period(event) {
  const from = parseDate(event.from);
  const toDay = parseDate(event.to);
  const to = addDays(toDay, 1);
  ensure(to > from && to - from <= 366 * 86400000, '结算期间不能超过一年');
  return { from, to, period: { from: event.from, to: event.to } };
}

function rowsForPayee(ledger, payee, payeeId) {
  return ledger.filter(row => row.settled && row.settled[payee] === false &&
    !(row.settlementIds && row.settlementIds[payee]) &&
    (payee === 'provider' ? row.providerId === payeeId : payee === 'seller' ? row.sellerOpenid === payeeId : payee === 'merchant' ? row.merchantId === payeeId : true) &&
    !(['provider','seller'].includes(payee) && row.payoutId));
}

function amountForPayee(row, payee) {
  if (payee !== 'seller') return row.amounts[payee];
  return Math.max(0, row.amounts.seller - (row.paidAmounts && row.paidAmounts.seller || 0));
}

function total(rows, payee) {
  return rows.reduce((sum, row) => sum + amountForPayee(row, payee), 0);
}

function csvCell(value) {
  let textValue = String(value == null ? '' : value);
  if (/^[=+@\t\r]/.test(textValue) || /^-\s*[=+@]/.test(textValue)) textValue = "'" + textValue;
  return '"' + textValue.replace(/"/g, '""') + '"';
}

function csv(rows) {
  const header = ['收款对象', '小区ID', '服务员ID', '卖家OpenID', '期间开始', '期间结束', '金额（分）', '状态', '账本条数'];
  return '\uFEFF' + [header, ...rows.map(item => [item.payee, item.communityId, item.providerId || '', item.sellerOpenid || '', item.from,
    item.to, item.total, item.status, item.ledgerIds.length])].map(row => row.map(csvCell).join(',')).join('\r\n');
}

function settlementId(payee, communityId, providerId, from, to) {
  const crypto = require('crypto');
  return 'st_' + crypto.createHash('sha256').update([payee, communityId, providerId || '', from, to].join(':')).digest('hex').slice(0, 36);
}
function supplementSettlementId(baseId, ledgerIds) {
  const crypto = require('crypto');
  return 'st_' + crypto.createHash('sha256').update(JSON.stringify([baseId, [...ledgerIds].sort()])).digest('hex').slice(0, 36);
}

function validatePayee(payee) { ensure(['provider', 'property', 'seller', 'merchant'].includes(payee), '收款对象不正确'); }
function validateSettlementNote(note = '') { ensure(typeof note === 'string' && [...note].length <= 200, '备注不能超过 200 字'); return note.trim(); }

module.exports = { period, rowsForPayee, amountForPayee, total, csvCell, csv, settlementId,
  supplementSettlementId, validatePayee, validateSettlementNote };
