function minutes(hm) {
  const [hours, mins] = hm.split(':').map(Number);
  return hours * 60 + mins;
}

function clockText(value) {
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

function startHint(windows, date, blocks, now) {
  const count = Number(blocks);
  if (!Number.isInteger(count) || count < 1 || count > 4) return '请填写 1 至 4 档服务时长，每档 2 小时。';
  const midnight = Date.parse(date + 'T00:00:00+08:00');
  const nextMinute = Math.max(0, Math.floor((now.getTime() - midnight) / 60000) + 1);
  const ranges = [];
  for (const { start, end } of windows || []) {
    const from = minutes(start);
    let until = minutes(end);
    if (until < from) until += 1440;
    // A cross-midnight shift belongs to its start date. The picker accepts HH:mm on that date.
    const first = Math.max(from, nextMinute);
    const last = Math.min(1439, until - count * 120);
    if (first <= last) ranges.push(first === last ? clockText(first) : clockText(first) + '–' + clockText(last));
  }
  return ranges.length ? '可选开始时间（北京时间）：' + ranges.sort().join('、') :
    '所选日期没有能容纳这段服务时长的值班时段，请调整日期或时长。';
}

module.exports = startHint;
