import { useEffect, useMemo, useState } from "react";
import type { Deck } from "../App";
import type { SkillTables } from "../lib/engine";
import { calcDeckTotal } from "../lib/engine";
import { isSupabaseOn, supabase, type PublicRank } from "../lib/supabase";

function encodeDeck(d: Deck): string {
  const json = JSON.stringify(d);
  const bin = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDeck(code: string): Deck | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const d = JSON.parse(json) as Deck;
    if (!d || !Array.isArray(d.players) || d.players.length !== 18) return null;
    return d;
  } catch {
    return null;
  }
}

/** 공유 + 내 덱 랭킹 + 전체 공개 랭킹 */
export function SharePanel({
  decks, tables, activeId, onSelectDeck, onImportDeck, onPreviewDeck,
}: {
  decks: Deck[];
  tables: SkillTables;
  activeId: string;
  onSelectDeck: (id: string) => void;
  onImportDeck: (d: Deck) => void;
  onPreviewDeck: (d: Deck) => void;
}) {
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");
  const [pub, setPub] = useState<PublicRank[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 내가 올린 공개글 id → { 삭제 토큰, 로컬 덱 id } (이 브라우저에만 보관)
  const [mine, setMine] = useState<Record<string, { token: string; deckId: string }>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("rivals-my-ranks-v1") || "{}") as Record<string, unknown>;
      const out: Record<string, { token: string; deckId: string }> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") out[k] = { token: v, deckId: "" };
        else if (v && typeof v === "object") {
          const o = v as { token?: unknown; deckId?: unknown };
          if (typeof o.token === "string") out[k] = { token: o.token, deckId: typeof o.deckId === "string" ? o.deckId : "" };
        }
      }
      return out;
    } catch {
      return {};
    }
  });
  const saveMine = (next: Record<string, { token: string; deckId: string }>) => {
    setMine(next);
    localStorage.setItem("rivals-my-ranks-v1", JSON.stringify(next));
  };

  const ranking = useMemo(
    () =>
      decks
        .map((d) => ({ deck: d, ...calcDeckTotal(d, tables) }))
        .sort((a, b) => b.total - a.total),
    [decks, tables],
  );
  const active = decks.find((d) => d.id === activeId) ?? decks[0];

  const make = () => {
    const code = encodeDeck(active);
    setLink(`${window.location.origin}${window.location.pathname}#d=${code}`);
  };
  const importFrom = (text: string) => {
    const m = text.match(/#d=([A-Za-z0-9\-_]+)/);
    const deck = decodeDeck(m ? m[1] : text.trim());
    if (!deck) {
      alert("공유 코드解析 실패");
      return;
    }
    onImportDeck(deck);
    setInput("");
  };

  // 공유 링크로 들어오면 자동 인식
  useEffect(() => {
    const m = window.location.hash.match(/#d=([A-Za-z0-9\-_]+)/);
    if (m) setInput(window.location.href);
  }, []);

  // 전체 공개 랭킹 조회 + 내가 올린 글은 로컬 덱과 자동 동기화
  const loadPub = async (mineNow?: Record<string, { token: string; deckId: string }>) => {
    if (!supabase) return;
    setPubLoading(true);
    try {
      const { data, error } = await supabase
        .from("rankings")
        .select("id,deck_name,total,sp,rp,bt,named,deck_json,created_at")
        .order("total", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as PublicRank[];
      setPub(rows);
      // 자동 반영: 연결된 로컬 덱이 바뀌었으면 서버 행 갱신
      const links = mineNow ?? mine;
      let changed = false;
      for (const r of rows) {
        const link = links[r.id];
        if (!link?.token || !link.deckId) continue;
        const local = decks.find((d) => d.id === link.deckId);
        if (!local) continue;
        const s = calcDeckTotal(local, tables);
        const name = local.name.slice(0, 50);
        if (r.deck_name === name && Number(r.total) === s.total && Number(r.sp) === s.sp &&
            Number(r.rp) === s.rp && Number(r.bt) === s.bt && r.named === s.named) continue;
        try {
          const { data: ok, error: uerr } = await supabase.rpc("update_ranking", {
            p_id: r.id, p_token: link.token, p_name: name,
            p_total: s.total, p_sp: s.sp, p_rp: s.rp, p_bt: s.bt, p_named: s.named,
            p_deck: JSON.parse(JSON.stringify(local)) as object,
          });
          if (!uerr && ok) changed = true;
        } catch {
          // 개별 동기화 실패는 무시 (다음 새로고침 때 재시도)
        }
      }
      if (changed) {
        const { data: again } = await supabase
          .from("rankings")
          .select("id,deck_name,total,sp,rp,bt,named,deck_json,created_at")
          .order("total", { ascending: false })
          .limit(50);
        if (again) setPub(again as PublicRank[]);
      }
    } catch {
      // 조회 실패는 조용히 무시 (미연동·RLS 전 상태)
    } finally {
      setPubLoading(false);
    }
  };
  useEffect(() => {
    loadPub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 현재 덱을 전체 공개 랭킹에 등록 (삭제용 토큰 함께 저장)
  const submitPub = async () => {
    if (!supabase || submitting) return;
    setSubmitting(true);
    try {
      const s = calcDeckTotal(active, tables);
      const token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) as string;
      const { data, error } = await supabase.from("rankings").insert({
        deck_name: active.name.slice(0, 50),
        total: s.total,
        sp: s.sp,
        rp: s.rp,
        bt: s.bt,
        named: s.named,
        deck_json: JSON.parse(JSON.stringify(active)) as object,
        owner_token: token,
      }).select("id").single();
      if (error) throw error;
      if (data && typeof data.id === "string") {
        const next = { ...mine, [data.id]: { token, deckId: active.id } };
        saveMine(next);
        loadPub(next);
      } else {
        loadPub();
      }
      alert("전체 랭킹에 등록됐습니다.");
    } catch {
      alert("등록 실패 — 테이블·정책이 만들어졌는지 확인하세요.");
    } finally {
      setSubmitting(false);
    }
  };

  // 내가 올린 글만 삭제 (토큰 일치해야 서버에서 지워짐)
  const deletePub = async (id: string) => {
    if (!supabase) return;
    const token = mine[id]?.token;
    if (!token) return;
    if (!confirm("등록한 덱을 전체 랭킹에서 삭제할까요?")) return;
    try {
      const { data, error } = await supabase.rpc("delete_ranking", { p_id: id, p_token: token });
      if (error) throw error;
      if (!data) {
        alert("삭제 실패 — 이미 지워졌거나 마이그레이션 SQL이 필요합니다.");
        return;
      }
      const next = { ...mine };
      delete next[id];
      saveMine(next);
      loadPub();
    } catch {
      alert("삭제 실패 — 마이그레이션 SQL(supabase_mig_ranking_delete.sql)을 실행했는지 확인하세요.");
    }
  };

  const importPub = (r: PublicRank) => {
    const d = r.deck_json as Deck | null;
    if (!d || !Array.isArray(d.players) || d.players.length !== 18) {
      alert("덱 형식이 아닙니다.");
      return;
    }
    onImportDeck(d);
  };

  return (
    <div>
      <div className="card">
        <h3>전체 공개 랭킹</h3>
        {!isSupabaseOn() ? (
          <p className="muted">Supabase 미연동 — 로컬에서만 동작 중. 연동하면 전세계 덱이 여기 뜹니다.</p>
        ) : (
          <>
            <div className="row">
              <button className="primary" disabled={submitting} onClick={submitPub}>
                {submitting ? "등록 중…" : `내 덱(${active.name}) 등록하기`}
              </button>
              <button disabled={pubLoading} onClick={() => loadPub()}>새로고침</button>
            </div>
            {pub.length === 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>
                {pubLoading ? "불러오는 중…" : "아직 등록된 덱이 없습니다. 첫 등록자가 되어보세요."}
              </p>
            ) : (
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>#</th><th>덱</th><th>총점</th><th>등록</th><th></th></tr></thead>
                <tbody>
                  {pub.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{r.deck_name} <span className="muted">({r.named}/18)</span>
                        {mine[r.id] && <span className="pill">내 글</span>}
                      </td>
                      <td><b>{Number(r.total).toFixed(1)}</b></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => importPub(r)}>가져오기</button>{" "}
                        {mine[r.id] && <button onClick={() => deletePub(r.id)}>삭제</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      <div className="card">
        <h3>내 덱 랭킹</h3>
        <table>
          <thead><tr><th>#</th><th>덱</th><th>총점</th><th>선발</th><th>계투</th><th>타자</th><th>등록</th><th></th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.deck.id}>
                <td>{i + 1}</td>
                <td>{r.deck.name}{r.deck.id === activeId && " ◀"}</td>
                <td><b>{r.total.toFixed(1)}</b></td>
                <td>{r.sp.toFixed(1)}</td>
                <td>{r.rp.toFixed(1)}</td>
                <td>{r.bt.toFixed(1)}</td>
                <td>{r.named}/18</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => onPreviewDeck(r.deck)}>보기</button>{" "}
                  {r.deck.id !== activeId && <button onClick={() => onSelectDeck(r.deck.id)}>선택</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>덱 공유하기</h3>
        <p className="muted">현재 덱({active.name})을 링크에 담아 공유. 받는 쪽은 링크를 열어 가져오면 자기 덱 목록에 추가됨.</p>
        <div className="row">
          <button className="primary" onClick={make}>공유 링크 만들기</button>
          {link && <button onClick={() => navigator.clipboard.writeText(link)}>복사</button>}
        </div>
        {link && <p style={{ wordBreak: "break-all" }}><a href={link}>{link.slice(0, 90)}…</a></p>}
        <div className="row" style={{ marginTop: 8 }}>
          <input style={{ flex: 1 }} placeholder="공유 링크 또는 코드 붙여넣기" value={input}
            onChange={(e) => setInput(e.target.value)} />
          <button onClick={() => importFrom(input)}>가져오기</button>
        </div>
        <p className="muted">불특정다수 전체 랭킹(서버 집계)은 백엔드가 필요해서 아직 없음. 링크 공유로 덱 자랑은 가능.</p>
      </div>
    </div>
  );
}
