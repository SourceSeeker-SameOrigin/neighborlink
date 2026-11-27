// Actual three cloud entry points with synthetic identities and QR files only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

async function scenario(envVersion) {
  const eventId = 'event-1';
  const signupId = 'su_' + crypto.createHash('sha256').update(eventId + ':actor').digest('hex').slice(0, 32);
  const backend = fixture({ global: true, local: true, roles: ['admin'], allowWrites: true,
    paymentEnv: { MINIPROGRAM_CODE_ENV_VERSION: envVersion }, records: {
      buildings: [{ _id: 'building-1', communityId: 'c', shortCode: 'BLD001' }],
      providers: [{ _id: 'provider-1', openid: 'actor', communityId: 'c', status: 'approved', level: 1,
        referralCode: 'REF001' }],
      events: [{ _id: eventId, communityIds: ['c'], ownerOpenid: 'actor', status: 'published',
        title: '合成活动', images: [], startAt: new Date('2026-12-01T00:00:00Z'),
        endAt: new Date('2026-12-01T01:00:00Z'), signupDeadline: new Date('2026-11-30T00:00:00Z'),
        capacity: 1, fee: 0 }],
      signups: [{ _id: signupId, eventId, openid: 'actor', status: 'signed',
        checkinCode: 'CHECK001', checkinQrFileId: 'old-develop-file' }]
    } });
  const qrCalls = [];
  backend.cloud.openapi.wxacode = { async getUnlimited(options) {
    qrCalls.push(options); return { buffer: Buffer.from('synthetic-qr') };
  } };
  backend.cloud.uploadFile = async ({ cloudPath }) => ({ fileID: 'cloud://' + cloudPath });
  const admin = await backend.call('admin', 'genPoster', { buildingId: 'building-1' });
  assert.equal(admin.ok, true, JSON.stringify(admin));
  const provider = await backend.call('provider', 'referralPoster');
  assert.equal(provider.ok, true, JSON.stringify(provider));
  const event = await backend.call('event', 'detail', { eventId });
  assert.equal(event.ok, true, JSON.stringify(event));
  assert.equal(qrCalls.length, 3);
  assert(qrCalls.every(call => call.envVersion === envVersion));
  assert.equal(backend.data.buildings[0].posterEnvVersion, envVersion);
  assert.equal(backend.data.providers[0].referralPosterEnvVersion, envVersion);
  assert.equal(backend.data.signups[0].checkinQrEnvVersion, envVersion);
  const repeated = await backend.call('event', 'detail', { eventId });
  assert.equal(repeated.ok, true, JSON.stringify(repeated));
  assert.equal(qrCalls.length, 3);
  return { envVersion, scenes: qrCalls.map(call => call.scene), generated: qrCalls.length,
    reusedSameVersion: true };
}

(async () => {
  const results = [await scenario('trial'), await scenario('release')];
  console.log(JSON.stringify({ scope: 'actual admin/provider/event code generation; synthetic QR files',
    results, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
