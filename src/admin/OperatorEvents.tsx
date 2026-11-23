import { useCallback, useEffect, useRef, useState } from "react";
import { EVENT_ID, type EventState } from "../lib/events";
import { errMessage, isMissingRpc } from "../lib/supabase";
import type { MessagePrize } from "../lib/privateMessages";
import EventAdmin from "../components/events/EventAdmin";
import AdminMailbox from "../components/messages/AdminMailbox";
import { operatorRpc, operatorError } from "./operator";

type SessionProps = { session: string; onExpired: () => void };
type EventSummary = Pick<EventState["event"], "id" | "title" | "phase" | "published" | "opens_at" | "ends_at">;
const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
function status(e: EventSummary) {
  if (e.phase === "drawn") return "추첨 완료";
  if (e.phase === "closed" || (e.ends_at && Date.parse(e.ends_at) <= Date.now())) return "참여 마감";
  if (!e.published) return "비공개";
  return Date.parse(e.opens_at) > Date.now() ? "시작 예정" : "진행 중";
}
export function EventList({ session, onExpired }: SessionProps) {
  const [rows, setRows] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    async function load() {
      setError("");
      try {
        let events: EventSummary[];
        try {
          events = await operatorRpc("list", { p_session: session });
        } catch (e) {
          if (!isMissingRpc(e)) throw e;
          // Older installations have one configured event and no catalog RPC.
          const state: EventState = await operatorRpc("get", { p_session: session, p_event: EVENT_ID });
          events = [state.event];
        }
        if (current) setRows(events);
      } catch (e) {
        if (!current) return;
        if (errMessage(e).includes("session_expired")) onExpired();
        else setError(operatorError(e));
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [session, onExpired, revision]);
  return (
    <section className="operator-catalog">
      <h1>이벤트 목록</h1>
      {error ? (
        <p role="alert">
          {error} <button onClick={() => setRevision((n) => n + 1)}>다시 시도</button>
        </p>
      ) : rows === null ? (
        <p role="status">목록을 불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p>등록된 이벤트가 없습니다.</p>
      ) : (
        <ul>
          {rows.map((e) => (
            <li key={e.id}>
              <a href={"#event/" + encodeURIComponent(e.id)}>
                <span>
                  <strong>{e.title}</strong>
                  <small>{date.format(new Date(e.opens_at))} 시작</small>
                </span>
                <span className="operator-event-phase">{status(e)}</span>
                <span aria-hidden="true">›</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventWorkspace({
  session,
  eventId,
  mailbox,
  initialPrize,
  onExpired,
  onMessage,
}: SessionProps & {
  eventId: string;
  mailbox: boolean;
  initialPrize?: MessagePrize;
  onMessage: (prize: MessagePrize) => void;
}) {
  const [state, setState] = useState<EventState | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const mounted = useRef(false),
    pending = useRef(false);
  const request = useCallback(
    async (action = "get", args: Record<string, unknown> = {}, success = "") => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      try {
        const next: EventState = await operatorRpc(action === "admin" ? "action" : "get", {
          ...args,
          p_session: session,
          p_event: eventId,
        });
        if (!next?.is_admin || next.event?.id !== eventId) throw Error("event_admin_required");
        if (mounted.current) {
          setState(next);
          setError("");
          setMessage(success);
        }
        return next;
      } catch (e) {
        if (!mounted.current) return;
        if (errMessage(e).includes("session_expired")) onExpired();
        else setError(operatorError(e));
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [session, eventId, onExpired],
  );
  useEffect(() => {
    mounted.current = true;
    void request();
    const timer = setInterval(() => {
      if (!document.hidden) void request();
    }, 15000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [request]);
  return (
    <>
      {!mailbox && (
        <div className="operator-event-links">
          <a href="#event">← 이벤트 목록</a>
          {eventId === EVENT_ID && (
            <a href={import.meta.env.BASE_URL + "?event=1#simulator"}>참가자 화면 보기 →</a>
          )}
        </div>
      )}
      {error && (!state || mailbox) && (
        <p role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => void request()}>
            다시 확인
          </button>
        </p>
      )}
      {state ? (
        mailbox ? (
          <AdminMailbox session={session} state={state} initialPrize={initialPrize} />
        ) : (
          <EventAdmin
            state={state}
            busy={busy}
            error={error}
            message={message}
            onMessage={onMessage}
            onAction={request}
            onRefresh={() => void request()}
          />
        )
      ) : (
        !error && <p role="status">관리 화면을 불러오는 중…</p>
      )}
    </>
  );
}
