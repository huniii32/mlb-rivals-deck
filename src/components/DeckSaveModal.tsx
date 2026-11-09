import { useState } from "react";
import { validDeckName, validDeckPassword } from "../lib/deckPassword";
import type { PlayerInput } from "../lib/engine";
import { rankingEligibility, RANKING_REQUIREMENT } from "../lib/rankingEligibility";

export function DeckSaveModal({ initialName, needsPassword, remote, linked, players, save, close }: {
  initialName: string; needsPassword: boolean; remote: boolean; linked: boolean;
  players: PlayerInput[];
  save: (name: string, password: string, publish: boolean) => Promise<void>; close: () => void;
}) {
  const [publish, setPublish] = useState(remote);
  const passwordRequired = publish && needsPassword;
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const roster = rankingEligibility(players);
  return <div className="modal-overlay" onClick={() => !busy && close()}>
    <form className="card modal-box deck-save-form" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
      e.preventDefault();
      if (!validDeckName(name)) { setError("덱 이름을 1~50자로 입력하세요."); return; }
      if (publish && !roster.eligible) { setError(roster.message); return; }
      if (passwordRequired && (!validDeckPassword(password) || password !== confirm)) { setError(password !== confirm ? "비밀번호가 서로 다릅니다." : "비밀번호는 숫자 4자리로 입력하세요."); return; }
      setBusy(true); setError("");
      try { await save(name.trim(), password, publish); close(); } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
      finally { setBusy(false); }
    }}>
      <h3>덱 저장</h3>
      <label>덱 이름 <input aria-label="저장할 덱 이름" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus /></label>
      {remote && !linked && <label className="row"><input type="checkbox" checked={publish} onChange={e => { setPublish(e.target.checked); setError(""); }} />공개 랭킹에도 연결</label>}
      {publish && <section className="ranking-roster-guide" aria-label="공개 덱 등록 조건">
        <strong>공개 등록·업데이트 조건</strong>
        <p>{RANKING_REQUIREMENT}</p>
        <div className="ranking-roster-counts">{roster.groups.map(g => <span key={g.key} className={g.count >= g.required ? "is-complete" : "is-missing"}>{g.label} <b>{g.count} / {g.required}</b></span>)}</div>
        <p className={roster.eligible ? "muted" : "bad"}>{roster.message}</p>
        <small>선수 이름을 입력한 슬롯 기준입니다. 중계투수는 승리조·추격조·롱릴리프를 합산합니다. {linked ? "작성 중인 내용은 기기에 자동 저장됩니다." : "작성 중이라면 ‘공개 랭킹에도 연결’을 해제하고 기기에만 저장할 수 있습니다."}</small>
      </section>}
      {passwordRequired && <>
        <label>덱 비밀번호 <input aria-label="덱 비밀번호" type="password" inputMode="numeric" pattern="[0-9]{4}" placeholder="숫자 4자리" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} maxLength={4} /></label>
        <label>비밀번호 확인 <input aria-label="덱 비밀번호 확인" type="password" inputMode="numeric" pattern="[0-9]{4}" placeholder="숫자 4자리" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={4} maxLength={4} /></label>
        <p className="muted">같은 이름의 덱이 이미 있으면 기존 비밀번호를 입력하세요. 비밀번호가 맞으면 현재 기기의 내용으로 기존 랭킹을 갱신합니다. 잊어버리면 다른 기기에서 관리 권한을 복원할 수 없습니다.</p>
      </>}
      <p className="muted">{publish ? "등록 조건을 충족한 덱만 같은 랭킹 글에 반영됩니다. 인원이 부족해지면 공개 업데이트가 보류되고 마지막 공개 덱이 유지됩니다." : "이 기기에만 저장합니다. 다른 기기로 옮기려면 덱 파일을 내보내거나, 나중에 공개 랭킹에 연결하세요."}</p>
      {error && <p role="alert" className="bad">{error}</p>}
      <div className="row"><button type="submit" className="primary" disabled={busy || (publish && !roster.eligible)}>{busy ? "저장 중…" : "저장"}</button><button type="button" disabled={busy} onClick={close}>취소</button></div>
    </form>
  </div>;
}
