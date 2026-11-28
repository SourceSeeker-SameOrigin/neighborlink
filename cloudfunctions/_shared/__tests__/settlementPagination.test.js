const { adminSettlementActions } = require('../adminSettlements');
function fixture() {
  const rows = Array.from({ length: 121 }, (_, i) => ({ _id: 's' + i, createdAt: new Date(i * 1000),
    communityId: i < 101 ? 'c1' : 'c2', payee: i < 111 ? 'property' : 'provider', total: i + 1,
    status: 'draft', period: { from: '2026-11-01', to: '2026-11-10' }, ledgerIds: ['private'], createdBy: 'private' }));
  const reads = [];
  const db = { collection: name => {
    const query = { name };
    const chain = { where(filter) { query.filter = filter; return chain; },
      orderBy(field, direction) { query.order = [field, direction]; return chain; },
      skip(offset) { query.offset = offset; return chain; }, limit(size) { query.limit = size; return chain; },
      async get() { reads.push(query); return { data: rows.filter(row => Object.entries(query.filter).every(([k,v]) => row[k] === v))
        .sort((a,b) => b.createdAt-a.createdAt).slice(query.offset, query.offset + query.limit) }; } };
    return chain;
  } };
  const all = jest.fn(() => { throw Error('Must not read all records'); });
  return { api: adminSettlementActions({}, { db, all }), reads, all };
}
const admin = { user: { roles: ['admin'] } };
test('reads all 121 settlements over bounded pages without changing amounts or exposing internal fields', async () => {
  const { api, reads, all } = fixture(); const list = [];
  let page;
  do { page = await api.listSettlements({ offset: list.length }, admin); list.push(...page.list); } while (page.hasMore);
  expect(list).toHaveLength(121); expect(new Set(list.map(x=>x._id)).size).toBe(121);
  expect(list[0]).toMatchObject({ _id:'s120', total:121 }); expect(list[120]).toMatchObject({ _id:'s0',total:1 });
  expect(list.every(x=>!('ledgerIds' in x) && !('createdBy' in x))).toBe(true);
  expect(reads.every(x=>x.limit===20 && x.order.join('/')==='createdAt/desc')).toBe(true); expect(all).not.toHaveBeenCalled();
});
test('property always sees only its own community property entries despite supplied foreign community', async () => {
  const { api, reads } = fixture();
  const result = await api.listSettlements({ communityId:'c2', offset:100 }, { user:{ roles:['property'],communityId:'c1' } });
  expect(result.list.map(x=>x._id)).toEqual(['s0']); expect(result.hasMore).toBe(false);
  expect(reads[0].filter).toEqual({communityId:'c1',payee:'property'});
});
test('dual admin/property role retains existing property restriction', async () => {
  const { api, reads } = fixture(); await api.listSettlements({}, {user:{roles:['admin','property'],communityId:'c1'}});
  expect(reads[0].filter).toEqual({communityId:'c1',payee:'property'});
});
test('admin optional community filter and exact full last page followed by empty page', async () => {
  const { api } = fixture(); const first=await api.listSettlements({communityId:'c2'},admin);
  expect(first.list).toHaveLength(20); expect(first.hasMore).toBe(true);
  expect(await api.listSettlements({communityId:'c2',offset:20},admin)).toEqual({list:[],hasMore:false});
});
test('resident denied before database read', async () => {
  const { api, reads }=fixture(); await expect(api.listSettlements({}, {user:{roles:['resident']}})).rejects.toMatchObject({code:'E_FORBIDDEN'}); expect(reads).toEqual([]);
});
test.each([-1, 1.5, '20', null, 100001])('invalid offset %p rejected before read', async offset => {
  const { api, reads }=fixture(); await expect(api.listSettlements({offset},admin)).rejects.toMatchObject({code:'E_INVALID_PARAM'}); expect(reads).toEqual([]);
});
