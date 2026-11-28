const { ensure } = require('./validate');

function codeEnvVersion() {
  const value = process.env.MINIPROGRAM_CODE_ENV_VERSION || 'trial';
  ensure(value === 'trial' || value === 'release', '小程序码目标版本配置不正确', 'E_CONFIG');
  return value;
}

module.exports = { codeEnvVersion };
