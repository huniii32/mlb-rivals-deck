import assert from "node:assert/strict";
import { blankPlayer, DEFAULT_CHEM, LINEUP, type Deck } from "../src/lib/deck";
import { deckPlayerResults } from "../src/lib/engine";
import { playerChanges, settingChanges } from "../src/lib/experimentComparison";

const original: Deck = {
  id: "test", name: "비교", updatedAt: 0, flags: { "11-team-L": true }, yearInputs: {}, chem: DEFAULT_CHEM,
  players: LINEUP.map(p => blankPlayer(p.row, p.kind, p.pos, p.order)),
};
original.players[0].name = "포수";
original.players[9].name = "선발";
const tables = { overrides: { "batter:스킬 A": 10, "batter:스킬 B": 10 }, customs: [] };
const compare = (next: Deck) => playerChanges(original, next, deckPlayerResults(original, tables), deckPlayerResults(next, tables));
assert.deepEqual(compare(structuredClone(original)), []);
const switched = { ...original, flags: { "11-team-R": true } };
assert.deepEqual(settingChanges(original, switched), [{ label: "팀 덱스코어 240", before: "타자", after: "투수" }]);
const changed = compare(switched);
assert.equal(changed.length, 2);
assert.ok(changed.find(p => p.row === 11)!.diff < 0);
assert.ok(changed.find(p => p.row === 22)!.diff > 0);
original.players[0].skills[0] = "스킬 A";
const equal = structuredClone(original);
equal.players[0].skills[0] = "스킬 B";
const [player] = compare(equal);
assert.equal(player.diff, 0);
assert.deepEqual(player.changes, [{ label: "스킬 1", before: "스킬 A (10점)", after: "스킬 B (10점)" }]);
