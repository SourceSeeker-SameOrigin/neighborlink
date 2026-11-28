const { yuan } = require('../utils/money');

function discountText(item) {
  if (item.kind === 'percent_off') return '减免' + item.value + '%';
  if (item.kind === 'amount_off') return yuan(item.value) + ' 元';
  return '免费';
}

module.exports = { discountText };
