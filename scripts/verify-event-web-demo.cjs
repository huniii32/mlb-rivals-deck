const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const target =
  process.env.EVENT_DEMO_URL || "http://localhost:4174/event-demo/";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1366, height: 900 },
    });
    const errors = [],
      external = [];
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (
        u.hostname === "cdn.jsdelivr.net" &&
        u.pathname.startsWith("/gh/orioncactus/pretendard@")
      )
        return r.fulfill({ contentType: "text/css", body: "" });
      if (
        u.origin !== new URL(target).origin ||
        u.pathname.includes("/rest/") ||
        u.pathname.includes("/auth/")
      ) {
        external.push(u.href);
        return r.abort();
      }
      return r.continue();
    });
    let page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(90000);
    await page.goto(target);
    await page.getByText("참여 접수 중", { exact: true }).waitFor();
    const select = (role) =>
      page.getByLabel("체험할 화면", { exact: true }).selectOption(role);
    const ready = () =>
      page.waitForFunction(
        () => !document.querySelector(".event-status-bar button")?.disabled,
      );
    async function challenge(n) {
      await page
        .getByRole("button", { name: "스킬 점수에 도전하기", exact: true })
        .click();
      await page.getByText(`${n} / 5회`, { exact: true }).waitFor();
      await ready();
    }
    async function claimDeck() {
      const card = page.locator(".event-missions article").filter({
        has: page.getByRole("heading", { name: "덱 등록", exact: true }),
      });
      await card
        .getByRole("button", { name: "응모권 1장 받기" })
        .click();
      await card.getByRole("button", { name: "✓ 응모권 받음" }).waitFor();
      await ready();
    }
    await page
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    for (let n = 1; n <= 5; n++) await challenge(n);
    assert.equal(
      await page.getByRole("button", { name: "5회 도전 완료" }).isDisabled(),
      true,
    );
    await claimDeck();
    await page.reload();
    await page.getByText("5 / 5회", { exact: true }).waitFor();
    await page.getByText("내 응모권 1 / 4장", { exact: true }).waitFor();
    await select("bob");
    await page
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    await challenge(1);
    await claimDeck();
    await select("admin");
    await page.locator(".event-admin").waitFor();
    assert.equal(
      await page
        .locator(".event-registration,.event-challenge,.event-missions")
        .count(),
      0,
      "operator does not see participant forms",
    );
    assert.equal(await page.locator(".event-participant-row").count(), 2);
    assert.equal(
      await page.locator(".event-activity-chip[data-state=issued]").count(),
      2,
      await page.locator(".event-admin-participants").innerText(),
    );
    assert.equal(
      await page.locator(".event-activity-chip[data-state=completed]").count(),
      2,
    );
    assert.equal(
      await page.locator(".event-activity-chip[data-state=pending]").count(),
      4,
    );
    await page.getByRole("searchbox", { name: "참가 덱 검색" }).fill("양키스");
    assert.equal(await page.locator(".event-participant-row").count(), 1);
    await page.getByRole("searchbox", { name: "참가 덱 검색" }).fill("");
    for (const width of [320, 390, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `admin overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.screenshot({
      path: "/workspace/artifacts/event-admin-roster.png",
      fullPage: true,
    });
    page.on("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "① 이벤트 마감 · 1위 확정" })
      .click();
    await page.getByText("참여 마감", { exact: true }).waitFor();
    await page.getByRole("button", { name: "② 당첨자 추첨" }).click();
    await page.locator(".event-draw-stage.is-drawing").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "② 당첨자 추첨" }).isDisabled(),
      true,
    );
    assert.equal(
      await page.locator(".event-winners").count(),
      0,
      "hide the result until the reveal finishes",
    );
    await page.screenshot({
      path: "/workspace/artifacts/event-admin-drawing.png",
      fullPage: true,
    });
    await page.getByText("추첨 완료", { exact: true }).waitFor();
    const winners = await page
      .locator(".event-winners strong")
      .allTextContents();
    assert.equal(winners.length, 2);
    assert.notEqual(winners[0], winners[1]);
    assert.equal(await page.locator(".event-draw-stage.is-drawing").count(), 0);
    assert.equal(
      await page.locator(".event-draw-ticket strong").innerText(),
      winners[1],
      "reveal must match the saved raffle winner",
    );
    for (const title of ["점수 1위", "추첨 당첨자"]) {
      const delivery = page.getByRole("button", {
        name: `${title} · 지급 완료 기록`,
        exact: true,
      });
      assert.equal(await delivery.isDisabled(), true);
      await page
        .getByRole("button", {
          name: `${title} · 게임 덱 인증 완료`,
          exact: true,
        })
        .click();
      await ready();
      await delivery.click();
      await ready();
    }
    assert.deepEqual(
      await page
        .locator(".event-winners .event-prize-status")
        .allTextContents(),
      ["지급 완료", "지급 완료"],
    );
    await page.screenshot({
      path: "/workspace/artifacts/event-web-demo-admin.png",
      fullPage: true,
    });
    // A guest can inspect results but cannot operate or impersonate a participant.
    await select("guest");
    await page.getByText("추첨 완료", { exact: true }).waitFor();
    assert.equal(await page.locator(".event-admin").count(), 0);
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow ${width}`,
      );
    }
    await page.getByRole("button", { name: "다크 모드", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/workspace/artifacts/event-web-demo-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "데모 초기화", exact: true })
      .click();
    await page.getByText("참여 접수 중", { exact: true }).waitFor();
    assert.equal(await page.locator(".event-rankings li").count(), 0);
    assert.equal(
      await page.getByLabel("체험할 화면", { exact: true }).inputValue(),
      "alice",
    );
    // An entrant with no skill attempts still appears in the operator roster.
    await page
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    await claimDeck();
    await select("admin");
    await page.locator(".event-admin").waitFor();
    assert.equal(await page.locator(".event-participant-row").count(), 1);
    assert.equal(
      await page
        .locator(".event-participant-row")
        .getByText("미도전", { exact: true })
        .count(),
      1,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "① 이벤트 마감 · 1위 확정" })
      .click();
    await page.getByText("참여 마감", { exact: true }).waitFor();
    await page.getByRole("button", { name: "② 당첨자 추첨" }).click();
    await page.getByText("추첨 완료", { exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".event-draw-ticket")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    const savedWinner = await page
      .locator(".event-draw-ticket strong")
      .innerText();
    await page.reload();
    await page.getByText("추첨 완료", { exact: true }).waitFor();
    await select("admin");
    await page.locator(".event-admin").waitFor();
    assert.equal(
      await page.locator(".event-draw-ticket strong").innerText(),
      savedWinner,
    );
    assert.equal(await page.locator(".event-draw-stage.is-drawing").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "② 당첨자 추첨" }).isDisabled(),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "다크 모드", exact: true }).click();
    await page.screenshot({
      path: "/workspace/artifacts/event-admin-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      `Web demo passed: ${target}; anonymous entry, five attempts, reload, two winners, verification/delivery, guest isolation, reset, 320–1366px, zero live API calls.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
