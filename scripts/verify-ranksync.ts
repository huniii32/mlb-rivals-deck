import { blankPlayer, DEFAULT_CHEM, LINEUP, YEAR_ANCHOR } from "../src/lib/deck";
import type { Deck } from "../src/lib/deck";
import { calcDeckTotal, flagDefaults } from "../src/lib/engine";
import { deckSig, rankArgs, syncLinks, type RankLinks } from "../src/lib/rankSync";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) pass++;
  else { fail++; console.log("FAIL:", label); }
};

const TABLES = { overrides: {}, customs: [] };
const mkDeck = (id: string): Deck => ({
  id, name: "덱", updatedAt: 1,
  players: LINEUP.map((l) => blankPlayer(l.row, l.kind, l.pos, l.order)),
  chem: { ...DEFAULT_CHEM }, flags: flagDefaults(),
  yearInputs: Object.fromEntries(Object.values(YEAR_ANCHOR).map((r) => [r, ""])) as Deck["yearInputs"],
});
const edit = (d: Deck): Deck => ({ ...d, players: d.players.map((p, i) => (i === 0 ? { ...p, name: "홍길동", card: "WBC 시그니처 블랙", enhLv: 18 } : p)) });
const sigOf = (d: Deck) => deckSig(rankArgs(d, TABLES).args);

// fake rpc: 호출 기록 + 응답 지정
type Res = { data: unknown; error: unknown };
const fake = (reply: () => Res | Promise<Res>) => {
  const calls: Record<string, unknown>[] = [];
  return { calls, rpc: async (_fn: "update_ranking", args: Record<string, unknown>) => { calls.push(args); return reply(); } };
};

async function main() {
  const d0 = mkDeck("d1");
  const s0 = sigOf(d0);

  // deckSig: 안정성 + 변화 감지
  const a = rankArgs(d0, TABLES).args;
  check("sig stable", deckSig(a) === deckSig(structuredClone(a)));
  check("sig differs on total", deckSig({ ...a, p_total: a.p_total + 1 }) !== deckSig(a));
  check("sig differs on name", deckSig({ ...a, p_name: "다른" }) !== deckSig(a));
  check("sig differs on deck", deckSig({ ...a, p_deck: { x: 1 } }) !== deckSig(a));
  check("sig short", deckSig(a).length < 20);

  // (1) sig 동일 -> rpc 없음
  {
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "d1", sig: s0 } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check("1 no rpc", f.calls.length === 0 && r.pushed === 0 && r.failed === 0 && r.links.r1.sig === s0);
  }
  // (2) 변경 -> 정확히 1회, 토큰/id/새 sig, 입력 불변
  {
    const d1 = edit(d0);
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "d1", sig: s0 } };
    const snap = JSON.stringify(links);
    const r = await syncLinks({ links, decks: [d1], tables: TABLES, rpc: f.rpc });
    const t = calcDeckTotal(d1, TABLES).total;
    check("2 one rpc", f.calls.length === 1 && r.pushed === 1);
    check("2 args", f.calls[0].p_id === "r1" && f.calls[0].p_token === "t1" && f.calls[0].p_total === t && f.calls[0].p_name === "덱");
    check("2 new sig", r.links.r1.sig === sigOf(d1) && r.links.r1.sig !== s0 && r.links.r1.token === "t1");
    check("2 input not mutated", JSON.stringify(links) === snap && r.links !== links);
  }
  // (3) false -> 링크 삭제
  {
    const f = fake(() => ({ data: false, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "d1", sig: "old" } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check("3 dropped", !("r1" in r.links) && r.pushed === 0 && r.failed === 0 && "r1" in links);
  }
  // (4) 오류/throw -> 링크 유지, failed=1
  for (const [label, reply] of [
    ["error", () => ({ data: null, error: new Error("x") })],
    ["throw", () => { throw new Error("net"); }],
  ] as const) {
    const f = fake(reply);
    const links: RankLinks = { r1: { token: "t1", deckId: "d1", sig: "old" } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check(`4 ${label} kept`, r.failed === 1 && r.pushed === 0 && JSON.stringify(r.links) === JSON.stringify(links));
  }
  // (5) 레거시(sig 없음) -> 1회 푸시, 이후 안 함
  {
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "d1" } };
    const r1 = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    const r2 = await syncLinks({ links: r1.links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check("5 legacy once", f.calls.length === 1 && r1.pushed === 1 && r2.pushed === 0 && r1.links.r1.sig === s0);
  }
  // (6) 덱 없음 -> 건너뜀
  {
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "gone", sig: "x" }, r2: { token: "t2", deckId: "" } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check("6 missing deck skipped", f.calls.length === 0 && JSON.stringify(r.links) === JSON.stringify(links));
  }
  // (7) 가져온 덱의 sig 선반영 -> 수정 전엔 rpc 없음, 수정 후 정확히 1회
  {
    const imported = mkDeck("new-local");
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r9: { token: "t9", deckId: imported.id, sig: sigOf(imported) } };
    const r1 = await syncLinks({ links, decks: [imported], tables: TABLES, rpc: f.rpc });
    check("7 no rpc before edit", f.calls.length === 0);
    const r2 = await syncLinks({ links: r1.links, decks: [edit(imported)], tables: TABLES, rpc: f.rpc });
    check("7 one rpc after edit", f.calls.length === 1 && f.calls[0].p_id === "r9" && r2.pushed === 1);
  }

  console.log(`pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
}
main();
