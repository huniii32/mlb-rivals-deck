// Full browser -> HTTP -> persistent PostgreSQL (PGlite) -> browser verification.
// Fake Auth is local only; no live Supabase requests or real emails are sent.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rivals-event-e2e-"));
let origin, webPort, apiPort;
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
let server, browser;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function start() {
  server = spawn(
    process.execPath,
    [path.join(__dirname, "event-pilot-server.cjs")],
    {
      env: {
        ...process.env,
        EVENT_PILOT_DIR: path.join(tmp, "db"),
        EVENT_PILOT_PORT: String(apiPort),
        EVENT_PILOT_WEB_PORT: String(webPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (x) =>
    fs.appendFileSync(path.join(tmp, "server.log"), x),
  );
  server.stderr.on("data", (x) =>
    fs.appendFileSync(path.join(tmp, "server.log"), x),
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/demo/event-pilot.html")).ok) return;
    } catch {}
    await delay(200);
  }
  throw Error(
    "pilot server did not start: " +
      fs.readFileSync(path.join(tmp, "server.log"), "utf8"),
  );
}
async function stop() {
  if (server && server.exitCode === null) {
    const done = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await done;
  }
}
(async () => {
  const errors = [],
    unexpected = [];
  try {
    webPort = await freePort();
    apiPort = await freePort();
    origin = `http://localhost:${webPort}`;
    await start();
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    async function context() {
      const c = await browser.newContext({
        viewport: { width: 1366, height: 900 },
      });
      await c.route("**/*", (r) => {
        const u = new URL(r.request().url());
        if (
          u.hostname === "cdn.jsdelivr.net" &&
          u.pathname.startsWith("/gh/orioncactus/pretendard@")
        )
          return r.fulfill({ contentType: "text/css", body: "" });
        if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
          unexpected.push(u.origin);
          return r.abort();
        }
        if (
          u.pathname.includes("/rest/v1/rpc/") &&
          !u.pathname.includes("/rpc/event_")
        )
          unexpected.push(u.pathname);
        return r.continue();
      });
      await c.routeWebSocket("**/realtime/**", (s) => s.close());
      return c;
    }
    async function login(name) {
      const c = await context(),
        p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(origin + "/demo/event-pilot.html");
      await p.getByRole("button", { name: `테스트 ${name}로 시작` }).click();
      await p.getByText("참여 접수 중", { exact: true }).waitFor();
      if (name !== "운영자") {
        assert.equal(
          await p.evaluate(() =>
            Object.keys(localStorage).some((k) => k.endsWith("-auth-token")),
          ),
          false,
          "participant has no email Auth session",
        );
        assert.equal(
          await p.locator(".event-registration input[type=email]").count(),
          0,
        );
      }
      return p;
    }
    async function attempt(p, n) {
      await p
        .getByRole("button", { name: "스킬 점수에 도전하기", exact: true })
        .click();
      await p.getByText(`${n} / 5회`, { exact: true }).waitFor();
      await p.waitForFunction(
        () => !document.querySelector(".event-status-bar button").disabled,
      );
    }
    async function earn(p) {
      await p.getByRole("button", { name: "조합 후보 5장 확인" }).click();
      await p.locator(".event-candidates").waitFor();
      const candidates = await p.locator(".event-candidates").innerText();
      await p.reload();
      await p.locator(".event-candidates").waitFor();
      assert.equal(
        await p.locator(".event-candidates").innerText(),
        candidates,
      );
      await p.getByRole("button", { name: "카드 뒤집고 섞기" }).click();
      await p.getByLabel("조합 카드 3 선택", { exact: true }).click();
      await p
        .locator(".event-experience")
        .first()
        .locator(".event-player-result")
        .waitFor();
      await p.getByRole("button", { name: "HOF 1회 영입 체험" }).click();
      await p.getByText("일반 HOF 영입 체험 결과", { exact: true }).waitFor();
      for (const mission of [
        "덱 등록",
        "스킬 시뮬레이터",
        "슈프림 모먼트 조합",
        "일반 HOF 영입",
      ]) {
        const card = p.locator(".event-missions article").filter({
          has: p.getByRole("heading", { name: mission, exact: true }),
        });
        await card
          .getByRole("button", { name: "이벤트 참여하기 · 응모권 받기" })
          .click();
        await card.getByRole("button", { name: "✓ 응모권 받음" }).waitFor();
        await p.waitForFunction(
          () => !document.querySelector(".event-status-bar button").disabled,
        );
      }
      await p.getByText("내 응모권 4 / 4장", { exact: true }).waitFor();
    }
    const alice = await login("다저스");
    await alice
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    await attempt(alice, 1);
    // Commit on server, then lose the response in transit. Reload must show one committed result.
    await alice.route(
      "**/rest/v1/rpc/event_attempt",
      async (r) => {
        await r.fetch();
        await r.abort("failed");
      },
      { times: 1 },
    );
    await alice
      .getByRole("button", { name: "스킬 점수에 도전하기", exact: true })
      .click();
    await alice.locator(".event-error").waitFor();
    await alice.reload();
    await alice.getByText("2 / 5회", { exact: true }).waitFor();
    for (let n = 3; n <= 5; n++) await attempt(alice, n);
    assert.equal(
      await alice.getByRole("button", { name: "5회 도전 완료" }).isDisabled(),
      true,
    );
    await earn(alice);
    const restored = await login("다저스");
    await restored.getByText("5 / 5회", { exact: true }).waitFor();
    assert.equal(
      await restored
        .getByRole("button", { name: "5회 도전 완료" })
        .isDisabled(),
      true,
      "fresh browser with the same deck retains attempts",
    );
    await restored.context().close();
    const bob = await login("양키스");
    await bob
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    await attempt(bob, 1);
    await earn(bob);
    const admin = await login("운영자");
    await admin.locator(".event-admin").waitFor();
    admin.on("dialog", (d) => d.accept());
    await admin
      .getByRole("button", { name: "① 이벤트 마감 · 1위 확정" })
      .click();
    await admin.getByText("참여 마감", { exact: true }).waitFor();
    await admin.getByRole("button", { name: "② 당첨자 추첨" }).click();
    await admin.getByText("추첨 완료", { exact: true }).waitFor();
    const winners = await admin
      .locator(".event-winners strong")
      .allTextContents();
    assert.notEqual(winners[0], winners[1]);
    assert.ok(
      winners.every((x) => ["테스트 다저스", "테스트 양키스"].includes(x)),
    );
    assert.equal(
      await admin.getByRole("button", { name: "② 당첨자 추첨" }).isDisabled(),
      true,
    );
    assert.equal(
      await admin
        .locator(".event-winners .event-prize-status")
        .filter({ hasText: "게임 덱 인증 대기" })
        .count(),
      2,
    );
    for (const title of ["점수 1위", "추첨 당첨자"]) {
      const delivery = admin.getByRole("button", {
        name: `${title} · 지급 완료 기록`,
        exact: true,
      });
      assert.equal(
        await delivery.isDisabled(),
        true,
        "cannot mark delivery before verification",
      );
      await admin
        .getByRole("button", {
          name: `${title} · 게임 덱 인증 완료`,
          exact: true,
        })
        .click();
      await admin.waitForFunction(
        (label) =>
          Array.from(document.querySelectorAll("button")).some(
            (b) => b.textContent === label && !b.disabled,
          ),
        `${title} · 지급 완료 기록`,
      );
      await delivery.click();
      await admin.waitForFunction(
        (label) =>
          Array.from(document.querySelectorAll("button")).some(
            (b) => b.textContent === label && b.disabled,
          ) && !document.querySelector(".event-status-bar button").disabled,
        `${title} · 지급 완료 기록`,
      );
    }
    assert.deepEqual(
      await admin
        .locator(".event-winners .event-prize-status")
        .allTextContents(),
      ["지급 완료", "지급 완료"],
    );
    await alice.reload();
    await alice.getByText("추첨 완료", { exact: true }).waitFor();
    assert.equal(
      await alice.getByRole("button", { name: "5회 도전 완료" }).isDisabled(),
      true,
    );
    const guest = await (await context()).newPage();
    await guest.goto(origin + "/?event=1#simulator");
    await guest.getByText("추첨 완료", { exact: true }).waitFor();
    assert.equal(await guest.locator(".event-admin").count(), 0);
    assert.ok(
      !(await guest.locator(".event-page").innerText()).includes("@event.test"),
    );
    // Exercise the actual URL-token callback path used by an email login link.
    const authResponse = await fetch(
      `http://localhost:${apiPort}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@event.test",
          password: "test-only",
        }),
      },
    );
    const auth = await authResponse.json();
    const callback = await (await context()).newPage();
    const hash = new URLSearchParams({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      token_type: "bearer",
      expires_in: "3600",
      type: "magiclink",
    });
    await callback.goto(origin + "/?event=1#" + hash.toString());
    await callback.locator(".event-admin").waitFor();
    assert.equal(
      await callback.locator(".event-admin").count(),
      1,
      "operator email callback lands on event management",
    );
    for (const width of [320, 390, 768, 1366, 1920]) {
      await alice.setViewportSize({ width, height: 900 });
      assert.equal(
        await alice.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow at ${width}`,
      );
    }
    await alice.setViewportSize({ width: 1366, height: 900 });
    await alice.screenshot({
      path: "/workspace/artifacts/event-pilot-complete.png",
      fullPage: true,
    });
    await alice
      .getByRole("button", { name: "다크 모드로 전환", exact: true })
      .click();
    await alice.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await alice.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await alice.screenshot({
      path: "/workspace/artifacts/event-pilot-dark-mobile.png",
      fullPage: true,
    });
    // Stop and restart the HTTP/DB process; records must survive independently of the browser.
    const savedBrowser = alice.context();
    await alice.close();
    await stop();
    await start();
    const resumed = await savedBrowser.newPage();
    resumed.on("pageerror", (e) => errors.push(e.message));
    await resumed.goto(origin + "/?event=1#simulator");
    await resumed.getByText("추첨 완료", { exact: true }).waitFor();
    assert.deepEqual(
      await resumed.locator(".event-winners strong").allTextContents(),
      winners,
    );
    assert.equal(
      await resumed.getByRole("button", { name: "5회 도전 완료" }).isDisabled(),
      true,
    );
    assert.deepEqual(
      await resumed
        .locator(".event-winners .event-prize-status")
        .allTextContents(),
      ["지급 완료", "지급 완료"],
      "delivery records survive a server restart",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "Event browser: anonymous deck-password registration, cross-device restoration, five attempts, lost-response recovery, four tickets each, hidden-card persistence, two distinct winners, winner verification and delivery, admin isolation, 320–1920px layout, DB process restart passed. No live calls.",
    );
  } finally {
    await browser?.close();
    await stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
