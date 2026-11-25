import assert from "node:assert/strict";
import { blankPlayer, type Deck } from "../src/lib/deck";
import { deckPlayerResults } from "../src/lib/engine";
import { applyDeckUpdate } from "../src/lib/playerUpdates";

const tables = { overrides: {}, customs: [] };
for (const card of ["WBC 프라임", "WBC 시그니처", "WBC 시그니처 블랙"]) {
  for (const kind of ["batter", "pitcher"] as const) {
    const p = blankPlayer(kind === "batter" ? 11 : 22, kind, kind === "batter" ? "C" : "SP1", "");
    Object.assign(p, { name: "검증", card, team: "SFG", base: [100, 100, 100] });
    const d: Deck = { id: "wbc", name: "WBC", updatedAt: 0, preferredTeam: "SF", players: [p],
      chem: { commander: "X", catcher: "X", pitchChem: "X", batChem: "X", wbcP: "X", wbcB: "X" }, flags: {}, yearInputs: {} };
    const result = (deck: Deck) => deckPlayerResults(deck, tables)[0];
    const n = kind === "batter" ? 3 : 2;
    assert.deepEqual(result(d).final.slice(0,n), Array(n).fill(105));
    for (const team of ["LAD", "", "?"]) assert.deepEqual(result({...d, preferredTeam: team}).final.slice(0,n), Array(n).fill(103));
    for (const patch of [{team: ""}, {name: ""}, {card: "FA 시그니처"}]) assert.equal(result({...d, players:[{...p, ...patch}]}).wbcClubOvr, 0);
    const flagged = {...d, flags: {"10-spec-L": true}};
    assert.deepEqual(result(flagged).final.slice(0,n), Array(n).fill(107));
    assert.deepEqual(result({...flagged, preferredTeam: "LAD"}).final.slice(0,n), Array(n).fill(105));
    p.finalOv = [150, 150, kind === "batter" ? 150 : ""];
    assert.deepEqual(result(d).final.slice(0,n), Array(n).fill(150));
    const away = applyDeckUpdate(d, {preferredTeam: "LAD"}, tables);
    assert.deepEqual(result(away).final.slice(0,n), Array(n).fill(148));
    assert.deepEqual(result(applyDeckUpdate(away, {preferredTeam: "SF"}, tables)).final.slice(0,n), Array(n).fill(150));
  }
}
