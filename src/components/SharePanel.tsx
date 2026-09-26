import { useEffect, useMemo, useState } from "react";
import { isDeck, type Deck } from "../lib/deck";
import type { SkillTables } from "../lib/engine";
import { calcDeckTotal } from "../lib/engine";
import { formatCode, normalizeCode } from "../lib/ownerCode";
import { deckSig, rankArgs, type RankLinks } from "../lib/rankSync";
import { DeckCompareModal } from "./DeckCompare";
import { errMessage, getClientId, isMissingRpc, isRateLimited, isSupabaseOn, RANK_COLS, supabase, uuid, watchTable, type PublicRank } from "../lib/supabase";

function encodeDeck(d: Deck): string {
  const json = JSON.stringify(d);
  const bin = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeDeck(code: string): Deck | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const d = JSON.parse(json) as unknown;
    return isDeck(d) ? d : null;
  } catch {
    return null;
  }
}

const NEED_MIG = "서버 업데이트가 아직 적용되지 않았어요 — 잠시 후 다시 시도하거나 관리자에게 알려주세요.";
const NO_CODE = "내 덱 코드가 이 기기에 없어요 — '다른 기기에서 불러오기'에 코드를 입력하세요.";

const pubDeck = (r: PublicRank): Deck | null => (isDeck(r.deck_json) ? r.deck_json : null);

/** 공유 + 내 덱 랭킹 + 전체 공개 랭킹 */
export function SharePanel({
  decks, tables, activeId, links, setLinks, code, setCode, onRestoreDeck, onSelectDeck, onImportDeck, onPreviewDeck,
}: {
  decks: Deck[];
  tables: SkillTables;
  activeId: string;
  links: RankLinks;
  setLinks: (upd: RankLinks | ((prev: RankLinks) => RankLinks)) => void;
  code: string | null;
  setCode: (c: string) => void;
  onRestoreDeck: (d: Deck, rowId: string) => void;
  onSelectDeck: (id: string) => void;
  onImportDeck: (d: Deck) => void;
  onPreviewDeck: (d: Deck) => void;
}) {
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");
  const [pub, setPub] = useState<PublicRank[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [restoreIn, setRestoreIn] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [compareWith, setCompareWith] = useState<{ name: string; deck: Deck } | null>(null);
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
      alert("공유 코드 해석 실패");
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

  // 전체 공개 랭킹 조회 (내 덱 자동 반영은 App의 useRankSync가 담당)
  const loadPub = async () => {
    if (!supabase) return;
    setPubLoading(true);
    try {
      const { data, error } = await supabase
        .from("rankings").select(RANK_COLS).order("total", { ascending: false }).limit(50);
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
    // 실시간 반영: 남이 올리면 자동 새로고침
    return watchTable("rankings", loadPub);
  }, []);

  // 현재 덱을 전체 공개 랭킹에 등록. 이미 등록해둔 덱이면(같은 deckId) 새 행 대신 기존 행을 갱신.
  const submitPub = async () => {
    if (!supabase || submitting) return;
    setSubmitting(true);
    try {
      const { args } = rankArgs(active, tables);
      let base = links;
      const existing = Object.entries(links).find(([, v]) => v.deckId === active.id);
      if (existing) {
        const [id, link] = existing;
        if (link.owned && !code) { alert(NO_CODE); return; }
        const { data: ok, error } = link.owned
          ? await supabase.rpc("update_ranking_owned", { p_id: id, p_code: code, ...args })
          : await supabase.rpc("update_ranking", { p_id: id, p_token: link.token, ...args });
        if (error) throw error;
        if (ok) {
          setLinks({ ...links, [id]: { ...link, sig: deckSig(args) } });
          loadPub();
          alert("등록해둔 덱을 최신 내용으로 갱신했습니다.");
          return;
        }
        // 서버에서 이미 지워진 행이면 로컬 매핑만 정리하고 새로 등록
        base = { ...links };
        delete base[id];
        setLinks(base);
      }
      const token = uuid();
      const { data: newId, error } = code
        ? await supabase.rpc("insert_ranking_owned", { p_client_id: getClientId(), p_code: code, ...args })
        : await supabase.rpc("insert_ranking", { p_client_id: getClientId(), p_token: token, ...args });
      if (error) throw error;
      if (typeof newId === "string") {
        setLinks({ ...base, [newId]: { ...(code ? { owned: true } : { token }), deckId: active.id, sig: deckSig(args) } });
      }
      loadPub();
      alert("전체 랭킹에 등록됐습니다.");
    } catch (e) {
      console.error(e);
      if (isRateLimited(e)) alert("너무 자주 등록하고 있어요 — 잠시 후 다시 시도하세요.");
      else if (isMissingRpc(e)) alert(code ? NEED_MIG : "등록 실패 — 마이그레이션 SQL(supabase_mig_rate_limit.sql)을 실행했는지 확인하세요.");
      else if (errMessage(e).includes("invalid_code")) alert("내 덱 코드를 서버가 인식하지 못해요 — 코드를 확인하세요.");
      else alert(`등록 실패: ${errMessage(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 내가 올린 글만 삭제 (코드 또는 토큰이 일치해야 서버에서 지워짐)
  const deletePub = async (id: string) => {
    if (!supabase) return;
    const l = links[id];
    if (l?.owned && !code) { alert(NO_CODE); return; }
    if (!l || (!l.owned && !l.token)) return;
    if (!confirm("등록한 덱을 전체 랭킹에서 삭제할까요?")) return;
    try {
      const { data, error } = l.owned
        ? await supabase.rpc("delete_ranking_owned", { p_id: id, p_code: code })
        : await supabase.rpc("delete_ranking", { p_id: id, p_token: l.token });
      if (error) throw error;
      if (!data) {
        alert("삭제 실패 — 이미 지워졌거나 마이그레이션 SQL이 필요합니다.");
        return;
      }
      const next = { ...links };
      delete next[id];
      setLinks(next);
      loadPub();
    } catch (e) {
      alert(l.owned
        ? (isMissingRpc(e) ? NEED_MIG : `삭제 실패: ${errMessage(e)}`)
        : "삭제 실패 — 마이그레이션 SQL(supabase_mig_ranking_delete.sql)을 실행했는지 확인하세요.");
    }
  };

  const codeFail = (e: unknown, what: string) =>
    alert(isRateLimited(e) ? "너무 자주 시도하고 있어요 — 잠시 후 다시 시도하세요."
      : isMissingRpc(e) ? NEED_MIG : `${what} 실패: ${errMessage(e)}`);

  // 서버가 코드를 만들어 1회만 돌려줌 → 저장 후 토큰으로 연결돼 있던 기존 글을 코드로 이관
  const createCode = async () => {
    if (!supabase || codeBusy) return;
    setCodeBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_owner", { p_client_id: getClientId() });
      if (error) throw error;
      const c = typeof data === "string" ? normalizeCode(data) : null;
      if (!c) throw new Error("서버 응답 형식 오류");
      setCode(c);
      setShowCode(true);
      let n = 0;
      for (const [id, l] of Object.entries(links)) {
        if (!l.token) continue;
        const { data: ok, error: e2 } = await supabase.rpc("claim_ranking", { p_id: id, p_token: l.token, p_code: c });
        if (e2 || !ok) continue; // 실패한 글은 토큰 연동 그대로 유지
        n++;
        setLinks((prev) => (prev[id] ? { ...prev, [id]: { deckId: prev[id].deckId, owned: true, sig: prev[id].sig } } : prev));
      }
      alert(`내 덱 코드를 만들었어요 — 꼭 따로 적어 두세요.${n ? `\n기존 글 ${n}개를 코드에 연결했어요` : ""}`);
    } catch (e) {
      codeFail(e, "코드 만들기");
    } finally {
      setCodeBusy(false);
    }
  };

  // 다른 기기: 코드로 내 글 목록을 받아 로컬 덱으로 복원 (이미 연결된 글은 건너뜀)
  const restore = async () => {
    const c = normalizeCode(restoreIn);
    if (!c) { alert("코드 형식이 올바르지 않아요"); return; }
    if (!supabase || codeBusy) return;
    if (code && code !== c && !confirm("이 기기의 내 덱 코드를 입력한 코드로 바꿀까요?")) return;
    setCodeBusy(true);
    try {
      const { data, error } = await supabase.rpc("list_my_rankings", { p_code: c });
      if (error) throw error;
      const rows = (data ?? []) as PublicRank[];
      if (!rows.length) { alert("이 코드로 등록된 글이 없어요"); return; }
      let n = 0;
      for (const r of rows) {
        const l = links[r.id];
        if (l && decks.some((d) => d.id === l.deckId)) {
          // 이미 이 기기에 있는 글: 토큰 연결이 남아 있으면 서버 기준(코드 소유)으로 전환
          if (!l.owned) setLinks((prev) => (prev[r.id] ? { ...prev, [r.id]: { deckId: l.deckId, owned: true, sig: prev[r.id].sig } } : prev));
          continue;
        }
        if (!isDeck(r.deck_json)) continue;
        onRestoreDeck(r.deck_json, r.id);
        n++;
      }
      setCode(c);
      setRestoreIn("");
      alert(`내 글 ${n}개를 불러왔어요`);
    } catch (e) {
      codeFail(e, "불러오기");
    } finally {
      setCodeBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(formatCode(code ?? ""));
      alert("복사했어요");
    } catch {
      setShowCode(true);
      alert("복사하지 못했어요 — '보기'를 눌러 직접 복사하세요.");
    }
  };

  const withPubDeck = (r: PublicRank, fn: (d: Deck) => void) => {
    const d = pubDeck(r);
    if (d) fn(d);
    else alert("덱 형식이 아닙니다.");
  };

  const shownCode = code ? formatCode(code) : "";
  return (
    <div>
      {isSupabaseOn() && (
        <div className="card">
          <h3>내 덱 코드</h3>
          {code ? (
            <>
              <div className="row">
                <code>{showCode ? shownCode : "•••••-•••••-•••••-•••••"}</code>
                <button onClick={() => setShowCode(!showCode)}>{showCode ? "숨기기" : "보기"}</button>
                <button onClick={copyCode}>복사</button>
              </div>
              <p><b>이 코드를 아는 사람은 내 랭킹 글을 고치거나 지울 수 있어요. 다른 사람에게 알려주지 마세요.</b></p>
            </>
          ) : (
            <>
              <p className="muted">코드 하나로 어느 기기에서든 내 랭킹 글을 이어서 고칠 수 있어요. 잃어버리면 복구할 수 없어요.</p>
              <div className="row">
                <button className="primary" disabled={codeBusy} onClick={createCode}>내 덱 코드 만들기</button>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <input style={{ flex: 1 }} autoComplete="off" placeholder="다른 기기에서 불러오기 — 내 덱 코드 입력" value={restoreIn}
              onChange={(e) => setRestoreIn(e.target.value)} />
            <button disabled={codeBusy} onClick={restore}>불러오기</button>
          </div>
        </div>
      )}
      <div className="card">
        <h3>전체 공개 랭킹</h3>
        {!isSupabaseOn() ? (
          <p className="muted">Supabase 미연동 — 로컬에서만 동작 중. 연동하면 전세계 덱이 여기 뜹니다.</p>
        ) : (
          <>
            <div className="row">
              <button className="primary" disabled={submitting} onClick={submitPub}>
                {submitting
                  ? "처리 중…"
                  : Object.values(links).some((v) => v.deckId === active.id)
                    ? `내 덱(${active.name}) 갱신하기`
                    : `내 덱(${active.name}) 등록하기`}
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
                        {links[r.id] && <span className="pill">내 글</span>}
                      </td>
                      <td><b>{Number(r.total).toFixed(1)}</b></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => withPubDeck(r, onPreviewDeck)}>보기</button>{" "}
                        <button onClick={() => withPubDeck(r, onImportDeck)}>가져오기</button>{" "}
                        <button onClick={() => { const d = pubDeck(r); if (d) setCompareWith({ name: r.deck_name, deck: d }); }}>비교</button>{" "}
                        {links[r.id] && <button onClick={() => deletePub(r.id)}>삭제</button>}
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
                  {r.deck.id !== activeId && <button onClick={() => onSelectDeck(r.deck.id)}>선택</button>}{" "}
                  {r.deck.id !== activeId && <button onClick={() => setCompareWith({ name: r.deck.name, deck: r.deck })}>비교</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compareWith && (
        <DeckCompareModal
          myName={active.name} myDeck={active}
          otherName={compareWith.name} otherDeck={compareWith.deck}
          tables={tables} close={() => setCompareWith(null)}
        />
      )}
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
