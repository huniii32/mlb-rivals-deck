import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { operatorRpc, operatorError } from "./operator";
import { EventList, EventWorkspace } from "./OperatorEvents";
import { EVENT_ID } from "../lib/events";
import type { MessagePrize } from "../lib/privateMessages";
import "../components/EventPage.css";
import UsagePanel from "./UsagePanel";
import { useSiteUsage } from "../lib/siteUsage";
import "./style.css";

const SESSION_KEY = "rivals-event-operator-session";
type Login = { token: string; expires_at: string };
function savedLogin(): Login | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return s && typeof s.token === "string" && Date.parse(s.expires_at) > Date.now() ? s : null;
  } catch {
    return null;
  }
}
function AdminApp() {
  const [login, setLogin] = useState<Login | null>(savedLogin);
  const [messagePrize, setMessagePrize] = useState<MessagePrize | undefined>();
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const change = () => setHash(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [section, encodedId] = hash.slice(1).split("/");
  const view = section === "messages" ? "messages" : section === "event" ? "event" : "usage";
  let selectedId = "";
  try {
    selectedId = decodeURIComponent(encodedId || "");
  } catch {
    /* Show the list for an invalid URL. */
  }
  useSiteUsage(login ? `admin-${view}` : "admin-login");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const clearLogin = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setLogin(null);
    setPassword("");
    setMessagePrize(undefined);
  }, []);
  const expire = useCallback(() => {
    clearLogin();
    setError("로그인이 만료되었습니다. 다시 로그인해주세요.");
  }, [clearLogin]);
  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => {
      if (Date.parse(login.expires_at) <= Date.now()) expire();
    }, 15000);
    return () => clearInterval(timer);
  }, [login, expire]);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next: Login = await operatorRpc("login", { p_password: password.trim() });
      if (!next?.token || !next?.expires_at) throw Error("invalid_login_response");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      location.replace("#usage");
      setHash("#usage");
      setPassword("");
      setLogin(next);
    } catch (e) {
      setError(operatorError(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    if (pending.current || !login) return;
    pending.current = true;
    setBusy(true);
    try {
      await operatorRpc("logout", { p_session: login.token });
      clearLogin();
      setError("");
    } catch {
      setError("서버 로그아웃에 실패했습니다. 연결을 확인하고 다시 눌러주세요.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="operator-shell">
      <header className="operator-header">
        <strong>Rivals Deck · 관리자 페이지</strong>
      </header>
      {login ? (
        <>
          <nav className="operator-mail-tabs" aria-label="관리 메뉴">
            <button aria-pressed={view === "usage"} onClick={() => (location.hash = "usage")}>
              이용 통계
            </button>
            <button aria-pressed={view === "event"} onClick={() => (location.hash = "event")}>
              이벤트 관리
            </button>
            <button
              aria-pressed={view === "messages"}
              onClick={() => {
                setMessagePrize(undefined);
                location.hash = "messages";
              }}
            >
              개인 쪽지 보내기
            </button>
            <button disabled={busy} onClick={() => void signOut()}>
              로그아웃
            </button>
          </nav>
          {error && <p role="alert">{error}</p>}
          {view === "usage" ? (
            <UsagePanel session={login.token} onExpired={expire} />
          ) : view === "event" && !selectedId ? (
            <EventList session={login.token} onExpired={expire} />
          ) : (
            <EventWorkspace
              key={JSON.stringify([login.token, selectedId, view])}
              session={login.token}
              eventId={selectedId || EVENT_ID}
              mailbox={view === "messages"}
              initialPrize={messagePrize}
              onExpired={expire}
              onMessage={(prize) => {
                setMessagePrize(prize);
                location.hash = "messages/" + encodeURIComponent(selectedId);
              }}
            />
          )}
        </>
      ) : (
        <section className="operator-login event-panel">
          <h1>관리자 로그인</h1>
          <p>사이트 이용 통계, 이벤트, 개인 쪽지를 관리합니다.</p>
          {error && (
            <p className="event-error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={signIn}>
            <label htmlFor="operator-password">관리자 비밀번호</label>
            <input
              id="operator-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button disabled={busy || !password.trim()}>{busy ? "확인 중…" : "로그인"}</button>
            <small>로그인은 1시간 동안 유지됩니다. 공용 컴퓨터에서는 사용 후 로그아웃해주세요.</small>
          </form>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<AdminApp />);
