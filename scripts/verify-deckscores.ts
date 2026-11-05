import cases from "./fixtures/deckscore-cases.json";
import { blankPlayer, DEFAULT_CHEM, LINEUP, type Deck } from "../src/lib/deck";
import { deckPlayerResults, flagDefaults, LOOKUP, referencedFlags } from "../src/lib/engine";
import { applyDeckUpdate } from "../src/lib/playerUpdates";

// Workbook-derived rules: exercise every referenced option with a qualifying player.
// These cases also cover the previously unreachable 라이브/시즌 conditions.
let pass = 0;
const check = (name: string, ok: boolean) => { if (!ok) throw Error(name); pass++; };
const tables = { overrides: {}, customs: [] };
const flags = Object.fromEntries(Object.keys(flagDefaults()).map(k => [k, false]));
check("all score flags covered", referencedFlags().length === cases.length && referencedFlags().every(f => cases.some(c => c.key === `${f.row}-${f.region}-${f.side}`)));
for (const c of cases) {
  check(`${c.key} card is selectable`, LOOKUP.cards.includes(c.card));
  const deck: Deck = { id: "audit", name: "검증 덱", updatedAt: 1, flags, chem: { ...DEFAULT_CHEM }, yearInputs: { 33: 2020, 35: 2020, 37: 2020 }, players: LINEUP.map(l => blankPlayer(l.row, l.kind, l.pos, l.order)) };
  const index = deck.players.findIndex(p => p.excelRow === c.row);
  deck.players[index] = { ...deck.players[index], name: "검증", card: c.card, year: 2026, order: c.order, enhLv: c.enh, finalOv: [100, 100, 100] };
  const before = deckPlayerResults(deck, tables)[index];
  const changed = applyDeckUpdate(deck, { flags: { ...flags, [c.key]: true } }, tables);
  const after = deckPlayerResults(changed, tables)[index];
  check(`${c.key} exact deck bonus`, after.deck.every((v, i) => v - before.deck[i] === c.delta[i]));
  check(`${c.key} updates manual final`, changed.players[index].finalOv.every((v, i) => v === 100 + c.delta[i]));
  const restored = applyDeckUpdate(changed, { flags }, tables);
  check(`${c.key} deselection restores score`, deckPlayerResults(restored, tables)[index].total === before.total && restored.players[index].finalOv.every(v => v === 100));
}
for (const [row, stat] of [[33, 1], [35, 0], [37, 0]]) {
  const deck: Deck = { id: "year", name: "연도 검증", updatedAt: 1, flags, chem: { ...DEFAULT_CHEM }, yearInputs: {}, players: LINEUP.map(l => blankPlayer(l.row, l.kind, l.pos, l.order)) };
  deck.players[0] = { ...deck.players[0], name: "타자", year: 2026, finalOv: [100, 100, 100] };
  const changed = applyDeckUpdate(deck, { yearInputs: { [row]: 2020 } }, tables);
  check(`year row ${row} affects final stats`, changed.players[0].finalOv[stat] === 101);
  check(`year row ${row} excludes outside decade`, applyDeckUpdate(deck, { yearInputs: { [row]: 2016 } }, tables).players[0].finalOv.every(v => v === 100));
}
console.log(`deckscore pass=${pass} fail=0`);
