// Local-only test service. Executes the same SQL RPCs against persistent PGlite.
// This file and its fake Auth provider are never part of the deployed website.
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createEventTestDb } = require("./event-test-db.cjs");
const PORT = Number(process.env.EVENT_PILOT_PORT || 8789);
const WEB_PORT = Number(process.env.EVENT_PILOT_WEB_PORT || 5180);
const SECRET = "local-event-pilot-only-not-a-production-key";
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const sign = (v) =>
  crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
(async () => {
  const { db, users, rpc } = await createEventTestDb(
    process.env.EVENT_PILOT_DIR || path.resolve(".event-pilot"),
  );
  // Test-only generated-format credential; never bundled into production.
  await db.query("insert into sim_event_operator_credentials values($1,public._ranking_hash($2)) on conflict(user_id) do nothing", [users.admin.id, "a".repeat(64)]);
  const authUser = (u) => ({
    id: u.id,
    email: u.email,
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: "2026-11-01T00:00:00Z",
    confirmed_at: "2026-11-01T00:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
  });
  const token = (u) => {
    const raw =
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        sub: u.id,
        email: u.email,
        role: "authenticated",
        aud: "authenticated",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    return raw + "." + sign(raw);
  };
  const identity = (req) => {
    try {
      const jwt = (req.headers.authorization || "").replace(/^Bearer /, "");
      const parts = jwt.split(".");
      if (parts.length !== 3 || sign(parts[0] + "." + parts[1]) !== parts[2])
        return null;
      const data = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return data.exp > Date.now() / 1000
        ? Object.values(users).find((u) => u.id === data.sub) || null
        : null;
    } catch {
      return null;
    }
  };
  const body = async (req) => {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 32768) throw Error("body_too_large");
    }
    return text ? JSON.parse(text) : {};
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (
      origin &&
      !new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${WEB_PORT}$`).test(
        origin,
      )
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin || `http://localhost:${WEB_PORT}`,
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`),
        u = identity(req);
      if (url.pathname === "/pilot/config") {
        send(200, { users });
        return;
      }
      if (url.pathname === "/auth/v1/token") {
        const input = await body(req);
        const key = Object.keys(users).find(
          (k) =>
            (input.email === users[k].email &&
              input.password === "test-only") ||
            input.refresh_token === `pilot-refresh-${k}`,
        );
        if (!key) {
          send(400, { msg: "invalid test login" });
          return;
        }
        send(200, {
          access_token: token(users[key]),
          refresh_token: `pilot-refresh-${key}`,
          token_type: "bearer",
          expires_in: 3600,
          user: authUser(users[key]),
        });
        return;
      }
      if (url.pathname === "/auth/v1/user") {
        send(u ? 200 : 401, u ? authUser(u) : { msg: "invalid token" });
        return;
      }
      if (url.pathname === "/auth/v1/logout") {
        send(200, {});
        return;
      }
      if (url.pathname === "/auth/v1/otp") {
        send(400, {
          msg: "Use the local pilot account selector; no real email is sent.",
        });
        return;
      }
      if (url.pathname.startsWith("/rest/v1/rpc/event_")) {
        const name = url.pathname.split("/").pop();
        send(200, await rpc(name, await body(req), u));
        return;
      }
      if (url.pathname === "/rest/v1/rankings") {
        send(
          200,
          (
            await db.query(
              "select id,deck_name,total,sp,rp,bt,named,deck_json,created_at from rankings order by total desc",
            )
          ).rows,
        );
        return;
      }
      // The pilot deliberately exposes no non-event mutations or real-time channel.
      if (url.pathname.startsWith("/rest/v1/")) {
        send(403, { message: "pilot_event_only" });
        return;
      }
      send(404, { message: "not_found" });
    } catch (e) {
      send(400, { message: e.message, code: e.code || "P0001" });
    }
  });
  server.listen(PORT, "127.0.0.1", () =>
    console.log(`Local event SQL service: http://localhost:${PORT}`),
  );
  const web = spawn(
    process.execPath,
    [
      path.resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(WEB_PORT),
      "--strictPort",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_SUPABASE_URL: `http://localhost:${PORT}`,
        VITE_SUPABASE_ANON_KEY: "local-event-public-key",
        VITE_EVENT_ID: "local-pilot",
        VITE_EVENT_PILOT: "1",
      },
    },
  );
  console.log(
    `Event pilot: http://localhost:${WEB_PORT}/demo/event-pilot.html (fake identities, no real prizes)`,
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    web.kill();
    server.close();
    await db.close();
    process.exit();
  }
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  web.on("exit", () => void stop());
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
