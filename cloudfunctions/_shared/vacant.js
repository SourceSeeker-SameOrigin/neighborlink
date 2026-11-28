const { ensure, record, text } = require('./validate');
const { fileInFolder } = require('./providerData');

const CHECKLIST = Object.freeze({ windows: '门窗检查', utilities: '水电燃气', leakMold: '漏水与霉斑', ventilation: '开窗通风30分钟', mail: '代收快递信件', photos: '巡检拍照' });

function cleanEntry(event) {
  ensure(['password', 'key_handover', 'property_keybox'].includes(event.entry), '请选择入户方式');
  if (event.entry !== 'password') return { entry: event.entry, password: '' };
  const password = text(event.entryPassword, '门锁密码', 100);
  ensure(password.trim().length >= 4, '门锁密码至少 4 位');
  return { entry: 'password', password: password.trim() };
}

function cleanReport(event, order) {
  record(event.checklist, '巡检清单');
  record(event.photoByItem, '巡检照片');
  const checklist = {};
  const photoByItem = {};
  for (const key of Object.keys(CHECKLIST)) {
    ensure(event.checklist[key] === true, `${CHECKLIST[key]}未完成勾选`);
    const photos = Array.isArray(event.photoByItem[key]) ? event.photoByItem[key] : [];
    ensure(photos.length >= 1 && photos.length <= 3, `${CHECKLIST[key]}至少上传 1 张照片`);
    for (const fileId of photos) fileInFolder(fileId, 'vacant/' + order._id, '请上传本次巡检照片');
    checklist[key] = event.checklist[key]; photoByItem[key] = [...new Set(photos)];
    ensure(photoByItem[key].length === photos.length, '照片不能重复');
  }
  const notes = event.notes === undefined ? '' : event.notes;
  ensure(typeof notes === 'string' && [...notes].length <= 500, '巡检补充说明不能超过 500 字');
  ensure(typeof event.attention === 'boolean', '请选择是否需要关注');
  return { checklist, photoByItem, notes: notes.trim(), attention: event.attention, submittedAt: new Date() };
}

module.exports = { CHECKLIST, cleanEntry, cleanReport };
