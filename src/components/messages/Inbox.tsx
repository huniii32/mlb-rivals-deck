import { useEffect, useRef, useState } from "react";
import type { RankRef } from "../../lib/deckFile";
import { mailboxError, mailboxRequest, type PrivateMessage } from "../../lib/privateMessages";
import { MessageList, MessageView } from "./MessageView";
import "./messages.css";
export type InboxDeck = RankRef & { name: string };
function DeckInbox({ deck }: { deck: InboxDeck }) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]), [selected, setSelected] = useState<PrivateMessage | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0);
  const version = useRef(0), pending = useRef(false);
  async function load(id?: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setSelected(null);
    const v = ++version.current;
    try {
      const args = { p_ranking_id: deck.id, p_token: deck.token };
      if (id) {
        const data = await mailboxRequest<PrivateMessage>("read", { ...args, p_id: id });
        if (v !== version.current) return;
        setSelected(data); setMessages(ms => ms.map(m => m.id === id ? { ...m, read_at: data.read_at } : m));
      } else {
        const data = await mailboxRequest<PrivateMessage[]>("list", { ...args, p_offset: offset });
        if (v === version.current) setMessages(data);
      }
    } catch (e) { if (v === version.current) { setMessages([]); setSelected(null); setError(mailboxError(e)); } }
    finally { if (v === version.current) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => { void load(); return () => { ++version.current; pending.current = false; }; }, [offset]);
  return <section className="private-messages">
    <div className="message-actions"><button disabled={busy} onClick={() => void load()}>새로고침</button><span>운영자가 보낸 쪽지만 받을 수 있습니다.</span></div>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">쪽지를 확인하는 중…</p>}
    {!busy && !error && !messages.length && <p>받은 쪽지가 없습니다.</p>}
    <MessageList messages={messages} disabled={busy} open={id => void load(id)} />
    <div className="message-actions"><button disabled={busy || offset === 0} onClick={() => setOffset(o => Math.max(0, o - 50))}>이전</button><button disabled={busy || messages.length < 50} onClick={() => setOffset(o => o + 50)}>다음</button></div>
    {selected && <MessageView message={selected} />}
  </section>;
}
export default function Inbox({ decks, initialId, onRestore }: { decks: InboxDeck[]; initialId?: string; onRestore: () => void }) {
  const owned = decks.filter(d => d.password && d.token);
  const [id, setId] = useState(initialId || owned[0]?.id || "");
  const deck = owned.find(d => d.id === id) || owned[0];
  return <div className="private-messages">
    {!deck ? <><p>덱랭킹에서 비밀번호로 내 덱을 가져오면 받은 쪽지를 볼 수 있습니다.</p><button onClick={onRestore}>내 덱 가져오러 가기</button></> : <>
      <label>쪽지를 확인할 덱<select value={deck.id} onChange={e => setId(e.target.value)}>{owned.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <DeckInbox key={`${deck.id}:${deck.token}`} deck={deck} />
    </>}
    <small>이 사이트의 쪽지함입니다. 커뮤니티 쪽지·이메일로 자동 알림이 발송되지는 않습니다. 공용 기기에서는 덱 백업과 첨부 이미지를 남기지 마세요.</small>
  </div>;
}
