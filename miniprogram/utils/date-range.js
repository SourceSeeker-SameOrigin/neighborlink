// Compare calendar dates only after checking that they actually exist.
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
module.exports = function validRange(from, to) {
  return validDay(from) && validDay(to) && from <= to;
};
