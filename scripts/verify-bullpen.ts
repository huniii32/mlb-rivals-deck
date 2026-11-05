import { blankPlayer, DEFAULT_CHEM, isDeck, LINEUP, normalizeDeck, resizeBullpen, type Deck } from "../src/lib/deck";
import { bullpenCounts, bullpenRole, tacticStatus } from "../src/lib/bullpen";
import { calcDeckTotal, deckPlayerResults, flagDefaults, LOOKUP, migrateSkillName, skillScore } from "../src/lib/engine";
import { buildBundle, parseDeckFile } from "../src/lib/deckFile";
import { rankArgs } from "../src/lib/rankSync";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log("FAIL:", name); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const tables = { overrides: {}, customs: [] };
const legacy: Deck = {
  id: "legacy", name: "기존 덱", updatedAt: 1,
  players: LINEUP.map((l) => ({ ...blankPlayer(l.row, l.kind, l.pos, l.order), name: `P${l.row}`, finalOv: [100, 100, ""] })),
  chem: { ...DEFAULT_CHEM }, flags: flagDefaults(), yearInputs: {},
};
const migrated = normalizeDeck(legacy);
check("legacy 18-player deck accepted", isDeck(legacy) && migrated.players.length === 18);
check("legacy roles mapped without moving players", migrated.players.slice(14).map(bullpenRole).join() === "winning,chasing,long,closer");
check("legacy basic scores unchanged", near(calcDeckTotal(legacy, tables).total, calcDeckTotal(migrated, tables).total));

let players = resizeBullpen(migrated.players, "winning", 3);
players = resizeBullpen(players, "chasing", 2).map((p) => ({ ...p, name: `P${p.excelRow}`, finalOv: [100, 100, ""] }));
const deck: Deck = { ...migrated, players, bullpenTactics: { winning: "division", chasing: "aggressive" } };
check("3 winning + 2 chasing + 1 long + 1 closer", JSON.stringify(bullpenCounts(players)) === JSON.stringify({ winning: 3, chasing: 2, long: 1, closer: 1 }));
check("7 bullpen / 21 total accepted", players.length === 21 && isDeck(deck));
check("eighth bullpen blocked", resizeBullpen(players, "winning", 4) === players);
check("fifth member of a group blocked", resizeBullpen(players, "winning", 5) === players);
check("third closer blocked", resizeBullpen(players, "closer", 3) === players);
const twoClosers = resizeBullpen(resizeBullpen(players, "winning", 2), "closer", 2);
check("two closers supported", bullpenCounts(twoClosers).closer === 2 && isDeck({ ...deck, players: twoClosers }));
check("duplicate slot identities rejected", !isDeck({ ...deck, players: [...players.slice(0, -1), players[14]] }));

const baseline = deckPlayerResults({ ...deck, bullpenTactics: { winning: "basic", chasing: "basic" } }, tables);
const results = deckPlayerResults(deck, tables);
check("tactics affect only the intended groups", players.every((p, i) => {
  const role = bullpenRole(p);
  const expected = role === "winning" ? 4 : role === "chasing" ? 2 : 0;
  return results[i].tactics.join() === `${expected},${expected},0` && near(results[i].ability - baseline[i].ability, expected * 2.35);
}));
check("manual final stats receive tactic bonus once", results[14].final[0] === 104 && results[14].final[1] === 104 && players[14].finalOv[0] === 100);
check("calculating repeatedly does not accumulate bonus", near(deckPlayerResults(deck, tables)[14].total, results[14].total));
const automatic: Deck = { ...deck, players: players.map((p) => ({ ...p, finalOv: ["", "", ""] })) };
const autoBonus = deckPlayerResults(automatic, tables)[14];
const autoBasic = deckPlayerResults({ ...automatic, bullpenTactics: { winning: "basic", chasing: "basic" } }, tables)[14];
check("automatic final stats receive tactic bonus once", near(autoBonus.final[0] - autoBasic.final[0], 4) && near(autoBonus.final[1] - autoBasic.final[1], 4) && autoBonus.final[0] === autoBonus.auto[0]);
const withBlank = players.map((p) => p.excelRow === 31 ? { ...p, name: "" } : p);
check("blank slot does not count toward division", tacticStatus(withBlank, deck.bullpenTactics).winningBonus === 0);
check("three winning pitchers can choose aggressive", tacticStatus(players, { winning: "aggressive", chasing: "basic" }).winningBonus === 2);
const fourWinning = resizeBullpen(resizeBullpen(players, "chasing", 1), "winning", 4).map((p) => ({ ...p, name: `P${p.excelRow}` }));
check("four winning pitchers meet division minimum", tacticStatus(fourWinning, deck.bullpenTactics).winningBonus === 4);
const threeChasing = resizeBullpen(resizeBullpen(players, "winning", 2), "chasing", 3).map((p) => ({ ...p, name: `P${p.excelRow}` }));
check("three chasing pitchers meet aggressive minimum", tacticStatus(threeChasing, deck.bullpenTactics).chasingBonus === 2);
check("basic disables both tactic bonuses", tacticStatus(players).winningBonus === 0 && tacticStatus(players).chasingBonus === 0);

const baseTotal = calcDeckTotal({ ...deck, bullpenTactics: { winning: "basic", chasing: "basic" } }, tables);
const boosted = calcDeckTotal(deck, tables);
check("all seven relievers contribute to bullpen average", near(boosted.rp - baseTotal.rp, (3 * 9.4 + 2 * 4.7) / 7 * 10));
check("ranking payload includes all 21 players and tactics", rankArgs(deck, tables).args.p_named === 21 && JSON.stringify(rankArgs(deck, tables).args.p_deck).includes('"winning":"division"'));
const restored = parseDeckFile(JSON.parse(JSON.stringify(buildBundle([deck, legacy], {}))));
check("new and legacy decks roundtrip together", restored.length === 2 && restored[0].deck.players.length === 21 && restored[1].deck.players.length === 18);
check("roundtrip retains tactics and score", restored[0].deck.bullpenTactics?.winning === "division" && near(calcDeckTotal(restored[0].deck, tables).total, boosted.total));

const trained = { ...deck, players: players.map((p) => ({ ...p, card: "WBC 시그니처 블랙", enhLv: 18, pohLv: 16 })) };
const trainedResults = deckPlayerResults(trained, tables);
const firstWin = trained.players.findIndex((p) => p.excelRow === 27);
const extraWin = trained.players.findIndex((p) => p.excelRow === 31);
check("extra winning pitcher uses winning deck-score rules", JSON.stringify(trainedResults[firstWin].deck) === JSON.stringify(trainedResults[extraWin].deck));
check("extra winning pitcher uses winning training table", JSON.stringify(trainedResults[firstWin].poh) === JSON.stringify(trainedResults[extraWin].poh) && !trainedResults[extraWin].warnings.some((w) => w.includes("포훈표")));
const closers = { ...deck, players: twoClosers.map((p) => ({ ...p, name: `P${p.excelRow}`, card: "WBC 시그니처 블랙", enhLv: 18, pohLv: 16 })) };
const closerResults = deckPlayerResults(closers, tables);
const closerIndexes = closers.players.map((p, i) => bullpenRole(p) === "closer" ? i : -1).filter((i) => i >= 0);
check("second closer reuses closer deck-score and training profile", JSON.stringify(closerResults[closerIndexes[0]].deck) === JSON.stringify(closerResults[closerIndexes[1]].deck) && JSON.stringify(closerResults[closerIndexes[0]].poh) === JSON.stringify(closerResults[closerIndexes[1]].poh));

check("ranked performer scores", skillScore("batter", "[S0] 2026 퍼포머트리오 (랭대기준)", tables) === 24 && skillScore("pitcher", "[S0] 2026 퍼포머트리오 (랭대기준)", tables) === 23.5);
check("other-mode performer choices removed", ![...LOOKUP.batter, ...LOOKUP.pitcher].some((s) => s.name.includes("리그·라이브 매치")));
check("saved other-mode performer skill migrates to ranked", migrateSkillName("pitcher", "[S0] 2026 퍼포머트리오 (리그·라이브 매치 O)") === "[S0] 2026 퍼포머트리오 (랭대기준)");

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
