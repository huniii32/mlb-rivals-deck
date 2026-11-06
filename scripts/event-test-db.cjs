const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
const USERS = {
  alice: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "alice@event.test",
    name: "테스트 다저스",
  },
  bob: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "bob@event.test",
    name: "테스트 양키스",
  },
  admin: {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@event.test",
    name: "테스트 운영자",
  },
};
const RPC_ARGS = {
  event_get: ["p_event", "p_ranking_id", "p_token"],
  event_join: ["p_event", "p_ranking_id", "p_token"],
  event_attempt: ["p_event", "p_request_id", "p_ranking_id", "p_token"],
  event_experience: ["p_event", "p_mission", "p_ranking_id", "p_token"],
  event_pick_moment: ["p_event", "p_slot", "p_ranking_id", "p_token"],
  event_claim: ["p_event", "p_mission", "p_ranking_id", "p_token"],
  event_admin: ["p_event", "p_action"],
};
async function createEventTestDb(dataDir) {
  const db = new PGlite({ dataDir, extensions: { pgcrypto } });
  const sql = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
  const initialized = (
    await db.query("select to_regclass('public.sim_events') as name")
  ).rows[0].name;
  if (!initialized) {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const name of [
      "supabase_schema.sql",
      "supabase_mig_rate_limit.sql",
      "supabase_mig_owner_codes.sql",
      "supabase_mig_deck_passwords.sql",
      "supabase_mig_events.sql",
      "event-rules-v1.sql",
    ])
      await db.exec(sql(name));
    for (const [key, u] of Object.entries(USERS)) {
      await db.query("insert into auth.users values($1,$2,now())", [
        u.id,
        u.email,
      ]);
      const deck = {
        id: `event-test-${key}`,
        name: u.name,
        players: Array.from({ length: 18 }, (_, i) => ({
          name: `테스트 선수 ${i + 1}`,
        })),
      };
      const rank = (
        await db.query(
          "insert into rankings(deck_name,total,named,deck_json) values($1,4000,18,$2) returning id",
          [u.name, deck],
        )
      ).rows[0].id;
      await db.query(
        "insert into ranking_password_sessions(ranking_id,token_hash) values($1,public._ranking_hash($2))",
        [rank, `test-token-${key}`],
      );
    }
    await db.query("insert into sim_event_admins values($1)", [USERS.admin.id]);
    await db.exec(
      "insert into sim_events(id,title,rules_id,opens_at,published) values('local-pilot','서버 저장 검증 · 테스트 이벤트','coffee-sp-s-v1',now()-interval '1 day',true)",
    );
  }
  // Reapply additive event updates to an existing local pilot without losing records.
  if (initialized) await db.exec(sql("supabase_mig_events.sql"));
  const users = {};
  for (const [key, u] of Object.entries(USERS)) {
    const rank = (
      await db.query("select id from rankings where deck_name=$1", [u.name])
    ).rows[0].id;
    await db.query(
      "insert into ranking_passwords(ranking_id,password_hash,creation_hash) values($1,public._ranking_password_digest('1234'),$2) on conflict do nothing",
      [rank, `test-creation-${key}`],
    );
    users[key] = { ...u, rank, token: `test-token-${key}` };
  }
  // PGlite shares one connection. Queue each transaction to keep test identities isolated.
  let queue = Promise.resolve();
  function rpc(name, args, user = null) {
    const run = async () => {
      const names = RPC_ARGS[name];
      if (name === "event_get")
        args = { p_ranking_id: null, p_token: null, ...args };
      if (
        !names ||
        Object.keys(args).some((k) => !names.includes(k)) ||
        names.some((k) => !(k in args))
      )
        throw Error("invalid_rpc_arguments");
      await db.exec("begin");
      try {
        await db.exec(`set local role ${user ? "authenticated" : "anon"}`);
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          user?.id || "",
        ]);
        const result = (
          await db.query(
            `select public.${name}(${names.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
            names.map((k) => args[k]),
          )
        ).rows[0].result;
        await db.exec("commit");
        return result;
      } catch (e) {
        await db.exec("rollback");
        throw e;
      }
    };
    const task = queue.then(run);
    queue = task.catch(() => {});
    return task;
  }
  return { db, users, rpc };
}
module.exports = { createEventTestDb, RPC_ARGS };
