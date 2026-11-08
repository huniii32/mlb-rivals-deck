const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { createEventTestDb } = require("./event-test-db.cjs");
(async () => {
  const { db, users, rpc } = await createEventTestDb();
  try {
    const password = randomBytes(32).toString("hex");
    await db.query("insert into sim_event_operator_credentials values($1,public._ranking_hash($2))", [users.admin.id, password]);
    for (const p_password of [null, "wrong", "b".repeat(64)])
      await assert.rejects(rpc("event_operator_login", { p_password }), /event_invalid_credentials/);
    const login = await rpc("event_operator_login", { p_password: password });
    assert.match(login.token, /^[a-f0-9]{64}$/);
    assert.notEqual(login.token, password);
    const args = { p_session: login.token, p_event: "local-pilot" };
    const data = await rpc("event_operator_get", args);
    assert.equal(data.is_admin, true);
    await rpc("event_operator_action", { ...args, p_action: "unpublish" });
    await assert.rejects(rpc("event_get", { p_event: "local-pilot" }), /event_private/);
    await assert.rejects(rpc("event_operator_get", { ...args, p_session: "f".repeat(64) }), /session_expired/);
    await assert.rejects(rpc("event_operator_action", { ...args, p_session: "f".repeat(64), p_action: "publish" }), /session_expired/);
    await assert.rejects(rpc("event_admin", { p_event: "local-pilot", p_action: "publish" }), /permission denied/);
    await rpc("event_operator_action", { ...args, p_action: "publish" });
    const publicState = await rpc("event_get", { p_event: "local-pilot" });
    assert.equal(publicState.is_admin, false, "operator identity never leaks to next transaction");
    assert.deepEqual(publicState.participants, []);
    assert.deepEqual(publicState.verification_decks, []);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`begin; set local role ${role}`);
      try {
        await assert.rejects(db.query("select * from sim_event_operator_credentials"), /permission denied/);
      } finally { await db.exec("rollback"); }
      await db.exec(`begin; set local role ${role}`);
      try { await assert.rejects(db.query("select * from sim_event_operator_sessions"), /permission denied/); }
      finally { await db.exec("rollback"); }
      await db.exec(`begin; set local role ${role}`);
      try { await assert.rejects(db.query("select public._event_operator_auth($1)", [login.token]), /permission denied/); }
      finally { await db.exec("rollback"); }
    }
    await rpc("event_operator_logout", { p_session: login.token });
    await assert.rejects(rpc("event_operator_get", args), /session_expired/);
    const next = await rpc("event_operator_login", { p_password: password });
    await db.exec("update sim_event_operator_sessions set expires_at=now()-interval '1 minute'");
    await assert.rejects(rpc("event_operator_action", { ...args, p_session: next.token, p_action: "close" }), /session_expired/);
    const revoked = await rpc("event_operator_login", { p_password: password });
    await db.query("delete from sim_event_admins where user_id=$1", [users.admin.id]);
    await assert.rejects(rpc("event_operator_get", { ...args, p_session: revoked.token }), /session_expired/);
    await assert.rejects(rpc("event_operator_login", { p_password: password }), /invalid_credentials/);
    console.log("Operator SQL: wrong password, authenticated wrapper, anonymous denial, private data ACLs, logout/replay, expiry and revocation passed.");
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
