import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase, isMissingRpc, errMessage } from "../lib/supabase";
import { EVENT_ID, eventError, type EventState } from "../lib/events";
import EventAdmin from "../components/events/EventAdmin";
import "../components/EventPage.css";
import "./style.css";

const SESSION_KEY = "rivals-event-operator-session";
type Login = { token: string; expires_at: string };
function savedLogin(): Login | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return s && typeof s.token === "string" && Date.parse(s.expires_at) > Date.now() ? s : null;
  } catch { return null; }
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw Error("operator_server_missing");
  const { data, error } = await supabase.rpc(`event_operator_${name}`, args);
  if (error) throw error;
  return data;
}
function errorText(e: unknown) {
  if (isMissingRpc(e) || errMessage(e).includes("operator_server_missing"))
    return "관리자 서버 설정이 아직 적용되지 않았습니다. 전달받은 이벤트 설치 SQL을 Supabase SQL Editor에서 실행해주세요.";
  if (errMessage(e).includes("event_invalid_credentials")) return "비밀번호가 올바르지 않습니다.";
  if (errMessage(e).includes("event_operator_session_expired")) return "로그인이 만료되었습니다. 다시 로그인해주세요.";
  return eventError(e);
}
function AdminApp() {
  const [login, setLogin] = useState<Login | null>(savedLogin);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<EventState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const version = useRef(0), pending = useRef(false);
  function clearLogin() {
    ++version.current;
    sessionStorage.removeItem(SESSION_KEY);
    setLogin(null);
    setState(null);
    setPassword("");
  }
  async function request(action = "get", args: Record<string, unknown> = {}, success = "") {
    if (!login || pending.current) return;
    pending.current = true;
    setBusy(true);
    const id = ++version.current;
    try {
      const next = await rpc(action === "admin" ? "action" : "get", {
        p_session: login.token, p_event: EVENT_ID, ...args,
      });
      if (!next?.is_admin || !next?.event) throw Error("event_admin_required");
      if (id !== version.current) return;
      setState(next); setError(""); setMessage(success);
      return next as EventState;
    } catch (e) {
      if (id !== version.current) return;
      setState(null);
      if (errMessage(e).includes("event_operator_session_expired")) clearLogin();
      setError(errorText(e));
    } finally { pending.current = false; setBusy(false); }
  }
  const refresh = useRef(request); refresh.current = request;
  useEffect(() => {
    if (!login) return;
    void refresh.current();
    const timer = setInterval(() => {
      if (Date.parse(login.expires_at) <= Date.now()) {
        clearLogin(); setError("로그인이 만료되었습니다. 다시 로그인해주세요.");
      } else void refresh.current();
    }, 15000);
    return () => { clearInterval(timer); ++version.current; };
  }, [login]);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const next: Login = await rpc("login", { p_password: password.trim() });
      if (!next?.token || !next?.expires_at) throw Error("invalid_login_response");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setPassword(""); setLogin(next);
    } catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function signOut() {
    if (pending.current || !login) return;
    pending.current = true; setBusy(true);
    try {
      await rpc("logout", { p_session: login.token });
      clearLogin(); setError(""); setMessage("");
    } catch {
      setError("서버 로그아웃에 실패했습니다. 연결을 확인하고 다시 눌러주세요.");
    } finally { pending.current = false; setBusy(false); }
  }
  return <main className="operator-shell">
    <header className="operator-header"><strong>Rivals Deck · 이벤트 관리</strong><a href={`${import.meta.env.BASE_URL}?event=1#simulator`}>참가자 화면 보기 →</a></header>
    {state && login ? <EventAdmin state={state} busy={busy} error={error} message={message}
      onAction={request} onRefresh={() => void request()} onLogout={() => void signOut()} /> :
      <section className="operator-login event-panel">
        <div className="eyebrow">EVENT MANAGEMENT</div>
        <h1>{login ? "관리 화면 불러오기" : "관리자 로그인"}</h1>
        <p>참가 이력, 응모권, 순위와 당첨자 지급 상태를 관리합니다.</p>
        {error && <p className="event-error" role="alert">{error}</p>}
        {login ? <div className="operator-buttons"><button disabled={busy} onClick={() => void request()}>다시 확인</button><button disabled={busy} onClick={() => void signOut()}>로그아웃</button></div> :
          <form onSubmit={signIn}>
            <label htmlFor="operator-password">관리자 비밀번호</label>
            <input id="operator-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
            <button disabled={busy || !password.trim()}>{busy ? "확인 중…" : "로그인"}</button>
            <small>로그인은 1시간 동안 유지됩니다. 공용 컴퓨터에서는 사용 후 로그아웃해주세요.</small>
          </form>}
      </section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<AdminApp />);
