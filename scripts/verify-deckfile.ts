import { blankPlayer, DEFAULT_CHEM, LINEUP, YEAR_ANCHOR } from "../src/lib/deck";
import type { Deck } from "../src/lib/deck";
import { flagDefaults } from "../src/lib/engine";
import { buildBundle, BUNDLE_FORMAT, parseDeckFile, withRank } from "../src/lib/deckFile";
import type { RankLinks } from "../src/lib/rankSync";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) pass++;
  else { fail++; console.log("FAIL:", label); }
};

const mkDeck = (id: string, name: string): Deck => ({
  id, name, updatedAt: 1,
  players: LINEUP.map((l) => blankPlayer(l.row, l.kind, l.pos, l.order)),
  chem: { ...DEFAULT_CHEM }, flags: flagDefaults(),
  yearInputs: Object.fromEntries(Object.values(YEAR_ANCHOR).map((r) => [r, ""])) as Deck["yearInputs"],
});
const d1 = mkDeck("d1", "덱1"), d2 = mkDeck("d2", "덱2"), d3 = mkDeck("d3", "덱3");
const links: RankLinks = {
  "row-A": { token: "tok-A", deckId: "d1", sig: "x" },
  "row-C": { token: "tok-C", deckId: "d3" },
  "row-O": { owned: true, deckId: "d4", sig: "y" }, // 코드 소유 글: token 없음
};

// withRank: 연동 덱만 rank가 붙고, 원본 덱 객체는 그대로
const w1 = withRank(d1, links);
check("linked deck gets rank", w1.rank?.id === "row-A" && w1.rank?.token === "tok-A");
check("unlinked deck has no rank key", !("rank" in withRank(d2, links)));
check("state deck not mutated", !("rank" in d1));

// buildBundle: 형식 표시 + 모든 덱, 연동 덱에만 rank
const b = buildBundle([d1, d2, d3], links);
check("bundle format", b.format === BUNDLE_FORMAT && b.decks.length === 3);
check("bundle: only linked decks carry rank", b.decks.map((d) => "rank" in d).join() === "true,false,true");
check("bundle: unlinked deck leaks no token", !JSON.stringify(b.decks[1]).includes("tok-"));

// parseDeckFile: 묶음 왕복
const rt = parseDeckFile(JSON.parse(JSON.stringify(b)));
check("roundtrip: 3 entries", rt.length === 3);
check("roundtrip: ranks restored", rt[0].rank?.id === "row-A" && rt[0].rank?.token === "tok-A" && !rt[1].rank && rt[2].rank?.id === "row-C");
check("roundtrip: names kept in order", rt.map((e) => e.deck.name).join() === "덱1,덱2,덱3");
check("parsed deck objects never contain rank", rt.every((e) => !("rank" in e.deck) && !JSON.stringify(e.deck).includes("tok-")));

// 코드 소유 글은 파일에 rank가 붙지 않음
const d4 = mkDeck("d4", "덱4");
check("owned link -> no rank in file", !("rank" in withRank(d4, links)) && !JSON.stringify(buildBundle([d4], links)).includes("row-O"));

// 단일 덱 파일(기존 형식) 호환
const single = parseDeckFile(JSON.parse(JSON.stringify(w1)));
check("single file with rank", single.length === 1 && single[0].rank?.id === "row-A" && !("rank" in single[0].deck));
const legacy = parseDeckFile(JSON.parse(JSON.stringify(d2)));
check("legacy single file (no rank)", legacy.length === 1 && legacy[0].rank === undefined);

// 잘못된 입력은 조용히 버림 / 일부만 유효한 묶음
check("garbage -> empty", parseDeckFile(null).length === 0 && parseDeckFile(42).length === 0 && parseDeckFile({}).length === 0 && parseDeckFile("x").length === 0);
const mixed = parseDeckFile({ decks: [d1, { nope: 1 }, "x", null, d2] });
check("bundle skips invalid entries, keeps valid", mixed.length === 2 && mixed[1].deck.name === "덱2");
const badRank = parseDeckFile({ ...d1, rank: { id: 5, token: "t" } });
check("non-string rank ignored (deck still imported)", badRank.length === 1 && badRank[0].rank === undefined && !("rank" in badRank[0].deck));
const halfRank = parseDeckFile({ ...d1, rank: { id: "row-Z" } });
check("rank without token ignored", halfRank.length === 1 && halfRank[0].rank === undefined);
check("empty bundle -> empty", parseDeckFile({ format: BUNDLE_FORMAT, decks: [] }).length === 0);

// 조작된 공유 링크가 rank를 실어와도 덱에는 남지 않음
const crafted = parseDeckFile({ ...d2, rank: { id: "row-EVIL", token: "stolen" } });
check("crafted rank is stripped from deck data", !("rank" in crafted[0].deck) && !JSON.stringify(crafted[0].deck).includes("stolen"));

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
