import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
const sql = name => readFile(new URL(name, import.meta.url), 'utf8');
await db.exec((await sql('supabase_schema.sql')).replace('create extension if not exists pgcrypto;', ''));
await db.exec(await sql('supabase_mig_rate_limit.sql'));
await db.exec(await sql('supabase_mig_owner_codes.sql'));
const migration = await sql('supabase_mig_ranking_upsert.sql');
await db.exec(migration);
await db.exec(migration); // idempotent
const one = async (q, args = []) => Object.values((await db.query(q, args)).rows[0])[0];
const codeA = await one("select create_owner('browser-a')");
const codeB = await one("select create_owner('browser-b')");
const insert = (client, code, name, total = 10) => one(
  "select insert_ranking_owned($1,$2,$3,$4,1,2,3,1,'{}'::jsonb)", [client,code,name,total]);
const update = (id, code, name) => one(
  "select update_ranking_owned($1,$2,$3,999,1,2,3,1,'{}'::jsonb)", [id,code,name]);
const a = await insert('browser-a', codeA, ' My  Deck ');
assert.equal(await insert('another-device',codeA,'my deck',42), a);
assert.equal(await one('select count(*)::int from rankings'), 1);
assert.equal(await one('select total from rankings where id=$1',[a]), 42);
const b = await insert('browser-b',codeB,'my deck');
assert.notEqual(a,b);
assert.equal(await update(a,codeB,'intruder'), false);
assert.equal(await one('select total from rankings where id=$1',[a]), 42);
await assert.rejects(() => insert('x','invalid','my deck'), /invalid_code/);
await assert.rejects(() => insert('x',codeA,'   '), /invalid_name/);
// Same-name update is allowed immediately, whereas a new name is still rate limited.
assert.equal(await insert('browser-a',codeA,'MY DECK',50),a);
await assert.rejects(() => insert('browser-a',codeA,'different'), /rate_limited/);
const c = await insert('third-device',codeA,'other deck');
await assert.rejects(() => update(c,codeA,'my deck'), /duplicate_owned_name/);
assert.equal(await one('select count(*)::int from rankings'),3);
// API roles cannot read ownership secrets or invoke the private name helper.
await db.exec('set role anon');
await assert.rejects(() => db.query('select * from ranking_owners'), /permission denied/);
await assert.rejects(() => db.query("select _rank_name('x')"), /permission denied/);
assert.equal(await update(a, codeA, 'my deck'),true);
await db.exec('reset role');
assert.equal(await one('select total from rankings where id=$1',[a]),999);
await db.close();
console.log('ranking SQL: idempotence, same-owner upsert, name normalization, ownership, rename and rate limits passed');
