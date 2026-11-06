import { useEffect, useMemo, useState } from "react";
import { isDeck, normalizeDeck, MAX_PLAYERS, type Deck } from "../lib/deck";
import { calcDeckTotal, type SkillTables } from "../lib/engine";
import { passwordError, passwordResult, validDeckName, type PasswordCredential } from "../lib/deckPassword";
import { type RankLinks } from "../lib/rankSync";
import { isSupabaseOn, RANK_COLS, supabase, watchTable, type PublicRank } from "../lib/supabase";
import { DeckCompareModal } from "./DeckCompare";

function encodeDeck(d: Deck): string {
  const bin = encodeURIComponent(JSON.stringify(d)).replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeDeck(code: string): Deck | null {
  try {
    const bytes = Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const d: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isDeck(d) ? normalizeDeck(d) : null;
  } catch { return null; }
}
const pubDeck = (r: PublicRank): Deck | null => isDeck(r.deck_json) ? normalizeDeck(r.deck_json) : null;

export function SharePanel({ decks, tables, activeId, links, setLinks, code, onRestoreDeck, onSaveDeck, onSelectDeck, onImportDeck, onPreviewDeck }: {
  decks: Deck[]; tables: SkillTables; activeId: string; links: RankLinks;
  setLinks: (upd: RankLinks | ((prev: RankLinks) => RankLinks)) => void; code: string | null;
  onRestoreDeck: (d: Deck, rowId: string, credential: PasswordCredential) => void;
  onSaveDeck: () => void; onSelectDeck: (id: string) => void;
  onImportDeck: (d: Deck) => void; onPreviewDeck: (d: Deck) => void;
}) {
  const [pub, setPub] = useState<PublicRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");
  const [compare, setCompare] = useState<{ name: string; deck: Deck } | null>(null);
  const [restoreRow, setRestoreRow] = useState<PublicRank | null>(null);
  const [password, setPassword] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const active = decks.find((d) => d.id === activeId) ?? decks[0];
  const ranking = useMemo(() => decks.filter((d) => validDeckName(d.name)).map((d) => ({ deck: d, ...calcDeckTotal(d, tables) })).sort((a, b) => b.total - a.total), [decks, tables]);
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
  useEffect(() => { if (/#d=([A-Za-z0-9\-_]+)/.test(window.location.hash)) setInput(window.location.href); }, []);

  const deletePub = async (id: string) => {
    const l = links[id];
    if (!supabase || !l || !confirm("이 덱을 공개 랭킹에서 삭제할까요? 이 기기의 덱은 유지됩니다.")) return;
    try {
      const fn = l.password ? "delete_ranking_password" : l.owned ? "delete_ranking_owned" : "delete_ranking";
      const { data, error } = await supabase.rpc(fn, { p_id: id, ...(l.owned ? { p_code: code } : { p_token: l.token }) });
      if (error) throw error;
      if (!data) throw new Error("ownership_required");
      setLinks((prev) => { const next = { ...prev }; delete next[id]; return next; });
      void loadPub();
    } catch (e) { alert(passwordError(e)); }
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
  return <div>
    <div className="card">
      <h3>전체 공개 랭킹</h3>
      <div className="row"><button className="primary" onClick={onSaveDeck}>이 덱 저장·랭킹 연결</button>
        {isSupabaseOn() && <button disabled={loading} onClick={() => void loadPub()}>새로고침</button>}
      </div>
      <p className="muted">덱 이름과 비밀번호를 정해 저장하세요. 연결한 덱은 수정 즉시 같은 랭킹 글에 반영됩니다. 다른 기기에서는 내 글의 가져오기를 눌러 비밀번호로 관리 권한을 연결하세요.</p>
      {!isSupabaseOn() ? <p className="muted">온라인 랭킹이 연결되지 않아 현재는 이 기기에 저장합니다.</p> : <>
        {loadError && <p role="alert" className="bad">{loadError}</p>}
        {pub.length === 0 ? <p className="muted">{loading ? "불러오는 중…" : "등록된 덱이 없습니다."}</p> :
          <div className="table-scroll"><table>
            <thead><tr><th>#</th><th>덱</th><th>총점</th><th>등록</th><th></th></tr></thead>
            <tbody>{pub.map((r, i) => <tr key={r.id}>
              <td>{i + 1}</td><td>{r.deck_name} <span className="muted">({r.named}/{pubDeck(r)?.players.length ?? MAX_PLAYERS})</span>{links[r.id] && <span className="pill">관리 중</span>}</td>
              <td><b>{Number(r.total).toFixed(1)}</b></td><td>{new Date(r.created_at).toLocaleDateString("ko-KR")}</td>
              <td className="rank-actions"><button onClick={() => withPubDeck(r, onPreviewDeck)}>보기</button>
                <button onClick={() => { setRestoreRow(r); setPassword(""); setRestoreError(""); }}>가져오기</button>
                <button onClick={() => withPubDeck(r, (d) => setCompare({ name: r.deck_name, deck: d }))}>비교</button>
                {links[r.id] && <button onClick={() => void deletePub(r.id)}>삭제</button>}
              </td>
            </tr>)}</tbody>
          </table></div>}
      </>}
    </div>
    <div className="card"><h3>내 덱 랭킹</h3>
      {ranking.length === 0 ? <p className="muted">덱 이름을 정하고 저장하면 여기에 표시됩니다.</p> : <div className="table-scroll"><table>
        <thead><tr><th>#</th><th>덱</th><th>총점</th><th>선발</th><th>계투</th><th>타자</th><th>등록</th><th></th></tr></thead>
        <tbody>{ranking.map((r, i) => <tr key={r.deck.id}>
          <td>{i + 1}</td><td>{r.deck.name}{r.deck.id === activeId && " ◀"}</td><td><b>{r.total.toFixed(1)}</b></td><td>{r.sp.toFixed(1)}</td><td>{r.rp.toFixed(1)}</td><td>{r.bt.toFixed(1)}</td><td>{r.named}/{r.deck.players.length}</td>
          <td className="rank-actions"><button onClick={() => onPreviewDeck(r.deck)}>보기</button>{r.deck.id !== activeId && <><button onClick={() => onSelectDeck(r.deck.id)}>선택</button><button onClick={() => setCompare({ name: r.deck.name, deck: r.deck })}>비교</button></>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    <div className="card"><h3>덱 공유하기</h3>
      <p className="muted">공유 링크는 덱의 복사본을 전달합니다. 원래 랭킹 글의 관리 권한이나 비밀번호는 포함하지 않습니다.</p>
      <button onClick={() => { if (!validDeckName(active.name)) { onSaveDeck(); return; } setLink(`${window.location.origin}${window.location.pathname}#d=${encodeDeck(active)}`); }}>공유 링크 만들기</button>
      {link && <p style={{ wordBreak: "break-all" }}><a href={link}>{link}</a></p>}
      {link && <button onClick={() => void navigator.clipboard.writeText(link)}>복사</button>}
      <div className="row" style={{ marginTop: 8 }}><input style={{ flex: 1 }} placeholder="공유 링크 또는 코드 붙여넣기" value={input} onChange={(e) => setInput(e.target.value)} />
        <button onClick={() => { const m = input.match(/#d=([A-Za-z0-9\-_]+)/); const d = decodeDeck(m ? m[1] : input.trim()); if (!d) { alert("공유 코드 해석 실패"); return; } onImportDeck(d); setInput(""); }}>가져오기</button>
      </div>
    </div>
    {compare && <DeckCompareModal myName={active.name || "저장 전 덱"} myDeck={active} otherName={compare.name} otherDeck={compare.deck} tables={tables} close={() => setCompare(null)} />}
    {restoreRow && <div className="modal-overlay" onClick={closeRestore}><form className="card modal-box deck-save-form" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void restore(); }}>
      <h3>{restoreRow.deck_name} 가져오기</h3>
      <p>저장할 때 정한 비밀번호를 입력하세요. 가져온 뒤 수정하면 같은 랭킹 글에 반영됩니다.</p>
      <label>비밀번호 <input aria-label="가져올 덱 비밀번호" type="password" inputMode="numeric" placeholder="숫자 4자리" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus maxLength={128} /></label>
      <p className="muted">새 비밀번호는 숫자 4자리입니다. 이전에 긴 비밀번호로 저장한 덱은 기존 비밀번호를 입력하세요.</p>
      {restoreError && <p role="alert" className="bad">{restoreError}</p>}
      <div className="row"><button className="primary" type="submit" disabled={restoring}>{restoring ? "확인 중…" : "덱 가져오기"}</button><button type="button" disabled={restoring} onClick={closeRestore}>취소</button></div>
    </form></div>}
  </div>;
}
