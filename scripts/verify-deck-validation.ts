import assert from "node:assert/strict";
import { blankPlayer, LINEUP, type Deck } from "../src/lib/deck";
import { deckPlayerResults } from "../src/lib/engine";
import { parseDeckFile } from "../src/lib/deckFile";
import { readStoredDecks } from "../src/lib/deckStorage";

const deck: Deck = {
  id: "validation", name: "정상 덱", updatedAt: 1,
  players: LINEUP.map(l => blankPlayer(l.row, l.kind, l.pos, l.order)),
  chem: {}, flags: {}, yearInputs: {},
};
const tables = { overrides: {}, customs: [] };
let count = 0;
for (const [field, invalid] of [
  ["base", null], ["skills", 7], ["skills", [null]], ["base", ["100", 0, 0]],
  ["enhLv", "bad"], ["card", {}], ["leaderBonus", [Infinity]], ["finalOv", [NaN]],
  ["bullpenRole", "invalid"], ["train", [0, 0, 0, 0]],
] as const) {
  const bad = { ...deck, players: deck.players.map((p, i) => i === 0 ? { ...p, [field]: invalid } : p) };
  assert.deepEqual(parseDeckFile(bad), [], `reject malformed player ${field}`);
  assert.equal(parseDeckFile({ decks: [bad, deck] }).length, 1, `keep valid deck after bad ${field}`);
  count += 2;
}
for (const [field, invalid] of [["flags", null], ["chem", 1], ["yearInputs", { 33: "year" }], ["name", 42], ["bullpenTactics", { winning: 2 }]] as const) {
  const bad = { ...deck, [field]: invalid };
  assert.deepEqual(parseDeckFile(bad), []);
  const raw = JSON.stringify({ decks: [bad, deck], activeId: deck.id });
  const restored = readStoredDecks(raw);
  assert.equal(restored.damaged, true);
  assert.equal(restored.decks.length, 1);
  assert.equal(restored.decks[0].name, deck.name);
  count += 4;
}
// 구버전에서 생략한 필드는 기존 수치를 유지하며 보완한다.
const old: any = structuredClone(deck);
delete old.flags; delete old.chem; delete old.yearInputs;
delete old.players[0].base; delete old.players[0].skills;
old.players[9].base = [100, 101]; old.players[9].skills = ["", "", ""];
const fixed = parseDeckFile(old)[0].deck;
assert.deepEqual(fixed.players[0].base, ["", "", ""]);
assert.deepEqual(fixed.players[9].base, [100, 101, ""]);
assert.equal(fixed.players[9].skills.length, 4);
assert.ok(deckPlayerResults(fixed, tables).every(r => Number.isFinite(r.total)));
assert.equal(readStoredDecks(JSON.stringify(old), true).damaged, false);
assert.equal(readStoredDecks("{broken").damaged, true);
assert.equal(readStoredDecks(JSON.stringify({ decks: [] })).damaged, false);
assert.equal(readStoredDecks(JSON.stringify({ decks: [deck], activeId: deck.id })).activeId, deck.id);
count += 8;
console.log(`deck validation: ${count} passed`);
