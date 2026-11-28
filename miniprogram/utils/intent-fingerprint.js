function fingerprint(value) {
  const text = JSON.stringify(value);
  let first = 2166136261, second = 5381;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(index);
  }
  return (first >>> 0).toString(36) + ':' + (second >>> 0).toString(36);
}

module.exports = { fingerprint };
