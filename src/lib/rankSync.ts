import { useEffect, useRef, useState } from "react";
import type { Deck } from "./deck";
import { calcDeckTotal, type SkillTables } from "./engine";
import { loadOwnerCode, saveOwnerCode } from "./ownerCode";
import { supabase } from "./supabase";

const KEY = "rivals-my-ranks-v1";

/** 서버 랭킹 행 하나와 연결된 로컬 덱. sig = 마지막으로 서버에 반영한 내용의 해시.
 *  token(레거시, 행별 비밀) 또는 owned(내 덱 코드 소유) 중 하나 */
export interface RankLink { token?: string; owned?: boolean; deckId: string; sig?: string }
/** 키 = 서버 행 id (이 브라우저에만 보관) */
export type RankLinks = Record<string, RankLink>;

export function loadLinks(): RankLinks {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, unknown>;
    const out: RankLinks = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") out[k] = { token: v, deckId: "" }; // 구형: 토큰만 저장
      else if (v && typeof v === "object") {
        const o = v as { token?: unknown; owned?: unknown; deckId?: unknown; sig?: unknown };
        const deckId = typeof o.deckId === "string" ? o.deckId : "";
        if (o.owned === true) out[k] = { owned: true, deckId };
        else if (typeof o.token === "string") out[k] = { token: o.token, deckId };
        else continue;
        if (typeof o.sig === "string") out[k].sig = o.sig;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 랭킹 행 갱신/등록 rpc 공통 인자: 총점 스냅샷 + 덱 JSON (s는 서버 행과 비교용) */
export function rankArgs(d: Deck, tables: SkillTables) {
  const s = calcDeckTotal(d, tables);
  return {
    s,
    args: {
      p_name: d.name.slice(0, 50),
      p_total: s.total, p_sp: s.sp, p_rp: s.rp, p_bt: s.bt, p_named: s.named,
      p_deck: JSON.parse(JSON.stringify(d)) as object,
    },
  };
}

/** 인자 → 짧은 문자열 해시 (fnv1a 32bit + 길이). 같은 입력이면 항상 같은 값 */
export function deckSig(args: object): string {
  const json = JSON.stringify(args);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(36)}.${json.length.toString(36)}`;
}

type Rpc = (fn: "update_ranking" | "update_ranking_owned", args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** 바뀐 연동 덱만 서버에 반영. 성공=sig 갱신, 행이 사라짐(false)=연동 해제, 오류=그대로 두고 다음 기회에 재시도 */
export async function syncLinks(opts: {
  links: RankLinks; decks: Deck[]; tables: SkillTables; rpc: Rpc; code?: string;
}): Promise<{ links: RankLinks; pushed: number; failed: number }> {
  const links = { ...opts.links };
  let pushed = 0, failed = 0;
  for (const [id, link] of Object.entries(opts.links)) {
    const deck = opts.decks.find((d) => d.id === link.deckId);
    if (!deck) continue;
    if (link.owned && !opts.code) continue; // 코드 없으면 소유 글은 반영 불가 — 건너뜀
    const { args } = rankArgs(deck, opts.tables);
    const sig = deckSig(args);
    if (link.sig === sig) continue;
    try {
      const { data, error } = link.owned
        ? await opts.rpc("update_ranking_owned", { p_id: id, p_code: opts.code, ...args })
        : await opts.rpc("update_ranking", { p_id: id, p_token: link.token, ...args });
      if (error) failed++;
      else if (data) { links[id] = { ...link, sig }; pushed++; }
      else delete links[id];
    } catch {
      failed++;
    }
  }
  return { links, pushed, failed };
}

export type RankSyncStatus = "idle" | "syncing" | "ok" | "error";
const DEBOUNCE_MS = 3000;

/** 앱 전역 자동 반영: 연동된 덱이 바뀌면 마지막 변경 3초 뒤 조용히 서버 행 갱신 */
export function useRankSync(decks: Deck[], tables: SkillTables) {
  const [links, setLinksState] = useState(loadLinks);
  const [code, setCodeState] = useState(loadOwnerCode);
  const [status, setStatusState] = useState<RankSyncStatus>("idle");
  const st = useRef<RankSyncStatus>("idle"); // run 클로저에서 최신 상태를 읽기 위한 ref
  const setStatus = (s: RankSyncStatus) => { st.current = s; setStatusState(s); };
  // 디바운스 콜백에서 최신 값을 쓰기 위한 ref
  const cur = useRef({ decks, tables, links, code });
  cur.current = { decks, tables, links, code };
  const busy = useRef(false);
  const again = useRef(false);

  // 함수형 갱신 지원: 비동기 콜백(파일 읽기 등)에서도 최신 연결 목록 위에 덧붙이도록
  const setLinks = (upd: RankLinks | ((prev: RankLinks) => RankLinks)) => {
    const next = typeof upd === "function" ? upd(cur.current.links) : upd;
    cur.current.links = next;
    setLinksState(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const setCode = (c: string) => {
    cur.current.code = c;
    setCodeState(c);
    saveOwnerCode(c);
  };

  const run = async () => {
    const sb = supabase;
    if (!sb) return;
    if (busy.current) { again.current = true; return; } // 진행 중이면 끝난 뒤 한 번 더
    busy.current = true;
    try {
      do {
        again.current = false;
        const snap = cur.current.links;
        if (!Object.keys(snap).length) break;
        const before = st.current;
        setStatus("syncing");
        const res = await syncLinks({
          links: snap, decks: cur.current.decks, tables: cur.current.tables,
          rpc: async (fn, args) => await sb.rpc(fn, args),
          code: cur.current.code ?? undefined,
        });
        // 실행 중 링크가 바뀌었을 수 있으니 결과(sig 갱신/해제)만 최신 링크에 합침
        if (res.pushed || Object.keys(res.links).length !== Object.keys(snap).length) {
          const next = { ...cur.current.links };
          for (const id of Object.keys(snap)) {
            if (!res.links[id]) delete next[id];
            else if (next[id]?.deckId === res.links[id].deckId) next[id] = { ...next[id], sig: res.links[id].sig };
          }
          setLinks(next);
        }
        if (res.failed) setStatus("error");
        else if (res.pushed) setStatus("ok");
        else setStatus(before === "syncing" ? "idle" : before);
      } while (again.current);
    } finally {
      busy.current = false;
    }
  };

  const linked = Object.entries(links).map(([id, l]) => `${id}:${l.deckId}`).join();
  useEffect(() => {
    if (!supabase || !linked) return;
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [decks, tables, linked, code]);

  return { links, setLinks, status, code, setCode };
}
