import { useEffect, useRef, useState } from "react";
import { EVENT_ID } from "../../lib/events";
import { mailboxError, mailboxRequest, readMessageImage, type MessageImage, type MessageRecipient, type PrivateMessage } from "../../lib/privateMessages";
import { MessageList, MessageView, PrivateImage } from "./MessageView";
import "./messages.css";
function RecipientMessages({ session, recipient, composing }: { session: string; recipient: MessageRecipient; composing: (value: boolean) => void }) {
  const [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const [image, setImage] = useState<MessageImage | null>(null), [imageBusy, setImageBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ id: string; subject: string; body: string; image: MessageImage | null } | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [messages, setMessages] = useState<PrivateMessage[]>([]), [selected, setSelected] = useState<PrivateMessage | null>(null);
  const [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
  const mounted = useRef(true), pending = useRef(false), imageVersion = useRef(0), readVersion = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++imageVersion.current; ++readVersion.current; }; }, []);
  useEffect(() => {
    let active = true;
    setMessages([]); setSelected(null); ++readVersion.current;
    mailboxRequest<PrivateMessage[]>("operator_list", { p_session: session, p_ranking_id: recipient.id, p_offset: offset })
      .then(data => { if (active) setMessages(data); })
      .catch(e => { if (active) setError(mailboxError(e)); });
    return () => { active = false; };
  }, [session, recipient.id, offset, reload]);
  async function attach(file?: File) {
    const v = ++imageVersion.current;
    setImage(null); setError("");
    if (!file) return;
    setImageBusy(true);
    try { const next = await readMessageImage(file); if (mounted.current && v === imageVersion.current) setImage(next); }
    catch (e) { if (mounted.current && v === imageVersion.current) setError(mailboxError(e)); }
    finally { if (mounted.current && v === imageVersion.current) setImageBusy(false); }
  }
  async function send() {
    if (!prepared || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await mailboxRequest("operator_send", { p_session: session, p_ranking_id: recipient.id, p_request_id: prepared.id,
        p_subject: prepared.subject, p_body: prepared.body, p_image_mime: prepared.image?.mime ?? null, p_image_base64: prepared.image?.base64 ?? null });
      if (!mounted.current) return;
      setPrepared(null); composing(false); setSubject(""); setBody(""); setImage(null);
      setNotice("쪽지를 보냈습니다. 읽음 여부는 보낸 내역에서 확인할 수 있습니다. 경품 지급 상태는 자동으로 변경되지 않습니다.");
      setOffset(0); setReload(n => n + 1);
    } catch (e) { if (mounted.current) setError(mailboxError(e) + " 전송 여부가 불확실하면 같은 화면에서 다시 보내주세요. 동일 요청은 중복 발송되지 않습니다."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function open(id: string) {
    const v = ++readVersion.current; setSelected(null); setError("");
    try { const data = await mailboxRequest<PrivateMessage>("operator_read", { p_session: session, p_id: id }); if (mounted.current && v === readVersion.current) setSelected(data); }
    catch (e) { if (mounted.current && v === readVersion.current) { setSelected(null); setMessages([]); setError(mailboxError(e)); } }
  }
  return <section aria-label="쪽지 작성 및 보낸 내역">
    <h3>받는 덱: {recipient.deck_name}</h3>{recipient.award && <p>{recipient.award}</p>}
    <p>기프티콘은 실제 게임 덱 인증을 확인한 후 보내주세요. 받는 사람은 사이트 쪽지함에서 확인합니다.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!prepared ? <form onSubmit={e => { e.preventDefault(); if (!subject.trim() || !body.trim() || imageBusy) return;
      setPrepared({ id: crypto.randomUUID(), subject: subject.trim(), body: body.trim(), image }); composing(true); setNotice(""); setError(""); }}>
      <label>쪽지 제목<input maxLength={100} required value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label>쪽지 내용<textarea maxLength={2000} required rows={5} value={body} onChange={e => setBody(e.target.value)} /></label>
      <label>기프티콘 이미지 (선택)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void attach(e.target.files?.[0]); e.target.value = ""; }} /></label>
      <small>PNG·JPG·WEBP 한 장, 최대 2MB. 바코드가 잘 보이는 원본 이미지를 첨부하세요.</small>
      {imageBusy && <p role="status">이미지 확인 중…</p>}
      {image && <><PrivateImage image={image} /><button type="button" onClick={() => { ++imageVersion.current; setImage(null); }}>이미지 제거</button></>}
      <button disabled={imageBusy || !subject.trim() || !body.trim()}>전송 내용 확인</button>
    </form> : <section className="message-confirm" aria-label="전송 전 확인">
      <h4>{recipient.deck_name}에게 보낼 쪽지</h4><strong>{prepared.subject}</strong><p className="private-message-body">{prepared.body}</p>
      {prepared.image && <PrivateImage image={prepared.image} />}
      <p>수신 덱과 이미지를 확인해주세요. 보내면 수신자가 바로 열어볼 수 있습니다.</p>
      <div className="message-actions"><button disabled={busy} onClick={() => void send()}>{busy ? "보내는 중…" : "이 덱에 쪽지 보내기"}</button>
        <button disabled={busy} onClick={() => { if (error && !confirm("보낸 내역을 먼저 확인해주세요. 이미 전송된 쪽지가 있으면 수정 후 보내기는 새 쪽지로 발송됩니다. 내용을 다시 편집할까요?")) return; setPrepared(null); composing(false); }}>다시 편집</button></div>
    </section>}
    <h3>보낸 내역</h3><button disabled={busy} onClick={() => { setError(""); setReload(n => n + 1); }}>보낸 내역 새로고침</button>
    {!messages.length && <p>표시할 쪽지가 없습니다.</p>}
    <MessageList messages={messages} open={id => void open(id)} disabled={busy} />
    <div className="message-actions"><button disabled={busy || offset === 0} onClick={() => setOffset(o => Math.max(0, o - 50))}>이전 내역</button><button disabled={busy || messages.length < 50} onClick={() => setOffset(o => o + 50)}>다음 내역</button></div>
    {selected && <MessageView message={selected} />}
  </section>;
}
export default function AdminMailbox({ session }: { session: string }) {
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]), [recipient, setRecipient] = useState<MessageRecipient | null>(null);
  const [locked, setLocked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setBusy(true); setError(""); setRecipients([]);
    mailboxRequest<MessageRecipient[]>("operator_recipients", { p_session: session, p_event: EVENT_ID, p_query: search, p_offset: offset })
      .then(data => { if (active) setRecipients(data); })
      .catch(e => { if (active) { setRecipient(null); setLocked(false); setError(mailboxError(e)); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [session, search, offset]);
  return <section className="event-panel private-messages">
    <h2>운영자 개인 쪽지</h2><p>등록된 덱에 안내문과 기프티콘 이미지를 보냅니다. 일반 사용자는 쪽지를 보낼 수 없습니다.</p>
    <form className="message-actions" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); setOffset(0); }}>
      <label>수신 덱 검색<input disabled={locked} value={query} onChange={e => setQuery(e.target.value)} placeholder="덱 이름" /></label><button disabled={locked || busy}>검색</button>
    </form>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">등록 덱 확인 중…</p>}
    <label>받는 덱 선택<select disabled={locked || busy} value={recipient?.id || ""} onChange={e => setRecipient(recipients.find(r => r.id === e.target.value) || null)}>
      <option value="">수신 덱을 선택하세요</option>
      {recipient && !recipients.some(r => r.id === recipient.id) && <option value={recipient.id}>{recipient.deck_name}</option>}
      {recipients.map(r => <option key={r.id} value={r.id}>{r.deck_name}{r.award ? ` · ${r.award}` : ""}</option>)}
    </select></label>
    {!busy && !error && !recipients.length && <p>검색 결과가 없습니다.</p>}
    <div className="message-actions"><button disabled={locked || busy || offset === 0} onClick={() => setOffset(o => Math.max(0, o - 50))}>이전 덱</button><button disabled={locked || busy || recipients.length < 50} onClick={() => setOffset(o => o + 50)}>다음 덱</button></div>
    {recipient && <RecipientMessages key={`${session}:${recipient.id}`} session={session} recipient={recipient} composing={setLocked} />}
  </section>;
}
