const { integer } = require('./validate');

// All membership creation/activation paths write this document in their transaction.
// Admin checks it after the out-of-transaction active/pending queries. This closes
// the query/commit gap without unsupported transaction.where() or a new collection.
function nextMembershipRevision(community) {
  const current = community.membershipRevision === undefined ? 0 : community.membershipRevision;
  return integer(current, '月卡配置版本', 0, Number.MAX_SAFE_INTEGER - 1, 'E_CONFIG') + 1;
}

module.exports = { nextMembershipRevision };
