import assert from "node:assert/strict";
import { blankPlayer, DEFAULT_CHEM, LINEUP, normalizeDeck, resizeBullpen, type Deck } from "../src/lib/deck";
import { bullpenRole } from "../src/lib/bullpen";
import { calcDeckTotal, deckPlayerResults } from "../src/lib/engine";
import { applyDeckUpdate } from "../src/lib/playerUpdates";
import { buildBundle, parseDeckFile } from "../src/lib/deckFile";

let checks = 0;
function eq(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
const tables = { overrides: {}, customs: [] };
const base: Deck = {
  id: "target-training", name: "계산 검증", updatedAt: 1, flags: {}, yearInputs: {},
  chem: { ...DEFAULT_CHEM },
  players: resizeBullpen(resizeBullpen(LINEUP.map(l => ({ ...blankPlayer(l.row, l.kind, l.pos, l.order), name: `선수${l.row}`, year: 2024 })), "winning", 3), "chasing", 2)
    .map(p => ({ ...p, name: `선수${p.excelRow}`, year: 2024 })),
};

// User's game screenshots: 615 pitcher BRK +1; 645 pitcher STF +1.
// CON/FLD are intentionally outside this application's two pitching score inputs.
for (const [row, batterStat, pitcherStat] of [[33, 1, 0], [35, 0, 1]]) {
  for (const year of [2019, 2020, 2029, 2030]) {
    const deck = { ...base, yearInputs: { [row]: 2020 }, players: base.players.map(p => ({ ...p, year })) };
    const qualifies = year >= 2020 && year <= 2029;
    for (const target of ["L", "R", "none", "both"]) {
      const flags = { [`${row}-spec-L`]: target === "L" || target === "both", [`${row}-spec-R`]: target === "R" || target === "both" };
      const result = deckPlayerResults({ ...deck, flags }, tables);
      deck.players.forEach((p, i) => {
        const expected = [0, 0, 0];
        if (qualifies && ((target === "L" && p.kind === "batter") || (target === "R" && p.kind === "pitcher"))) {
          expected[p.kind === "batter" ? batterStat : pitcherStat] = 1;
          if (p.kind === "batter" && row === 33) expected[2] = 1;
        }
        eq(result[i].deck, expected);
      });
    }
  }
  // Old saved decks without a target must not silently grant both bonuses.
  const legacy = normalizeDeck({ ...base, yearInputs: { [row]: 2020 } });
  eq(deckPlayerResults(legacy, tables).every(r => r.deck.every(v => v === 0)), true);
  const manual = { ...legacy, players: legacy.players.map(p => ({ ...p, finalOv: [100, 100, 100] as [number, number, number] })) };
  const selected = applyDeckUpdate(manual, { flags: { [`${row}-spec-R`]: true } }, tables);
  for (const p of selected.players) {
    const expected = [100, 100, 100];
    if (p.kind === "pitcher") expected[pitcherStat]++;
    eq(p.finalOv, expected);
  }
  const switched = applyDeckUpdate(selected, { flags: { [`${row}-spec-L`]: true } }, tables);
  for (const p of switched.players) {
    const expected = [100, 100, 100];
    if (p.kind === "batter") { expected[batterStat]++; if (row === 33) expected[2]++; }
    eq(p.finalOv, expected);
  }
  const cleared = applyDeckUpdate(switched, { yearInputs: { [row]: "" } }, tables);
  eq(cleared.players.map(p => p.finalOv), manual.players.map(p => p.finalOv));
  const restored = parseDeckFile(JSON.parse(JSON.stringify(buildBundle([selected], {}))))[0].deck;
  eq(restored.flags, selected.flags);
  eq(deckPlayerResults(restored, tables).map(r => r.deck), deckPlayerResults(selected, tables).map(r => r.deck));
}

// Both thresholds can be active together, but each independently chooses a group.
const mixed = { ...base, flags: { "33-spec-R": true, "35-spec-L": true }, yearInputs: { 33: 2020, 35: 2020 } };
eq(deckPlayerResults(mixed, tables).every(r => r.deck.join() === "1,0,0"), true);
const pitchersOnly = { ...mixed, flags: { "33-spec-R": true, "35-spec-R": true } };
eq(deckPlayerResults(pitchersOnly, tables).map(r => r.deck), base.players.map(p => p.kind === "pitcher" ? [1, 1, 0] : [0, 0, 0]));

// Fixed values from the existing table: validate input → lookup → stats → totals.
// This verifies wiring, not a claim that every table entry matches the current game.
const trainingAt16 = { winning: [4, 4], chasing: [5, 4], long: [4, 4], closer: [4, 4] };
for (const manual of [false, true]) {
  const deck = { ...base, players: base.players.map(p => ({ ...p, pohLv: "" as const, finalOv: manual ? [100, 100, 100] as [number, number, number] : p.finalOv })) };
  for (const [i, p] of deck.players.entries()) {
    const role = bullpenRole(p);
    if (!role) continue;
    const changed = applyDeckUpdate(deck, { players: deck.players.map((v, j) => i === j ? { ...v, pohLv: 16 } : v) }, tables);
    const before = deckPlayerResults(deck, tables), after = deckPlayerResults(changed, tables);
    eq(after[i].poh, [...trainingAt16[role], null]);
    eq(after[i].final.slice(0, 2).map((v, s) => v - before[i].final[s]), trainingAt16[role]);
    eq(after.filter((_, j) => i !== j).map(r => r.final), before.filter((_, j) => i !== j).map(r => r.final));
    eq(after[i].warnings.filter(w => w.includes("포훈")), []);
    const expectedDelta = trainingAt16[role][0] * 1.15 + trainingAt16[role][1] * 1.2;
    eq(Math.abs(after[i].total - before[i].total - expectedDelta) < 1e-8, true);
    eq(Math.abs(calcDeckTotal(changed, tables).total - calcDeckTotal(deck, tables).total - expectedDelta / 7 * 10 * .1) < 1e-8, true);
    const cleared = applyDeckUpdate(changed, { players: changed.players.map((v, j) => i === j ? { ...v, pohLv: "" } : v) }, tables);
    eq(deckPlayerResults(cleared, tables).map(r => r.final), before.map(r => r.final));
  }
}
const max = { ...base, players: base.players.map(p => ({ ...p, pohLv: 20 })) };
eq(deckPlayerResults(max, tables).slice(14).map(r => r.poh), Array(7).fill([5, 6, null]));
console.log(`training and decade targets pass=${checks} fail=0`);
