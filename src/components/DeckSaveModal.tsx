import { useState } from "react";
import { validDeckName, validDeckPassword } from "../lib/deckPassword";

export function DeckSaveModal({ initialName, needsPassword, remote, save, close }: {
  initialName: string; needsPassword: boolean; remote: boolean;
  save: (name: string, password: string) => Promise<void>; close: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="modal-overlay" onClick={() => !busy && close()}>
    <form className="card modal-box deck-save-form" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
      e.preventDefault();
      if (!validDeckName(name)) { setError("덱 이름을 1~50자로 입력하세요."); return; }
      if (needsPassword && (!validDeckPassword(password) || password !== confirm)) { setError(password !== confirm ? "비밀번호가 서로 다릅니다." : "비밀번호는 8~128자로 입력하세요."); return; }
      setBusy(true); setError("");
      try { await save(name.trim(), password); close(); } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
      finally { setBusy(false); }
    }}>
      <h3>덱 저장</h3>
      <label>덱 이름 <input aria-label="저장할 덱 이름" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus /></label>
      {needsPassword && <>
        <label>덱 비밀번호 <input aria-label="덱 비밀번호" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} /></label>
        <label>비밀번호 확인 <input aria-label="덱 비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={128} /></label>
        <p className="muted">다른 기기에서 랭킹의 내 덱을 가져올 때 사용하는 비밀번호입니다. 잊어버리면 다른 기기에서 관리 권한을 복원할 수 없습니다.</p>
      </>}
      <p className="muted">{remote ? "저장 후 덱을 수정하면 같은 랭킹 글에 바로 반영됩니다." : "현재는 이 기기에 저장합니다. 온라인 랭킹 연결 후 비밀번호를 설정할 수 있습니다."}</p>
      {error && <p role="alert" className="bad">{error}</p>}
      <div className="row"><button type="submit" className="primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button><button type="button" disabled={busy} onClick={close}>취소</button></div>
    </form>
  </div>;
}
