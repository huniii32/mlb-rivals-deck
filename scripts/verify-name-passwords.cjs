const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
(async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const sql = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
  const one = async (query, values = []) => Object.values((await db.query(query, values)).rows[0])[0];
  const payload = (id, version) => ({ id, name: 'My Deck', version, players: Array.from({ length: 21 }, () => ({ name: version })) });
  const create = (client, name = 'My Deck', pin = '0123', total = 100) => one(
    'select public.save_ranking_password($1,$2,$3,$4,$5,1,2,3,21,$6::jsonb)',
    [client, client + '-local', pin, name, total, JSON.stringify(payload(client, String(total)))],
  );
  const update = (id, token, name, total) => one(
    'select public.update_ranking_password($1,$2,$3,$4,1,2,3,21,$5::jsonb)',
    [id, token, name, total, JSON.stringify(payload('linked', String(total)))],
  );
  try {
    await db.exec('create role anon; create role authenticated;');
    for (const file of ['supabase_schema.sql', 'supabase_mig_rate_limit.sql', 'supabase_mig_owner_codes.sql', 'supabase_mig_deck_passwords.sql']) await db.exec(sql(file));
    await db.exec('set role anon');
    const computer = await create('computer');
    const tablet = await create('ipad', ' my   DECK ', '0123', 900);
    assert.equal(tablet.id, computer.id, 'same name + password uses original ranking ID');
    assert.notEqual(tablet.token, computer.token, 'each device gets its own session');
    const restored = await one('select public.restore_ranking_password($1,$2)', [computer.id, '0123']);
    assert.equal(restored.deck.version, '900', 'tablet contents replace server contents');
    assert.equal(restored.deck.id, 'ipad', 'server does not restore old computer deck into tablet');
    await db.exec('reset role');
    assert.equal(await one('select count(*)::int from public.rankings'), 1);
    const sessions = await one('select count(*)::int from public.ranking_password_sessions');
    await db.exec('set role anon');
    const wrong = await create('wrong-pin', 'MY DECK', '9999', 1000);
    assert.equal(wrong.error, 'invalid_password');
    assert.equal(wrong.token, undefined);
    await db.exec('reset role');
    assert.equal(await one('select total from public.rankings where id=$1', [computer.id]), 900, 'wrong PIN never overwrites score');
    assert.equal(await one('select count(*)::int from public.ranking_password_sessions'), sessions);
    assert.equal(await one('select attempts from public.ranking_password_attempts where ranking_id=$1', [computer.id]), 1);
    await db.exec('set role anon');
    assert.equal(await update(computer.id, computer.token, 'My Deck', 901), true, 'original device session still works');
    assert.equal(await update(tablet.id, tablet.token, 'My Deck', 902), true, 'new device sync updates same row');
    const other = await create('other-device', 'Other Deck', '4321', 500);
    await assert.rejects(() => update(other.id, other.token, ' my   deck ', 999), /duplicate_name/);
    const failedSave = await create('other-device', 'My Deck', '4321', 1001);
    assert.equal(failedSave.error, 'invalid_password', 'owning another row does not bypass target PIN');
    const again = await create('ipad', 'My Deck', '0123', 903);
    assert.equal(again.id, computer.id, 'unlinked retry on second device does not add a row');
    const queued = await Promise.all(Array.from({ length: 4 }, (_, i) => create('queued-' + i, ' Concurrent Deck ', '1234', i)));
    assert.equal(new Set(queued.map(r => r.id)).size, 1, 'overlapping caller requests resolve to one ID');
    for (let i = 0; i < 10; i++) await create('wrong-' + i, 'My Deck', '9999');
    assert.equal((await create('limited', 'My Deck')).error, 'rate_limited', 'name-based attempts retain the shared rate limit');
    await db.exec('reset role');
    assert.equal(await one('select count(*)::int from public.rankings'), 3);
    assert.equal(await one("select indisunique from pg_index where indexrelid='public.rankings_name_unique'::regclass"), true);
    await assert.rejects(() => db.query("insert into public.rankings(deck_name,total) values(' my  DECK ',0)"), /rankings_name_unique/, 'DB index also blocks duplicate writes outside the RPC');
    await db.exec(sql('supabase_mig_deck_passwords.sql'));
    assert.equal(await one('select count(*)::int from public.rankings'), 3, 'reapplying migration preserves all rankings');
    // Historical duplicate names stop migration without deleting or merging unrelated ownership.
    await db.exec('drop index public.rankings_name_unique');
    await db.query("insert into public.rankings(deck_name,total) values('my deck',0)");
    await assert.rejects(() => db.exec(sql('supabase_mig_deck_passwords.sql')), /duplicate_ranking_names/);
    await db.exec('rollback');
    assert.equal(await one('select count(*)::int from public.rankings'), 4, 'failed migration preserves historical duplicates');
    console.log('name/password SQL: cross-device overwrite, PIN protection, sessions, normalized names, unique index, rename conflict, retry and rate limits passed');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
