import assert from "node:assert/strict";
import cases from "./fixtures/deckscore-cases.json";
import { blankPlayer, DEFAULT_CHEM, LINEUP, type Deck } from "../src/lib/deck";
import { deckPlayerResults, flagDefaults, LOOKUP } from "../src/lib/engine";
import { applyDeckUpdate } from "../src/lib/playerUpdates";

import { DECK_SCORE_OPTIONS } from "../src/lib/deckScoreOptions";

// Exercise every selectable official option with a qualifying player.
// These cases also cover the previously unreachable 라이브/시즌 conditions.
let pass = 0;
const check = (name: string, ok: boolean) => { if (!ok) throw Error(name); pass++; };
const tables = { overrides: {}, customs: [] };
const flags = Object.fromEntries(Object.keys(flagDefaults()).map(k => [k, false]));
const keys = Object.values(DECK_SCORE_OPTIONS).flat().flatMap(r => r.sides.map(side => `${r.row}-${r.region}-${side}`));
check("all score flags covered", keys.length === cases.length && keys.every(key => cases.some(c => c.key === key)));
for (const c of cases) {
  check(`${c.key} card is selectable`, LOOKUP.cards.includes(c.card));
  const deck: Deck = { id: "audit", name: "검증 덱", updatedAt: 1, flags, chem: { ...DEFAULT_CHEM }, yearInputs: { 33: 2020, 35: 2020, 37: 2020 }, players: LINEUP.map(l => blankPlayer(l.row, l.kind, l.pos, l.order)) };
  deck.preferredTeam = c.key.endsWith("-R") ? "LAD" : "NYY";
  const index = deck.players.findIndex(p => p.excelRow === c.row);
  deck.players[index] = { ...deck.players[index], name: "검증", team: deck.preferredTeam, cardOvr: 80, card: c.card, year: 2026, order: c.order, enhLv: c.enh, finalOv: [100, 100, 100] };
  const before = deckPlayerResults(deck, tables)[index];
  const changed = applyDeckUpdate(deck, { flags: { ...flags, [c.key]: true } }, tables);
  const after = deckPlayerResults(changed, tables)[index];
  check(`${c.key} exact deck bonus`, after.deck.every((v, i) => v - before.deck[i] === c.delta[i]));
  check(`${c.key} updates manual final`, changed.players[index].finalOv.every((v, i) => v === 100 + c.delta[i]));
  const restored = applyDeckUpdate(changed, { flags }, tables);
  check(`${c.key} deselection restores score`, deckPlayerResults(restored, tables)[index].total === before.total && restored.players[index].finalOv.every(v => v === 100));
}
for (const [row, stat] of [[33, 1], [35, 0], [37, 0]]) {
  const deck: Deck = { id: "year", name: "연도 검증", preferredTeam: "LAD", updatedAt: 1, flags, chem: { ...DEFAULT_CHEM }, yearInputs: {}, players: LINEUP.map(l => blankPlayer(l.row, l.kind, l.pos, l.order)) };
  deck.players[0] = { ...deck.players[0], name: "타자", card: "시그니처", team: "LAD", year: 2026, finalOv: [100, 100, 100] };
  const changed = applyDeckUpdate(deck, { flags: { ...flags, [`${row}-spec-L`]: true }, yearInputs: { [row]: 2020 } }, tables);
  check(`year row ${row} affects final stats`, changed.players[0].finalOv[stat] === 101);
  check(`year row ${row} excludes outside decade`, applyDeckUpdate(deck, { flags: { ...flags, [`${row}-spec-L`]: true }, yearInputs: { [row]: 2016 } }, tables).players[0].finalOv.every(v => v === 100));
}
// Check excluded players in the same lineup, including manual values on older saved decks.
const roster: Deck = {
  id: "mixed", name: "혼합 덱", updatedAt: 1, preferredTeam: "LAD", flags: {}, yearInputs: {},
  chem: DEFAULT_CHEM, players: LINEUP.map(l => ({
    ...blankPlayer(l.row, l.kind, l.pos, l.order), team: "LAD", card: "시그니처",
    cardOvr: 80, year: 2022, finalOv: [100, 100, 100],
  })),
};
function expectBonus(key: string, index: number, changes: Partial<Deck["players"][number]>, expected: number[], preferredTeam = "LAD") {
  const deck = { ...roster, preferredTeam, players: roster.players.map((p, i) => i === index ? { ...p, ...changes } : p) };
  const [row, region] = key.split("-");
  const years = region === "spec" && ["33", "35", "37"].includes(row) ? { [row]: 2020 } : {};
  const selected = applyDeckUpdate(deck, { flags: { [key]: true }, yearInputs: years }, tables);
  const result = deckPlayerResults(selected, tables)[index];
  assert.deepEqual(result.deck, expected, JSON.stringify({ key, index, changes }));
  assert.deepEqual(selected.players[index].finalOv, expected.map(v => v + 100));
  pass += 2;
}
const none = [0, 0, 0];
expectBonus("14-team-L", 0, { pos: "SS" }, [0, 2, 1]);
expectBonus("14-team-L", 2, { pos: "DH" }, none);
for (const index of [14, 15, 16, 17]) expectBonus("28-spec-R", index, {}, none);
for (const card of ["라이브/시즌", "시그니처"]) {
  expectBonus("21-spec-L", 14, { card }, card === "라이브/시즌" ? [1, 1, 0] : none);
}
for (const card of ["명예의 전당", "모먼트", "슈프림 모먼트"]) {
  for (const key of ["33-spec-R", "35-spec-R", "37-spec-L"]) expectBonus(key, 9, { card }, none);
}
for (const key of ["10-team-L", "29-team-L", "10-spec-L", "12-spec-L", "22-spec-L", "36-spec-L", "37-spec-L", "38-spec-L"]) {
  expectBonus(key, 0, { team: "NYY" }, none);
  expectBonus(key, 0, { team: "" }, none, "");
}
for (const card of ["FA 시그니처", "WBC 시그니처", "명예의 전당"]) {
  expectBonus("10-team-L", 0, { team: "NYY", card }, [3, 3, 3]);
}
for (const ovr of [79, "", undefined] as const) {
  expectBonus("24-spec-L", 0, { cardOvr: ovr }, none);
  expectBonus("24-spec-R", 9, { cardOvr: ovr }, none);
}
expectBonus("15-team-R", 0, { team: "NYY" }, none);
expectBonus("15-team-L", 0, { team: "NYY", card: "FA 시그니처" }, none);
expectBonus("15-team-R", 0, { team: "NYY", card: "FA 시그니처" }, [1, 1, 1]);
expectBonus("13-spec-R", 9, {}, none);
expectBonus("17-spec-R", 0, {}, none);
console.log(`deckscore pass=${pass} fail=0`);
