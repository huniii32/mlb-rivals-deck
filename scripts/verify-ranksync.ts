import { blankPlayer, DEFAULT_CHEM, LINEUP, YEAR_ANCHOR } from "../src/lib/deck";
import type { Deck } from "../src/lib/deck";
import { calcDeckTotal, flagDefaults } from "../src/lib/engine";
import { deckSig, loadLinks, rankArgs, syncLinks, type RankLinks } from "../src/lib/rankSync";

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
  const fns: string[] = [];
  return { calls, fns, rpc: async (fn: "update_ranking" | "update_ranking_owned", args: Record<string, unknown>) => { fns.push(fn); calls.push(args); return reply(); } };
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

  // (8) 코드 소유 링크 + 코드 -> update_ranking_owned(p_code, p_token 없음)
  {
    const d1 = edit(d0);
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { owned: true, deckId: "d1", sig: s0 } };
    const r = await syncLinks({ links, decks: [d1], tables: TABLES, rpc: f.rpc, code: "CODE" });
    check("8 owned rpc", f.fns.join() === "update_ranking_owned" && r.pushed === 1);
    check("8 owned args", f.calls[0].p_id === "r1" && f.calls[0].p_code === "CODE" && !("p_token" in f.calls[0]) && f.calls[0].p_total === calcDeckTotal(d1, TABLES).total);
    check("8 owned link kept, no token", r.links.r1.owned === true && r.links.r1.token === undefined && r.links.r1.sig === sigOf(d1));
  }
  // (9) 코드 없으면 소유 링크는 건너뜀 (rpc 없음, 링크 그대로, 실패 아님)
  {
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { owned: true, deckId: "d1", sig: "old" } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc });
    check("9 owned without code skipped", f.calls.length === 0 && r.pushed === 0 && r.failed === 0 && JSON.stringify(r.links) === JSON.stringify(links));
  }
  // (10) 토큰 링크는 코드가 있어도 update_ranking + p_token, p_code 없음
  {
    const f = fake(() => ({ data: true, error: null }));
    const links: RankLinks = { r1: { token: "t1", deckId: "d1", sig: "old" } };
    await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc, code: "CODE" });
    check("10 token link stays legacy", f.fns.join() === "update_ranking" && f.calls[0].p_token === "t1" && !("p_code" in f.calls[0]));
  }
  // (11) 혼합: 각자 맞는 함수
  {
    const f = fake(() => ({ data: true, error: null }));
    const d2 = mkDeck("d2");
    const links: RankLinks = { a: { token: "ta", deckId: "d1", sig: "old" }, b: { owned: true, deckId: "d2", sig: "old" } };
    const r = await syncLinks({ links, decks: [d0, d2], tables: TABLES, rpc: f.rpc, code: "CODE" });
    check("11 mixed", f.fns.join() === "update_ranking,update_ranking_owned" && f.calls[0].p_token === "ta" && f.calls[1].p_code === "CODE" && r.pushed === 2);
  }
  // (12) 소유 링크 false -> 해제 / 오류 -> 유지
  {
    const f = fake(() => ({ data: false, error: null }));
    const links: RankLinks = { r1: { owned: true, deckId: "d1", sig: "old" } };
    const r = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: f.rpc, code: "CODE" });
    check("12 owned false dropped", !("r1" in r.links) && r.pushed === 0 && "r1" in links);
    const g = fake(() => ({ data: null, error: new Error("x") }));
    const r2 = await syncLinks({ links, decks: [d0], tables: TABLES, rpc: g.rpc, code: "CODE" });
    check("12 owned error kept", r2.failed === 1 && "r1" in r2.links);
  }
  // (13) loadLinks: 소유/토큰/구형 모두 수용
  {
    const store: Record<string, string> = {
      "rivals-my-ranks-v1": JSON.stringify({ a: "old-token", b: { token: "tb", deckId: "d1", sig: "s" }, c: { owned: true, deckId: "d2", sig: "z" }, d: { deckId: "x" }, e: 5 }),
    };
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null };
    const l = loadLinks();
    check("13 legacy string", l.a.token === "old-token" && l.a.deckId === "");
    check("13 token link", l.b.token === "tb" && l.b.sig === "s" && !l.b.owned);
    check("13 owned link", l.c.owned === true && l.c.token === undefined && l.c.deckId === "d2" && l.c.sig === "z");
    check("13 invalid dropped", !("d" in l) && !("e" in l));
  }

  console.log(`pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
}
main();
