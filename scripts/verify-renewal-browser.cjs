/** Integration smoke test. Requires a running Vite app and Playwright/Chromium.
 * Every backend request is intercepted; no public ranking is changed.
 * RENEWAL_URL=http://localhost:5176 node scripts/verify-renewal-browser.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "renewal-browser-"));
esbuild.buildSync({
  stdin: {
    contents:
      'export * from "./src/lib/deck"; export * from "./src/lib/engine";',
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(temp, "model.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});
const {
  LINEUP,
  blankPlayer,
  normalizeDeck,
  resizeBullpen,
  deckPlayerResults,
  calcDeckTotal,
} = require(path.join(temp, "model.cjs"));
const tables = { customs: [], overrides: {} };
const source = normalizeDeck({
  id: "source-deck",
  name: "복원 검증 덱",
  updatedAt: 1,
  players: resizeBullpen(
    resizeBullpen(
      LINEUP.map((l) => blankPlayer(l.row, l.kind, l.pos, l.order)),
      "winning",
      3,
    ),
    "chasing",
    2,
  ).map((p, i) => ({
    ...p,
    name: `검증선수${i + 1}`,
    card:
      i === 8
        ? "WBC 시그니처"
        : i === 1
          ? "명예의 전당"
          : i < 9
            ? "시그니처 블랙"
            : "시그니처",
    team: "LAD",
    year: 2024,
    enhLv: 9,
    transLv: 3,
    pohLv: 5,
    base: [101, 103, 107],
    train: [9, 8, 7],
    spec: [3, 4, 5],
    extra: [1, 2, 3],
    synergy: [3, 2, 1],
    locker: [2, 1, 2],
    leaderBonus: [1, 1, 1],
    blackPos: [3, 2, 1],
    blackBoost: [1, 2, 3],
    finalOv: i === 0 ? [175, 181, 169] : ["", "", ""],
    skills:
      i < 9
        ? ["[S0] 배팅 머신 (-)", "[S1] 노림수 (-)", "[S2] 도전자 (-)", ""]
        : [
            "[S0] 더블 스토퍼 (-)",
            "[S1] 도전자 (-)",
            "[S2] 라스트 카운트 (-)",
            "",
          ],
  })),
  flags: { "10-team-L": true },
  yearInputs: { 33: 2020 },
  chem: {
    commander: "X",
    catcher: "X",
    pitchChem: "X",
    batChem: "X",
    wbcP: "X",
    wbcB: "X",
    comebackFlag: "X",
    lockdown: "X",
  },
  bullpenTactics: { winning: "division", chasing: "aggressive" },
});
let rows = Array.from({ length: 8 }, (_, i) => ({
  id: `rank-${i}`,
  deck_name: i === 0 ? source.name : `검색용 덱 ${i}`,
  deck_json: source,
  total: 5000 - i * 100,
  named: 21,
  sp: 4800,
  rp: 4700,
  bt: 4900,
  created_at: "2026-11-06T00:00:00Z",
}));
const calls = [],
  errors = [];
let passed = 0;
const check = (label, condition) => {
  assert.ok(condition, label);
  passed++;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseURL = process.env.RENEWAL_URL || "http://localhost:5176";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      ignoreHTTPSErrors: true,
    });
    await context.route("**/rest/v1/**", async (route) => {
      const req = route.request(),
        endpoint = new URL(req.url()).pathname.split("/").pop();
      let data = [];
      if (endpoint === "rankings") data = rows;
      else {
        const args = req.postDataJSON();
        calls.push({ endpoint, args });
        if (endpoint === "restore_ranking_password")
          data =
            args.p_password === "0123"
              ? { id: args.p_id, token: "test-only-session", deck: source }
              : { error: "invalid_password" };
        else if (endpoint === "update_ranking_password") data = true;
        else if (endpoint === "save_ranking_password")
          data = { id: "new-rank", token: "test-new-session" };
        else throw Error(`Unexpected write: ${endpoint}`);
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    // No live subscription is needed during the deterministic request test.
    await context.routeWebSocket("**/realtime/**", (socket) => socket.close());
    const p = await context.newPage();
    await p.clock.setFixedTime(new Date("2026-11-06T12:00:00Z"));
    p.on("pageerror", (e) => errors.push(e.message));
    const local = () =>
      p.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("rivals-decks-v1"));
        return s.decks.find((d) => d.id === s.activeId);
      });
    const nav = (name) =>
      p
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("button", { name, exact: true })
        .click();
    await p.goto(baseURL);
    await p.locator(".stadium-board").waitFor();
    if (process.env.RENEWAL_EXPECT_PREVIEW !== undefined) {
      check("preview notice matches deployment context", await p.locator('.preview-strip').count() === Number(process.env.RENEWAL_EXPECT_PREVIEW));
    }
    await p.getByRole("button", { name: "라이트 모드로 전환" }).click();
    await nav("덱랭킹");
    await p.locator(".ranking-deck-toggle").first().waitFor();
    check(
      "top five ranking rows",
      (await p.locator(".ranking-deck-toggle").count()) === 5,
    );
    await p.getByRole("button", { name: "전체 랭킹보기", exact: true }).click();
    check(
      "all ranking rows",
      (await p.locator(".ranking-deck-toggle").count()) === 8,
    );
    await p.getByLabel("덱 이름 검색").fill("검색용덱7");
    check(
      "search keeps original rank",
      (await p.locator(".ranking-number").innerText()) === "8",
    );
    await p.getByLabel("덱 이름 검색").fill("");
    await p.getByRole("button", { name: `${source.name} 덱 메뉴` }).click();
    await p.getByRole("button", { name: "라인업 보기", exact: true }).click();
    check("read-only preview uses saved score flags without default bonuses", (await p.locator('.modal-box .sb-total b').innerText()) === calcDeckTotal(source, tables).total.toFixed(1));
    check("preview retains all special deck score options", await p.locator('.modal-box tr').filter({has: p.locator('td b', {hasText:/^615$/})}).count() === 1);
    await p.getByRole("button", { name: "닫기 ✕", exact: true }).click();
    await p.getByRole("button", { name: "현재 덱과 비교", exact: true }).click();
    check("deck comparison remains available after legacy file cleanup", await p.locator('.compare-cols .stadium').count() === 2);
    await p.getByRole("button", { name: "닫기 ✕", exact: true }).click();
    await p.getByRole("button", { name: "비밀번호로 가져오기" }).click();
    await p.getByLabel("가져올 덱 비밀번호").fill("9999");
    await p.getByRole("button", { name: "덱 가져오기", exact: true }).click();
    await p.getByRole("alert").waitFor();
    check(
      "wrong PIN leaves restore dialog open",
      await p.getByRole("dialog", { name: "랭킹 덱 가져오기" }).isVisible(),
    );
    await p.getByLabel("가져올 덱 비밀번호").fill("0123");
    await p.getByRole("button", { name: "덱 가져오기", exact: true }).click();
    await p.locator(".stadium-board").waitFor();
    await sleep(250);
    const restored = await local();
    for (const key of [
      "players",
      "flags",
      "yearInputs",
      "chem",
      "bullpenTactics",
    ]) {
      assert.deepEqual(restored[key], source[key], key);
      passed++;
    }
    check(
      "restore does not write back an unedited deck",
      calls.every((c) => c.endpoint === "restore_ranking_password"),
    );
    const ownRow = rows.shift();
    rows.push({ ...ownRow, total: 4100 });
    await nav("덱랭킹");
    await p.getByTestId("my-rank").waitFor();
    check(
      "own rank remains visible outside top five",
      (await p.getByTestId("my-rank").innerText()) === "8위",
    );
    check(
      "public list still starts at first place",
      (await p.locator(".ranking-number").first().innerText()) === "1",
    );
    check(
      "own rank is above public list",
      await p
        .locator(".ranking-mine")
        .evaluate(
          (el) =>
            el.getBoundingClientRect().bottom <
            document.querySelector(".ranking-table").getBoundingClientRect()
              .top,
        ),
    );
    await p.getByLabel("덱 이름 검색").fill("검색용덱1");
    check(
      "search does not change own overall rank",
      (await p.getByTestId("my-rank").innerText()) === "8위",
    );
    await p.getByLabel("덱 이름 검색").fill("");
    await p.getByRole("button", { name: "5등까지 보기", exact: true }).click();
    for (const width of [1440, 390, 320]) {
      await p.setViewportSize({ width, height: 1000 });
      check(
        `own rank fits ${width}px`,
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await p.setViewportSize({ width: 1440, height: 1050 });
    if (process.env.RENEWAL_SCREENSHOTS) {
      fs.mkdirSync(process.env.RENEWAL_SCREENSHOTS, { recursive: true });
      await p.screenshot({
        path: path.join(process.env.RENEWAL_SCREENSHOTS, "my-ranking.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
    await nav("내 라인업");
    await p.locator(".field-player button").first().click();
    const editor = p.getByRole("dialog", { name: "선수 편집" });
    await editor.waitFor();
    check(
      "enhancement restored in editor",
      (await editor.getByLabel("강화 Lv", { exact: true }).inputValue()) ===
        "9",
    );
    check(
      "transcend restored in editor",
      (await editor.getByLabel("초월 Lv", { exact: true }).inputValue()) ===
        "3",
    );
    check(
      "training restored in editor",
      (await editor.getByLabel("파워 훈련", { exact: true }).inputValue()) ===
        "9",
    );
    assert.deepEqual(
      await editor
        .locator(".sk-combo input")
        .evaluateAll((els) => els.map((e) => e.value)),
      source.players[0].skills,
    );
    passed++;
    const before = deckPlayerResults(source, tables)[0];
    await editor.getByLabel("강화 Lv", { exact: true }).fill("10");
    await sleep(200);
    let current = await local();
    const next = deckPlayerResults(
      {
        ...source,
        players: source.players.map((v, i) =>
          i === 0 ? { ...v, enhLv: 10 } : v,
        ),
      },
      tables,
    )[0];
    assert.deepEqual(
      current.players[0].finalOv,
      source.players[0].finalOv.map(
        (v, i) => v + next.auto[i] - before.auto[i],
      ),
    );
    passed++;
    await editor.getByLabel("파워 훈련", { exact: true }).fill("12");
    await sleep(200);
    current = await local();
    check(
      "training redistribution adds its delta to final",
      current.players[0].finalOv[0] ===
        source.players[0].finalOv[0] + next.auto[0] - before.auto[0] + 3,
    );
    check(
      "owner edit syncs same ranking and token",
      calls.some(
        (c) =>
          c.endpoint === "update_ranking_password" &&
          c.args.p_id === "rank-0" &&
          c.args.p_token === "test-only-session" &&
          c.args.p_deck.players[0].train[0] === 12,
      ),
    );
    await editor.getByRole("button", { name: "닫기", exact: true }).click();
    await p.reload();
    await p.locator(".stadium-board").waitFor();
    assert.deepEqual((await local()).players, current.players);
    passed++;
    await p.getByRole("button", { name: /덱스코어 선택/ }).click();
    await p.getByLabel("팀 덱스코어 200 좌", { exact: true }).click();
    await p.getByRole("button", { name: "설정 완료", exact: true }).click();
    const flagOff = await local();
    check(
      "deck score toggles real stored flags",
      flagOff.flags["10-team-L"] === false,
    );
    check(
      "deck score adjusts manual stats",
      flagOff.players[0].finalOv[0] === current.players[0].finalOv[0] - 3,
    );
    await p.getByRole("button", { name: /팀 버프 적용/ }).click();
    const chemSelect = p.locator("dialog select").first();
    const chemOption = await chemSelect
      .locator("option")
      .evaluateAll((els) => els.find((e) => e.value !== "X").value);
    await chemSelect.selectOption(chemOption);
    await p.getByRole("button", { name: "설정 완료" }).click();
    check("team buff persisted", (await local()).chem.commander === chemOption);
    await p.getByRole("button", { name: /투수 전술 승리조/ }).click();
    await p.getByLabel("승리조 전술", { exact: true }).selectOption("basic");
    await p.getByRole("button", { name: "설정 완료" }).click();
    check(
      "pitching tactics persisted",
      (await local()).bullpenTactics.winning === "basic",
    );
    // Regression: a saved year alone never applies 615/645 to both groups.
    const beforeDecade = await local();
    await p.getByRole("button", { name: /덱스코어 선택/ }).click();
    await p.getByRole("tab", { name: "스페셜 덱 스코어", exact: true }).click();
    await p.getByLabel("스페셜 덱스코어 615 우", { exact: true }).click();
    await p.getByLabel("스페셜 덱스코어 645 기준 연도", { exact: true }).fill("2020");
    await p.getByLabel("스페셜 덱스코어 645 우", { exact: true }).click();
    await sleep(200);
    const pitcherDecade = await local();
    const oldDecadeResults = deckPlayerResults(beforeDecade, tables);
    const pitcherDecadeResults = deckPlayerResults(pitcherDecade, tables);
    assert.deepEqual(pitcherDecadeResults.map((r,i)=>r.deck.map((v,k)=>v-oldDecadeResults[i].deck[k])), source.players.map(v=>v.kind==='pitcher'?[1,1,0]:[0,0,0])); passed++;
    assert.deepEqual(pitcherDecade.players[0].finalOv, beforeDecade.players[0].finalOv); passed++;
    await p.getByLabel("스페셜 덱스코어 615 좌", { exact: true }).click();
    await sleep(200);
    const batterDecade = await local();
    assert.deepEqual(batterDecade.players[0].finalOv, beforeDecade.players[0].finalOv.map((v,i)=>v+(i>0?1:0))); passed++;
    check("615 target switch clears the other group", !batterDecade.flags['33-spec-R'] && batterDecade.flags['33-spec-L']);
    check("decade selection shows matching stats", (await p.locator('.deckscore-target-status').first().innerText()).includes('정확·선구 +1'));
    for (const width of [320,390,900]) {
      await p.setViewportSize({width,height:1000});
      check(`deck score target controls fit ${width}`, await p.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
    }
    await p.setViewportSize({width:1440,height:1050});
    await p.getByRole("button", { name: "설정 완료" }).click();
    await p.reload(); await p.locator(".stadium-board").waitFor();
    assert.deepEqual((await local()).flags, batterDecade.flags); passed++;

    // Exercise every bullpen editor, including slots 31-33, through the real UI.
    await p.locator('.roster-tabs button').filter({hasText:'불펜'}).click();
    const training16 = {winning:[4,4], chasing:[5,4], long:[4,4], closer:[4,4]};
    const trainedPlayers = (await local()).players.slice(14);
    for (const player of trainedPlayers) {
      await p.getByRole('button', {name:new RegExp(` ${player.name}$`)}).click();
      const dialog = p.getByRole('dialog', {name:'선수 편집'});
      await dialog.getByLabel('포지션훈련 Lv', {exact:true}).fill('');
      const baselineStats = (await dialog.locator('[data-final-stat]').allTextContents()).map(Number);
      await dialog.getByLabel('포지션훈련 Lv', {exact:true}).fill('16');
      const targetStats = training16[player.bullpenRole];
      assert.deepEqual((await dialog.locator('[data-final-stat]').allTextContents()).map((v,i)=>Number(v)-baselineStats[i]), targetStats); passed++;
      check(`position training persists for row ${player.excelRow}`, (await local()).players.find(v=>v.excelRow===player.excelRow).pohLv===16);
      check(`training feedback for row ${player.excelRow}`, (await dialog.getByLabel('포지션훈련 적용량').innerText()).includes(`변화 +${targetStats[0]} / 구위 +${targetStats[1]}`));
      await dialog.getByRole('button', {name:'닫기', exact:true}).click();
      check(`training changes deck total for row ${player.excelRow}`, (await p.getByTestId('deck-total').innerText()).replace(/[^\d.]/g,'')===calcDeckTotal(await local(),tables).total.toFixed(1));
    }
    const extra = trainedPlayers.find(v=>v.excelRow===31);
    await p.getByRole('button', {name:new RegExp(` ${extra.name}$`)}).click();
    const reliefEditor = p.getByRole('dialog', {name:'선수 편집'});
    await reliefEditor.locator('.manual-values summary').click();
    await reliefEditor.getByLabel('변화 최종(전술 전)',{exact:true}).fill('150');
    await reliefEditor.getByLabel('구위 최종(전술 전)',{exact:true}).fill('160');
    await reliefEditor.getByLabel('포지션훈련 Lv',{exact:true}).fill('20');
    assert.deepEqual((await local()).players.find(v=>v.excelRow===31).finalOv.slice(0,2),[151,162]); passed++;
    assert.deepEqual((await reliefEditor.locator('[data-final-stat]').allTextContents()).map(Number),[151,162]); passed++;
    await reliefEditor.getByRole('button',{name:'닫기',exact:true}).click();
    await p.reload(); await p.locator('.stadium-board').waitFor();
    const restoredTraining=(await local()).players.find(v=>v.excelRow===31);
    check('training and manual adjustment survive reload',restoredTraining.pohLv===20 && restoredTraining.finalOv[0]===151 && restoredTraining.finalOv[1]===162);
    const finalDeck = await local();
    check(
      "overview matches production calculation",
      (await p.getByTestId("deck-total").innerText()).replace(/[^\d.]/g, "") ===
        calcDeckTotal(finalDeck, tables).total.toFixed(1),
    );
    for (const width of [
      320, 360, 390, 419, 500, 760, 768, 820, 1024, 1440, 1920,
    ]) {
      await p.setViewportSize({ width, height: 1000 });
      const layout = await p
        .locator(".field-player button")
        .evaluateAll((els) => {
          const cards = els.map((el) => ({
            pos: el.querySelector(".position").textContent,
            rect: el.getBoundingClientRect(),
          }));
          const overlapping = cards.some((a, i) =>
            cards
              .slice(i + 1)
              .some(
                (b) =>
                  Math.min(a.rect.right, b.rect.right) >
                    Math.max(a.rect.left, b.rect.left) &&
                  Math.min(a.rect.bottom, b.rect.bottom) >
                    Math.max(a.rect.top, b.rect.top),
              ),
          );
          return {
            overlapping,
            dhGap:
              cards.find((c) => c.pos === "DH").rect.top -
              cards.find((c) => c.pos === "1B").rect.bottom,
          };
        });
      check(
        `field cards do not overlap at ${width}px`,
        !layout.overlapping && layout.dhGap >= 8,
      );
    }
    await p.locator(".roster-tabs button").filter({ hasText: "불펜" }).click();
    assert.deepEqual(await p.locator(".bullpen-role h3").allTextContents(), [
      "승리조",
      "추격조",
      "롱릴리프",
      "마무리",
    ]);
    passed++;
    assert.deepEqual(
      await p
        .locator(".bullpen-role")
        .evaluateAll((els) =>
          els.map((el) => el.querySelectorAll(".player-card").length),
        ),
      [3, 2, 1, 1],
    );
    passed++;
    for (const width of [320, 419, 1024, 1920]) {
      await p.setViewportSize({ width, height: 1000 });
      const aligned = await p.locator(".bullpen-role").evaluateAll((els) => {
        const rows = els.map((el) => ({
          rect: el.getBoundingClientRect(),
          cards: [...el.querySelectorAll(".player-card")].map((c) =>
            c.getBoundingClientRect(),
          ),
        }));
        return rows.every(
          (row, i) =>
            row.cards.every(
              (card) => Math.abs(card.top - row.cards[0].top) < 1,
            ) &&
            (!i || row.rect.top > rows[i - 1].rect.bottom),
        );
      });
      check(`bullpen keeps one separate row per role at ${width}px`, aligned);
    }
    await p.getByRole("button", { name: "☷ 표 보기", exact: true }).click();
    for (const width of [1920, 1440, 768, 390, 320]) {
      await p.setViewportSize({ width, height: 1000 });
      for (const group of ["타자", "선발", "불펜"]) {
        await p
          .locator(".roster-tabs button")
          .filter({ hasText: group })
          .click();
        check(
          `page fits ${width} ${group}`,
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        check(
          `table fits ${width} ${group}`,
          await p
            .locator(".table-scroll")
            .evaluate((e) => e.scrollWidth <= e.clientWidth),
        );
        check(
          `score visible ${width} ${group}`,
          await p
            .locator(".table-scroll th")
            .last()
            .evaluate((e) => e.getBoundingClientRect().right <= innerWidth),
        );
      }
    }
    await p.setViewportSize({ width: 1440, height: 1050 });
    await nav("스킬 비교");
    check(
      "comparison starts with six empty slots",
      await p
        .locator(".skill-comparison input")
        .evaluateAll(
          (els) => els.length === 6 && els.every((e) => e.value === ""),
        ),
    );
    check(
      "both initial totals are zero",
      (await p.locator(".skill-sum strong").allTextContents()).every(
        (t) => t === "0.00점",
      ),
    );
    await p.getByLabel("현재 스킬 1 레벨").selectOption("S4");
    check(
      "changing an empty slot's level does not select a skill",
      (await p
        .getByRole("combobox", { name: "현재 조합 스킬 1", exact: true })
        .inputValue()) === "",
    );
    await p
      .getByRole("combobox", { name: "현재 조합 스킬 1", exact: true })
      .fill("배팅 머신");
    await p.getByRole("option", { name: "배팅 머신", exact: true }).click();
    check(
      "S4 score changes",
      (
        await p
          .locator(".skill-combo")
          .first()
          .locator(".slot-heading strong")
          .first()
          .innerText()
      ).startsWith("24.00"),
    );
    const search = p.getByRole("combobox", {
      name: "현재 조합 스킬 1",
      exact: true,
    });
    await search.fill("5툴");
    await p.getByRole("option", { name: "5툴 플레이어", exact: true }).click();
    await p
      .getByLabel("현재 스킬 1 조건")
      .selectOption({ label: "주수 300-324" });
    await search.click();
    await p.getByRole("option", { name: /5툴 플레이어/ }).click();
    check(
      "condition retained after same skill reselect",
      (await p.getByLabel("현재 스킬 1 조건").inputValue()) ===
        "[S4] 5툴 플레이어 (주수 300-324)",
    );
    await p.getByLabel("비교 스킬 수").selectOption("4");
    check(
      "four-slot support retained",
      (await p.locator(".skill-slot").count()) === 8,
    );
    check(
      "new fourth slots start empty",
      (await p
        .getByRole("combobox", { name: "현재 조합 스킬 4", exact: true })
        .inputValue()) === "" &&
        (await p
          .getByRole("combobox", { name: "비교 조합 스킬 4", exact: true })
          .inputValue()) === "",
    );
    await p.getByLabel("검색 스킬 레벨").selectOption("S2");
    await p.getByLabel("스킬 검색", { exact: true }).fill("배팅 머신");
    await p.getByRole("button", { name: "조합에 넣기", exact: true }).click();
    check(
      "directory sets destination level",
      (await p.getByLabel("비교 스킬 3 레벨").inputValue()) === "S2",
    );
    await p.setViewportSize({ width: 320, height: 900 });
    check(
      "skills fit mobile",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await nav("시뮬레이터");
    await p.locator(".sim-hub-option").first().waitFor();
    check(
      "event remains locked before Monday",
      await p.locator(".event-option").isDisabled(),
    );
    check(
      "simulator illustrations rendered",
      (await p.locator(".sim-hub-option svg.sim-art").count()) === 4,
    );
    await p.locator(".sim-hub-option").first().click();
    await p.getByRole("button", { name: "1회 변경", exact: true }).click();
    check(
      "skill simulation produces three skills",
      (await p.locator(".sim-skill strong").count()) === 3,
    );
    await p
      .getByRole("button", { name: "← 시뮬레이터 선택", exact: true })
      .click();
    await p.locator(".hof-option").click();
    await p.getByRole("button", { name: "1회 영입", exact: true }).click();
    check(
      "HOF draw can be reset",
      await p
        .getByRole("button", { name: "기록 초기화", exact: true })
        .isEnabled(),
    );
    await p
      .getByRole("button", { name: "← 시뮬레이터 선택", exact: true })
      .click();
    await p.locator(".combo-option").click();
    await p.getByRole("button", { name: "1회 조합", exact: true }).click();
    check(
      "combination offers five candidate cards",
      (await p.locator(".combo-card").count()) === 5,
    );
    await p
      .getByRole("link", {
        name: "Rivals Deck 로고 · 내 라인업으로 이동",
        exact: true,
      })
      .click();
    check(
      "logo navigates to live lineup",
      await p.locator(".stadium-board").isVisible(),
    );
    await p.setViewportSize({ width: 1440, height: 1050 });
    if (process.env.RENEWAL_SCREENSHOTS) {
      fs.mkdirSync(process.env.RENEWAL_SCREENSHOTS, { recursive: true });
      await p.screenshot({
        path: path.join(process.env.RENEWAL_SCREENSHOTS, "lineup.png"),
        fullPage: true,
      });
      await nav("스킬 비교");
      await p.screenshot({
        path: path.join(process.env.RENEWAL_SCREENSHOTS, "skills.png"),
        fullPage: true,
      });
      await nav("시뮬레이터");
      await p.locator(".sim-hub-option").first().waitFor();
      await p.screenshot({
        path: path.join(process.env.RENEWAL_SCREENSHOTS, "simulator.png"),
        fullPage: true,
      });
    }
    await nav("내 라인업");
    await p.getByRole("button", { name: "+ 새 덱", exact: true }).click();
    await p.getByLabel("저장할 덱 이름").fill("기기 저장 검증");
    await p.getByRole("checkbox", { name: "공개 랭킹에도 연결" }).uncheck();
    const writesBefore = calls.length;
    await p.getByRole("button", { name: "저장", exact: true }).click();
    check(
      "named local save succeeds",
      (await local()).name === "기기 저장 검증",
    );
    check("local save does not publish", calls.length === writesBefore);
    await p.getByRole("button", { name: /덱 도구/ }).click();
    const downloadPromise = p.waitForEvent("download");
    await p.getByRole("button", { name: "현재 덱 백업", exact: true }).click();
    const download = await downloadPromise;
    const backedUp = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    check(
      "file backup contains selected deck",
      backedUp.name === "기기 저장 검증",
    );
    await p.getByLabel("덱 파일 불러오기").setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source)),
    });
    await p.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("rivals-decks-v1"));
      return (
        data.decks.find((d) => d.id === data.activeId)?.name === "복원 검증 덱"
      );
    });
    assert.deepEqual((await local()).players, source.players);
    passed++;
    await nav("덱랭킹");
    await p.locator(".ranking-deck-toggle").first().waitFor();
    check(
      "an unlinked same-name copy does not claim an owned ranking",
      (await p.getByTestId("my-rank").count()) === 0,
    );
    check(
      "unregistered deck explains how to see its rank",
      (
        await p.getByRole("region", { name: "내 덱 순위" }).innerText()
      ).includes("미등록"),
    );
    await nav("내 라인업");
    await p.getByRole("button", { name: "덱 저장", exact: true }).click();
    await p.getByLabel("저장할 덱 이름").fill("신규 등록 검증");
    await p.getByLabel("덱 비밀번호", { exact: true }).fill("0123");
    await p.getByLabel("덱 비밀번호 확인", { exact: true }).fill("0123");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await p.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("rivals-my-ranks-v1") || "{}")[
          "new-rank"
        ],
    );
    const saveCall = calls.find((c) => c.endpoint === "save_ranking_password");
    check(
      "PIN save sends full current deck",
      saveCall.args.p_password === "0123" &&
        saveCall.args.p_deck.players.length === 21 &&
        saveCall.args.p_name === "신규 등록 검증",
    );
    await p.reload();
    await p.locator(".stadium-board").waitFor();
    check(
      "new saved deck survives reload",
      (await local()).name === "신규 등록 검증",
    );
    check("no browser errors", errors.length === 0);
    console.log(
      `Renewal browser integration: ${passed} checks passed; ${calls.length} intercepted API calls; no live writes.`,
    );
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
