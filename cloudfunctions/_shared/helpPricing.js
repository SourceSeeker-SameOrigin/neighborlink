const { ensure, record, integer } = require('./validate');

function helpConfig(config) {
  record(config, '帮把手价格', 'E_CONFIG');
  const mode = config.billingMode === undefined ? 'per15min' : config.billingMode;
  ensure(['per15min', 'per_visit'].includes(mode), '帮把手计价方式不正确', 'E_CONFIG');
  if (mode === 'per_visit') {
    integer(config.perVisit, '帮把手单次价格', 1, Number.MAX_SAFE_INTEGER, 'E_CONFIG');
    integer(config.includedMinutes, '帮把手包含分钟数', 1, Number.MAX_SAFE_INTEGER, 'E_CONFIG');
  } else {
    integer(config.per15min, '每十五分钟价格', 0, Number.MAX_SAFE_INTEGER, 'E_CONFIG');
    integer(config.maxBlocks, '最多时长块数', 1, 8, 'E_CONFIG');
  }
  return mode;
}

function helpTerms(config, detail) {
  const mode = helpConfig(config);
  if (mode === 'per_visit') {
    ensure(detail.billingMode === mode && detail.includedMinutes === config.includedMinutes && detail.blocks === undefined,
      '帮把手计价规则已更新，请重新打开服务页面', 'E_CONFLICT');
    return { billingMode: mode, includedMinutes: config.includedMinutes, overtimePolicy: 'new_order' };
  }
  ensure(detail.billingMode === undefined || detail.billingMode === mode,
    '帮把手计价规则已更新，请重新打开服务页面', 'E_CONFLICT');
  const maxBlocks = integer(config.maxBlocks, '最多时长块数', 1, 8, 'E_CONFIG');
  integer(detail.blocks, '时长块数', 1, maxBlocks);
  return { blocks: detail.blocks };
}

module.exports = { helpConfig, helpTerms };
