import { Fragment, useEffect, useState } from "react";
import { isDeck, normalizeDeck, MAX_PLAYERS, type Deck } from "../lib/deck";
import { type SkillTables } from "../lib/engine";
import { passwordError, passwordResult, type PasswordCredential } from "../lib/deckPassword";
import { type RankLinks } from "../lib/rankSync";
import { isSupabaseOn, RANK_COLS, supabase, watchTable, type PublicRank } from "../lib/supabase";
import { DeckCompareModal } from "./DeckCompare";
import { DeckShareModal } from "./DeckShareModal";

const pubDeck = (r: PublicRank): Deck | null => isDeck(r.deck_json) ? normalizeDeck(r.deck_json) : null;

export function SharePanel({ decks, tables, activeId, links, setLinks, code, onRestoreDeck, onSaveDeck, onImportDeck, onPreviewDeck }: {
  decks: Deck[]; tables: SkillTables; activeId: string; links: RankLinks;
  setLinks: (upd: RankLinks | ((prev: RankLinks) => RankLinks)) => void; code: string | null;
  onRestoreDeck: (d: Deck, rowId: string, credential: PasswordCredential) => void;
  onSaveDeck: () => void;
  onImportDeck: (d: Deck) => void; onPreviewDeck: (d: Deck) => void;
}) {
  const [pub, setPub] = useState<PublicRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sharing, setSharing] = useState(() => /#d=([A-Za-z0-9\-_]+)/.test(window.location.hash));
  const [deleting, setDeleting] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ name: string; deck: Deck } | null>(null);
  const [restoreRow, setRestoreRow] = useState<PublicRank | null>(null);
  const [password, setPassword] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const active = decks.find((d) => d.id === activeId) ?? decks[0];
  const closeSharing = () => {
    setSharing(false);
    if (/^#d=/.test(window.location.hash)) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  };
  const activeLinked = Object.values(links).some(l => l.deckId === active.id);
  const loadPub = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("rankings").select(RANK_COLS).order("total", { ascending: false }).limit(50);
      if (error) throw error;
      setPub((data ?? []) as PublicRank[]); setLoadError("");
    } catch { setLoadError("랭킹을 불러오지 못했습니다. 새로고침으로 다시 시도하세요."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void loadPub();
    const unwatch = watchTable("rankings", loadPub);
    const refresh = () => { void loadPub(); };
    window.addEventListener("rivals:ranking-updated", refresh);
    return () => { unwatch(); window.removeEventListener("rivals:ranking-updated", refresh); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeSharing(); setCompare(null);
      if (!restoring) { setRestoreRow(null); setPassword(""); setRestoreError(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restoring]);

  const deletePub = async (id: string) => {
    const l = links[id];
    if (!supabase || !l || deleting || !confirm("이 덱을 공개 랭킹에서 삭제할까요? 이 기기의 덱은 유지됩니다.")) return;
    setDeleting(id);
    try {
      const fn = l.password ? "delete_ranking_password" : l.owned ? "delete_ranking_owned" : "delete_ranking";
      const { data, error } = await supabase.rpc(fn, { p_id: id, ...(l.owned ? { p_code: code } : { p_token: l.token }) });
      if (error) throw error;
      if (!data) throw new Error("ownership_required");
      setLinks((prev) => { const next = { ...prev }; delete next[id]; return next; });
      void loadPub();
      setExpanded(null);
    } catch (e) { alert(passwordError(e)); }
    finally { setDeleting(null); }
  };
  const closeRestore = () => { if (!restoring) { setRestoreRow(null); setPassword(""); setRestoreError(""); } };
  const restore = async () => {
    if (!supabase || !restoreRow || restoring) return;
    setRestoring(true); setRestoreError("");
    try {
      const { data, error } = await supabase.rpc("restore_ranking_password", { p_id: restoreRow.id, p_password: password });
      if (error) throw error;
      const result = passwordResult(data);
      if (!result.deck) throw new Error("invalid_deck");
      onRestoreDeck(result.deck, result.id, { token: result.token, password: true });
      setRestoreRow(null); setPassword("");
    } catch (e) { setRestoreError(passwordError(e)); }
    finally { setRestoring(false); }
  };
  const withPubDeck = (r: PublicRank, fn: (d: Deck) => void) => {
    const d = pubDeck(r); if (d) fn(d); else alert("이 덱은 미리보기를 지원하지 않습니다.");
  };
  return <section className="ranking-page" aria-label="덱랭킹">
    <div className="card ranking-board">
      <header className="ranking-header">
        <div><p className="ranking-eyebrow">PUBLIC RANKING</p><h2>덱 랭킹</h2><p className="muted">랭킹대전 기준 · 총점순 상위 50개</p></div>
        <div className="ranking-header-actions"><button onClick={() => setSharing(true)}>링크 공유</button><button className="primary" onClick={onSaveDeck}>{activeLinked ? "현재 덱 갱신" : "현재 덱 등록"}</button></div>
      </header>
      <div className="ranking-list-bar"><span>덱 이름을 누르면 상세 메뉴가 열립니다.</span>
        {isSupabaseOn() && <button disabled={loading} onClick={() => void loadPub()}>{loading ? "불러오는 중…" : "새로고침"}</button>}
      </div>
      {!isSupabaseOn() ? <div className="ranking-empty"><h3>온라인 랭킹이 연결되지 않았습니다.</h3><p>덱은 이 기기에 저장할 수 있습니다.</p></div> : <>
        {loadError && <p role="alert" className="bad">{loadError}</p>}
        {pub.length === 0 ? <div className="ranking-empty" role="status">
          {loading ? "랭킹을 불러오는 중입니다." : loadError ? "새로고침을 눌러 다시 시도하세요." : <><h3>아직 등록된 덱이 없습니다.</h3><p>현재 덱을 등록해 첫 랭킹을 남겨보세요.</p></>}
        </div> : <table className="ranking-table" aria-label="공개 덱 랭킹">
          <colgroup><col className="ranking-rank-col" /><col /><col className="ranking-score-col" /><col className="ranking-date-col" /></colgroup>
          <thead><tr><th scope="col">순위</th><th scope="col">덱</th><th scope="col">총점</th><th scope="col" className="ranking-date">등록일</th></tr></thead>
          <tbody>{pub.map((r, i) => <Fragment key={r.id}>
            <tr className={expanded === r.id ? "ranking-selected" : ""}>
              <td><span className={`ranking-number ${i < 3 ? "ranking-top" : ""}`}>{i + 1}</span></td>
              <td><button className="ranking-deck-toggle" aria-label={`${r.deck_name} 덱 메뉴`} aria-expanded={expanded === r.id} aria-controls={`ranking-actions-${r.id}`} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span className="ranking-deck-info"><strong>{r.deck_name}</strong><span className="ranking-deck-meta">{r.named}/{pubDeck(r)?.players.length ?? MAX_PLAYERS}명{links[r.id] && <span className="ranking-managed">관리 중</span>}</span></span>
                <span className="ranking-chevron" aria-hidden="true">{expanded === r.id ? "⌃" : "⌄"}</span>
              </button></td>
              <td className="ranking-score">{Number(r.total).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
              <td className="ranking-date">{new Date(r.created_at).toLocaleDateString("ko-KR")}</td>
            </tr>
            {expanded === r.id && <tr className="ranking-expanded" id={`ranking-actions-${r.id}`}><td colSpan={4}>
              <div className="ranking-row-actions">
                <button onClick={() => withPubDeck(r, onPreviewDeck)}>라인업 보기</button>
                <button onClick={() => withPubDeck(r, d => setCompare({ name: r.deck_name, deck: d }))}>현재 덱과 비교</button>
                <button className="primary" onClick={() => { setRestoreRow(r); setPassword(""); setRestoreError(""); }}>비밀번호로 가져오기</button>
                {links[r.id] && <button className="ranking-delete" disabled={deleting === r.id} onClick={() => void deletePub(r.id)}>{deleting === r.id ? "삭제 중…" : "랭킹에서 삭제"}</button>}
              </div>
            </td></tr>}
          </Fragment>)}</tbody>
        </table>}
      </>}
      <p className="ranking-footnote">같은 이름·같은 비밀번호로 저장하면 기존 랭킹이 갱신됩니다.</p>
    </div>
    {sharing && <DeckShareModal deck={active} onImport={onImportDeck} onSave={onSaveDeck} close={closeSharing} />}
    {compare && <DeckCompareModal myName={active.name || "저장 전 덱"} myDeck={active} otherName={compare.name} otherDeck={compare.deck} tables={tables} close={() => setCompare(null)} />}
    {restoreRow && <div className="modal-overlay" onClick={closeRestore}><form role="dialog" aria-label="랭킹 덱 가져오기" className="card modal-box deck-save-form" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void restore(); }}>
      <h3>{restoreRow.deck_name} 가져오기</h3>
      <p>저장할 때 정한 비밀번호를 입력하세요. 가져온 뒤 수정하면 같은 랭킹 글에 반영됩니다.</p>
      <label>비밀번호 <input aria-label="가져올 덱 비밀번호" type="password" inputMode="numeric" placeholder="숫자 4자리" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus maxLength={128} /></label>
      <p className="muted">새 비밀번호는 숫자 4자리입니다. 이전에 긴 비밀번호로 저장한 덱은 기존 비밀번호를 입력하세요.</p>
      {restoreError && <p role="alert" className="bad">{restoreError}</p>}
      <div className="row"><button className="primary" type="submit" disabled={restoring}>{restoring ? "확인 중…" : "덱 가져오기"}</button><button type="button" disabled={restoring} onClick={closeRestore}>취소</button></div>
    </form></div>}
  </section>;
}
