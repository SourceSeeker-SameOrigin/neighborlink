const DAY = 24 * 3600000;
const OFFSET = 8 * 3600000;

function validDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('日期不正确');
  return date;
}
// Keep the timestamp unchanged; convert only calendar fields to Beijing time.
function ymd(date) {
  const shifted = validDate(new Date(validDate(date).getTime() + OFFSET));
  return String(shifted.getUTCFullYear()).padStart(4, '0') + '-' +
    String(shifted.getUTCMonth() + 1).padStart(2, '0') + '-' + String(shifted.getUTCDate()).padStart(2, '0');
}
function addDays(date, days) {
  validDate(date);
  if (!Number.isSafeInteger(days)) throw new Error('天数不正确');
  return validDate(new Date(date.getTime() + days * DAY));
}

function display(value) {
  if (!value) return '';
  const date = new Date(new Date(value).getTime() + 8 * 3600000);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
function slotText(slot) { return slot ? slot.date + ' ' + slot.start + '—' + slot.end : '尽快上门'; }
module.exports = { display, slotText, ymd, addDays };
