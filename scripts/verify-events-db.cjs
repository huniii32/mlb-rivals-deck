const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createEventTestDb } = require("./event-test-db.cjs");
(async () => {
  const { db, users, rpc } = await createEventTestDb();
  const { alice, bob, admin } = users;
  const call = (name, user, args = {}) =>
    rpc(name, { p_event: "local-pilot", ...args }, user);
  const join = (u) =>
    call("event_join", u, { p_ranking_id: u.rank, p_token: u.token });
  try {
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [alice.id],
    );
    await assert.rejects(() => join(alice), /login_required/);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [alice.id],
    );
    await assert.rejects(
      () =>
        call("event_join", null, {
          p_ranking_id: alice.rank,
          p_token: alice.token,
        }),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        call("event_join", alice, {
          p_ranking_id: alice.rank,
          p_token: "wrong",
        }),
      /ownership_required/,
    );
    await assert.rejects(
      () => call("event_attempt", alice, { p_request_id: randomUUID() }),
      /join_required/,
    );
    let a = await join(alice);
    const aid = a.me.id;
    assert.equal(
      (await join(alice)).me.id,
      aid,
      "registration retry retains participant",
    );
    await assert.rejects(
      () =>
        call("event_join", bob, {
          p_ranking_id: alice.rank,
          p_token: alice.token,
        }),
      /deck_already_used/,
    );
    await assert.rejects(
      () =>
        call("event_join", alice, {
          p_ranking_id: bob.rank,
          p_token: bob.token,
        }),
      /deck_already_bound/,
    );
    const bid = (await join(bob)).me.id;
    const publicState = await call("event_get");
    assert.equal(publicState.me, null);
    assert.ok(!JSON.stringify(publicState).includes(alice.email));
    assert.ok(!JSON.stringify(publicState).includes(alice.token));
    await assert.rejects(
      () => call("event_claim", alice, { p_mission: "skills" }),
      /evidence_required/,
    );
    await assert.rejects(
      () => call("event_admin", alice, { p_action: "close" }),
      /admin_required/,
    );
    const request = randomUUID();
    a = await call("event_attempt", alice, { p_request_id: request });
    assert.equal(a.me.attempts.length, 1);
    assert.deepEqual(
      (await call("event_attempt", alice, { p_request_id: request })).me
        .attempts,
      a.me.attempts,
    );
    await assert.rejects(
      () =>
        call("event_attempt", alice, {
          p_request_id: randomUUID(),
          score: 9999,
        }),
      /invalid_rpc_arguments/,
    );
    const requests = await Promise.allSettled(
      Array.from({ length: 9 }, () =>
        call("event_attempt", alice, { p_request_id: randomUUID() }),
      ),
    );
    assert.equal(
      requests.filter((x) => x.status === "fulfilled").length,
      4,
      "only four remaining chances can commit",
    );
    a = await call("event_get", alice);
    assert.equal(a.me.attempts.length, 5);
    for (const attempt of a.me.attempts) {
      assert.equal(attempt.board.length, 3);
      assert.equal(attempt.board[0].tier, "Gold");
      assert.equal(new Set(attempt.board.map((s) => s.name)).size, 3);
      assert.ok(attempt.board.every((s) => s.level === "S"));
      assert.equal(
        attempt.score,
        Math.round(attempt.board.reduce((n, s) => n + s.score, 0) * 100) / 100,
      );
    }
    await assert.rejects(
      () => call("event_attempt", alice, { p_request_id: randomUUID() }),
      /attempt_limit/,
    );
    await call("event_attempt", bob, { p_request_id: randomUUID() });
    for (const u of [alice, bob]) {
      let s = await call("event_experience", u, { p_mission: "moment" });
      assert.equal(s.me.experiences.moment.preview.length, 5);
      assert.equal(s.me.evidence.moment, undefined);
      assert.equal(
        s.me.experiences.moment.shuffled,
        undefined,
        "hidden mapping never sent to browser",
      );
      await assert.rejects(
        () => call("event_claim", u, { p_mission: "moment" }),
        /evidence_required/,
      );
      s = await call("event_pick_moment", u, { p_slot: 2 });
      const picked = s.me.experiences.moment.result;
      assert.deepEqual(
        (await call("event_pick_moment", u, { p_slot: 4 })).me.experiences
          .moment.result,
        picked,
      );
      await call("event_experience", u, { p_mission: "hof" });
      for (const mission of ["deck", "skills", "moment", "hof"]) {
        await Promise.all(
          [1, 2, 3].map(() => call("event_claim", u, { p_mission: mission })),
        );
      }
      s = await call("event_get", u);
      assert.equal(
        s.tickets.filter((t) => t.participant_id === s.me.id).length,
        4,
      );
    }
    // Pin equal best scores in the isolated DB to verify server achievement ordering.
    await db.query(
      "update sim_event_attempts set score=10 where participant_id=$1",
      [aid],
    );
    await db.query(
      "update sim_event_attempts set score=99,achieved_at='2026-11-07T01:00:00Z' where participant_id=$1 and number=1",
      [aid],
    );
    await db.query(
      "update sim_event_attempts set score=99,achieved_at='2026-11-07T01:01:00Z' where participant_id=$1",
      [bid],
    );
    assert.equal((await call("event_get")).rankings[0].id, aid);
    const closed = await call("event_admin", admin, { p_action: "close" });
    assert.equal(closed.event.champion_id, aid);
    assert.equal(closed.tickets.filter((t) => !t.eligible).length, 4);
    await assert.rejects(() => join(admin), /closed/);
    await assert.rejects(
      () => call("event_attempt", bob, { p_request_id: randomUUID() }),
      /closed/,
    );
    assert.equal(
      (await call("event_attempt", alice, { p_request_id: request })).me
        .attempts.length,
      5,
      "lost response retry remains safe after close",
    );
    const drawn = await call("event_admin", admin, { p_action: "draw" });
    assert.equal(drawn.event.winner_id, bid);
    assert.notEqual(drawn.event.winner_id, drawn.event.champion_id);
    const again = await call("event_admin", admin, { p_action: "draw" });
    assert.deepEqual(
      again.event,
      drawn.event,
      "draw is irreversible and idempotent",
    );
    assert.equal(again.audit.filter((a) => a.action === "draw").length, 1);
    // Scheduling uses the DB clock, even if the caller's browser changes its date.
    await db.exec(
      "insert into sim_events(id,title,rules_id,opens_at,published) values('future','future','coffee-sp-s-v1',now()+interval '1 day',true)",
    );
    await assert.rejects(
      () =>
        rpc(
          "event_join",
          { p_event: "future", p_ranking_id: alice.rank, p_token: alice.token },
          alice,
        ),
      /not_open/,
    );
    await db.exec(
      "update sim_events set opens_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id='future'",
    );
    await assert.rejects(
      () =>
        rpc(
          "event_join",
          { p_event: "future", p_ranking_id: alice.rank, p_token: alice.token },
          alice,
        ),
      /closed/,
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select id,deck_name from rankings")).rows.length,
      3,
      "public ranking remains visible after email login",
    );
    await assert.rejects(
      () => db.query("select client_id from rankings"),
      /permission denied/,
    );
    await db.exec("reset role");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of [
        "sim_events",
        "sim_event_participants",
        "sim_event_attempts",
        "sim_event_evidence",
        "sim_event_experiences",
        "sim_event_tickets",
        "sim_event_admins",
        "sim_event_rules",
      ]) {
        await assert.rejects(
          () => db.query(`select * from ${table}`),
          /permission denied/,
        );
        await assert.rejects(
          () => db.query(`delete from ${table}`),
          /permission denied/,
        );
      }
      await assert.rejects(
        () => db.query("select _event_random()"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec(
      "insert into sim_events(id,title,rules_id,opens_at,published) values('solo','solo','coffee-sp-s-v1',now()-interval '1 day',true)",
    );
    const solo = (name, user, args = {}) =>
      rpc(name, { p_event: "solo", ...args }, user);
    await solo("event_join", alice, {
      p_ranking_id: alice.rank,
      p_token: alice.token,
    });
    await solo("event_attempt", alice, { p_request_id: randomUUID() });
    await solo("event_claim", alice, { p_mission: "deck" });
    await solo("event_admin", admin, { p_action: "close" });
    const noWinner = await solo("event_admin", admin, { p_action: "draw" });
    assert.equal(
      noWinner.event.winner_id,
      null,
      "sole entrant cannot win both prizes",
    );
    assert.equal(
      noWinner.event.phase,
      "drawn",
      "zero-ticket draw is finalized, not repeated",
    );
    // Reapplying migration and frozen rules must preserve attempts and draw outcome.
    await db.exec(
      fs.readFileSync(path.join(__dirname, "supabase_mig_events.sql"), "utf8"),
    );
    await db.exec(
      fs.readFileSync(path.join(__dirname, "event-rules-v1.sql"), "utf8"),
    );
    assert.deepEqual((await call("event_get")).event, drawn.event);
    console.log(
      "Event SQL: verified identity/deck, atomic five attempts, idempotent retry, server scores, evidence, four tickets, earliest tie, close/draw exclusions, scheduling, ACLs and migration replay passed.",
    );
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
