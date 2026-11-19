import { useEffect, useRef, useState } from "react";
import { isMissingRpc } from "../../lib/supabase";
import { mailboxError, mailboxRequest, type PrivateMessage } from "../../lib/privateMessages";
import { MessageView, messageTime } from "./MessageView";

type SentMessage = PrivateMessage & { recipient_name: string };
const day = (value: string) => new Date(value).toLocaleDateString("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
});

export default function AdminSentHistory({ session, revision }: { session: string; revision: number }) {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [selected, setSelected] = useState<SentMessage | null>(null);
  const [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState("");
  const version = useRef(0);
  useEffect(() => { setOffset(0); }, [revision]);
  useEffect(() => {
    const v = ++version.current;
    setBusy(true); setReading(false); setError(""); setMessages([]); setSelected(null);
    mailboxRequest<SentMessage[]>("operator_sent", { p_session: session, p_offset: offset })
      .then(data => { if (v === version.current) setMessages(data); })
      .catch(e => { if (v === version.current) setError(isMissingRpc(e)
        ? "전체 발송 내역의 서버 업데이트가 필요합니다. admin-mailbox-update.sql을 적용한 뒤 새로고침해주세요."
        : mailboxError(e)); })
      .finally(() => { if (v === version.current) setBusy(false); });
    return () => { ++version.current; };
  }, [session, offset, reload, revision]);
  async function open(message: SentMessage) {
    const v = ++version.current;
    setSelected(null); setReading(true); setError("");
    try {
      const data = await mailboxRequest<PrivateMessage>("operator_read", { p_session: session, p_id: message.id });
      if (v === version.current) setSelected({ ...data, recipient_name: message.recipient_name });
    } catch (e) { if (v === version.current) setError(mailboxError(e)); }
    finally { if (v === version.current) setReading(false); }
  }
  const groups = new Map<string, SentMessage[]>();
  for (const message of messages) {
    const key = day(message.created_at);
    groups.set(key, [...(groups.get(key) || []), message]);
  }
  return <section className="operator-sent-history" aria-label="전체 보낸 쪽지 내역">
    <div className="message-actions"><span>최근 발송순 · 한국 시간 · 50개씩 표시</span>
      <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>발송 내역 새로고침</button>
    </div>
    {busy && <p role="status">발송 내역을 불러오는 중…</p>}
    {error && <p role="alert">{error}</p>}
    {!busy && !error && !messages.length && <p>표시할 발송 내역이 없습니다.</p>}
    {[...groups].map(([date, items]) => <section key={date} aria-label={date}>
      <h4>{date}</h4>
      <ul className="private-message-list">{items.map(m => <li key={m.id}>
        <button type="button" disabled={busy} onClick={() => void open(m)}>
          <strong>받는 덱: {m.recipient_name}</strong><span>{m.subject}</span>
          <small>발송 {messageTime(m.created_at)}{m.has_image ? " · 이미지 첨부" : ""}</small>
          <small>{m.read_at ? `읽음 ${messageTime(m.read_at)}` : "읽지 않음"}</small>
        </button>
      </li>)}</ul>
    </section>)}
    <div className="message-actions">
      <button type="button" disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>이전 발송 내역</button>
      <span>{offset / 50 + 1}페이지</span>
      <button type="button" disabled={busy || !!error || messages.length < 50} onClick={() => setOffset(n => n + 50)}>다음 발송 내역</button>
    </div>
    {reading && <p role="status">쪽지 내용을 불러오는 중…</p>}
    {selected && <section aria-label="보낸 쪽지 상세">
      <div className="message-actions"><strong>받는 덱: {selected.recipient_name}</strong>
        <button type="button" onClick={() => setSelected(null)}>상세 닫기</button></div>
      <MessageView message={selected} />
    </section>}
  </section>;
}
