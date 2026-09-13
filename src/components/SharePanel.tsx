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

/** 공유 + 내 덱 랭킹. 전체 공개 랭킹은 서버가 필요해서 내 덱끼리만 순위. */
export function SharePanel({
  decks, tables, activeId, onSelectDeck, onImportDeck,
}: {
  decks: Deck[];
  tables: SkillTables;
  activeId: string;
  onSelectDeck: (id: string) => void;
  onImportDeck: (d: Deck) => void;
}) {
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");
  const [pub, setPub] = useState<PublicRank[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  // 전체 공개 랭킹 조회
  const loadPub = async () => {
    if (!supabase) return;
    setPubLoading(true);
    try {
      const { data, error } = await supabase
        .from("rankings")
        .select("id,deck_name,total,sp,rp,bt,named,deck_json,created_at")
        .order("total", { ascending: false })
        .limit(50);
      if (error) throw error;
      setPub((data ?? []) as PublicRank[]);
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

  // 현재 덱을 전체 공개 랭킹에 등록
  const submitPub = async () => {
    if (!supabase || submitting) return;
    setSubmitting(true);
    try {
      const s = calcDeckTotal(active, tables);
      const { error } = await supabase.from("rankings").insert({
        deck_name: active.name.slice(0, 50),
        total: s.total,
        sp: s.sp,
        rp: s.rp,
        bt: s.bt,
        named: s.named,
        deck_json: JSON.parse(JSON.stringify(active)) as object,
      });
      if (error) throw error;
      alert("전체 랭킹에 등록됐습니다.");
      loadPub();
    } catch {
      alert("등록 실패 — 테이블·정책이 만들어졌는지 확인하세요.");
    } finally {
      setSubmitting(false);
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
        <h3>내 덱 랭킹</h3>
        <table>
          <thead><tr><th>#</th><th>덱</th><th>총점</th><th>선발</th><th>계투</th><th>타자</th><th>등록</th><th></th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.deck.id}>
                <td>{i + 1}</td>
                <td>{r.deck.name}{r.deck.id === activeId && " ◀"}</td>
                <td><b>{r.total.toFixed(1)}</b></td>
                <td>{r.sp.toFixed(0)}</td>
                <td>{r.rp.toFixed(0)}</td>
                <td>{r.bt.toFixed(0)}</td>
                <td>{r.named}/18</td>
                <td>{r.deck.id !== activeId && <button onClick={() => onSelectDeck(r.deck.id)}>보기</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              <button disabled={pubLoading} onClick={loadPub}>새로고침</button>
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
                      <td>{r.deck_name} <span className="muted">({r.named}/18)</span></td>
                      <td><b>{Number(r.total).toFixed(1)}</b></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td><button onClick={() => importPub(r)}>가져오기</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
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
