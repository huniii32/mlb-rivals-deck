import assert from "node:assert/strict";
import { blankPlayer } from "../src/lib/deck";
import { DECK_SCORE_OPTIONS, officialDeckBonus, rowPlayers, selectedEffect } from "../src/lib/deckScoreOptions";

const flags = { "33-spec-R": true, "35-spec-R": true };
const years = { 33: 2020, 35: 2020 };
const sp = { ...blankPlayer(22, "pitcher", "SP1", ""), name: "선발", year: 2020, card: "시그니처" };
const players = [sp, { ...sp, year: "" as const }, { ...sp, year: 2030 }, { ...sp, card: "모먼트" }, { ...sp, name: "" }];
for (const threshold of [615, 645]) {
  const rule = DECK_SCORE_OPTIONS.spec.find(r => r.threshold === threshold)!;
  assert.equal(selectedEffect(rule, {}), undefined);
  const choice = selectedEffect(rule, flags)!;
  assert.deepEqual(choice.bonuses, threshold === 615 ? { 변화: 1, 제구: 1 } : { 구위: 1, 수비: 1 });
  assert.deepEqual(rowPlayers(rule, choice, players, years, "").map(p => p.state), ["applied", "unknown", "excluded", "excluded"]);
}
assert.deepEqual(officialDeckBonus(sp, flags, years).sums, [1, 1, 0]);
