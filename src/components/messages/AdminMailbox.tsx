import { useEffect, useRef, useState } from "react";
import { EVENT_ID, type EventState } from "../../lib/events";
import { mailboxError, mailboxRequest, readMessageImage, listAllMessageRecipients, findPrizeRecipients, PRIZE_LABELS, type MessagePrize, type MessageImage, type MessageRecipient, type PrivateMessage } from "../../lib/privateMessages";
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
  const dirty = !!(subject.trim() || body.trim() || image || imageBusy || prepared);
  useEffect(() => { composing(dirty); }, [dirty, composing]);
  function template(gift: boolean) {
    if (dirty) return;
    setSubject(gift ? "이벤트 기프티콘 전달" : `${recipient.award} 당첨 안내`);
    setBody(gift
      ? `${recipient.deck_name}님, 이벤트에 참여해주셔서 감사합니다.\n당첨 경품 이미지를 첨부해 보내드립니다. 쪽지 아래 ‘이미지 저장’ 버튼으로 원본을 저장해주세요.`
      : `${recipient.deck_name}님, ${recipient.award} 당첨을 축하드립니다.\n당첨 안내가 늦어진 점 죄송합니다.\n커뮤니티 쪽지로 참가 덱명과 실제 게임 속 덱 인증을 보내주시면 확인 후 이 사이트 쪽지함으로 기프티콘을 전달하겠습니다.\n참여해주셔서 감사합니다.`);
  }
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
      {recipient.award && <div className="message-actions"><button type="button" disabled={dirty} onClick={() => template(false)}>당첨 안내문 채우기</button><button type="button" disabled={dirty} onClick={() => template(true)}>기프티콘 전달문 채우기</button></div>}
      <label>쪽지 제목<input aria-label="쪽지 제목" maxLength={100} required value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label>쪽지 내용<textarea aria-label="쪽지 내용" maxLength={2000} required rows={5} value={body} onChange={e => setBody(e.target.value)} /></label>
      <label>기프티콘 이미지 (선택)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void attach(e.target.files?.[0]); e.target.value = ""; }} /></label>
      <small>PNG·JPG·WEBP 한 장, 최대 2MB. 바코드가 잘 보이는 원본 이미지를 첨부하세요.</small>
      {imageBusy && <p role="status">이미지 확인 중…</p>}
      {image && <><PrivateImage image={image} /><button type="button" onClick={() => { ++imageVersion.current; setImage(null); }}>이미지 제거</button></>}
      <div className="message-actions"><button disabled={imageBusy || !subject.trim() || !body.trim()}>전송 내용 확인</button>
      {dirty && <button type="button" onClick={() => { if (!confirm("작성 중인 내용과 첨부 이미지를 지울까요? 아직 쪽지는 발송되지 않았습니다.")) return; ++imageVersion.current; setSubject(""); setBody(""); setImage(null); setImageBusy(false); setError(""); }}>작성 취소</button>}</div>
    </form> : <section className="message-confirm" aria-label="전송 전 확인">
      <h4>{recipient.deck_name}에게 보낼 쪽지</h4><strong>{prepared.subject}</strong><p className="private-message-body">{prepared.body}</p>
      {prepared.image && <PrivateImage image={prepared.image} />}
      <p>수신 덱과 이미지를 확인해주세요. 보내면 수신자가 바로 열어볼 수 있습니다.</p>
      <div className="message-actions"><button disabled={busy} onClick={() => void send()}>{busy ? "보내는 중…" : "이 덱에 쪽지 보내기"}</button>
        <button disabled={busy} onClick={() => { if (error && !confirm("보낸 내역을 먼저 확인해주세요. 이미 전송된 쪽지가 있으면 수정 후 보내기는 새 쪽지로 발송됩니다. 내용을 다시 편집할까요?")) return; setPrepared(null); }}>다시 편집</button></div>
    </section>}
    <h3>보낸 내역</h3><button disabled={busy} onClick={() => { setError(""); setReload(n => n + 1); }}>보낸 내역 새로고침</button>
    {!messages.length && <p>표시할 쪽지가 없습니다.</p>}
    <MessageList messages={messages} open={id => void open(id)} disabled={busy} />
    <div className="message-actions"><button disabled={busy || offset === 0} onClick={() => setOffset(o => Math.max(0, o - 50))}>이전 내역</button><button disabled={busy || messages.length < 50} onClick={() => setOffset(o => o + 50)}>다음 내역</button></div>
    {selected && <MessageView message={selected} />}
  </section>;
}
export default function AdminMailbox({ session, state, initialPrize }: { session: string; state?: EventState; initialPrize?: MessagePrize }) {
  const eventId = state?.event.id || EVENT_ID;
  const [winners, setWinners] = useState<Partial<Record<MessagePrize, MessageRecipient>>>({});
  const [winnersBusy, setWinnersBusy] = useState(false), [winnersError, setWinnersError] = useState("");
  const [winnerReload, setWinnerReload] = useState(0);
  const initialApplied = useRef(false);
  const [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]), [recipient, setRecipient] = useState<MessageRecipient | null>(null);
  const [locked, setLocked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setBusy(true); setError(""); setRecipients([]);
    listAllMessageRecipients(session, eventId, search)
      .then(data => { if (active) setRecipients(data); })
      .catch(e => { if (active) { setRecipient(null); setLocked(false); setError(mailboxError(e)); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [session, eventId, search]);
  useEffect(() => {
    let active = true; setWinners({}); setWinnersError("");
    const expected = (["champion", "winner"] as const).filter(prize => !!state?.event[`${prize}_id`]);
    if (!expected.length || !state?.is_admin || state.event.phase === "open") { setWinnersBusy(false); return; }
    setWinnersBusy(true);
    findPrizeRecipients(session, eventId, expected)
      .then(found => {
        if (!active) return;
        setWinners(found);
        if (initialPrize && !initialApplied.current && found[initialPrize]) {
          initialApplied.current = true; setRecipient(found[initialPrize]!);
        }
      }).catch(e => { if (active) setWinnersError(mailboxError(e)); })
      .finally(() => { if (active) setWinnersBusy(false); });
    return () => { active = false; };
  }, [session, eventId, state?.event.champion_id, state?.event.winner_id, state?.event.phase, state?.is_admin, initialPrize, winnerReload]);
  return <section className="event-panel private-messages">
    <h2>운영자 개인 쪽지</h2><p>등록된 덱에 안내문과 기프티콘 이미지를 보냅니다. 일반 사용자는 쪽지를 보낼 수 없습니다.</p>
    {state?.is_admin && <section className="winner-mailbox" aria-label="당첨자 쪽지 보내기">
      <div className="message-actions"><h3>당첨자에게 보내기</h3><button disabled={locked || winnersBusy} onClick={() => setWinnerReload(n => n + 1)}>당첨자 다시 확인</button></div>
      <p>당첨자 선택 → 안내문 작성 또는 이미지 첨부 → 전송 내용 확인 → 발송</p>
      {winnersError && <p role="alert">{winnersError}</p>}{winnersBusy && <p role="status">당첨자의 받는 덱을 확인하는 중…</p>}
      <div className="winner-mailbox-grid">{(["champion", "winner"] as const).map(prize => {
        const participantId = state.event[`${prize}_id`], winner = winners[prize];
        const previousName = state.participants.find(p => p.id === participantId)?.deck_name;
        const verified = state.event[`${prize}_verified_at`], delivered = state.event[`${prize}_delivered_at`];
        return <article key={prize} className="winner-mailbox-card" aria-label={PRIZE_LABELS[prize]}>
          <span>{PRIZE_LABELS[prize]}</span><strong>{winner?.deck_name || previousName || "당첨자 미확정"}</strong>
          {winner && previousName && previousName !== winner.deck_name && <small>참가 당시: {previousName}</small>}
          <small>{delivered ? "지급 완료 기록 있음" : verified ? "게임 덱 인증 완료" : "게임 덱 인증 대기"}</small>
          <button disabled={locked || winnersBusy || !winner} onClick={() => { initialApplied.current = true; setRecipient(winner!); }}>{recipient?.id === winner?.id && winner ? "선택됨" : "이 당첨자에게 쪽지 작성"}</button>
          {!!participantId && !winner && !winnersBusy && !winnersError && <small>현재 등록 덱을 찾을 수 없습니다. 이름이 같은 다른 덱으로 대신 보내지 않습니다.</small>}
        </article>;
      })}</div>
      <small>기프티콘은 게임 덱 인증 후 보내주세요. 쪽지 발송·읽음과 지급 완료 기록은 별개입니다.</small>
    </section>}
    {locked && <p role="status">작성 중에는 받는 덱이 고정됩니다. 다른 덱을 선택하려면 작성 취소를 눌러주세요.</p>}
    <form className="message-recipient-search" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); }}>
      <label htmlFor="message-recipient-query">받는 덱 검색</label>
      <div className="message-recipient-search-controls">
        <input id="message-recipient-query" disabled={locked} value={query} onChange={e => setQuery(e.target.value)} placeholder="덱 이름" />
        <button disabled={locked || busy}>검색</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">등록된 전체 덱을 불러오는 중…</p>}
    <div className="message-actions">
      {!busy && !error && <span role="status">{search ? `‘${search}’ 검색 결과 ${recipients.length}개` : `전체 등록 덱 ${recipients.length}개`}</span>}
      {(query || search) && <button type="button" disabled={locked || busy} onClick={() => { setQuery(""); setSearch(""); }}>전체 덱 보기</button>}
    </div>
    <label>받는 덱 선택<select aria-label="받는 덱 선택" disabled={locked || busy || winnersBusy} value={recipient?.id || ""} onChange={e => { initialApplied.current = true; setRecipient(recipients.find(r => r.id === e.target.value) || null); }}>
      <option value="">받는 덱을 선택하세요</option>
      {recipient && !recipients.some(r => r.id === recipient.id) && <option value={recipient.id}>{recipient.deck_name} · 현재 선택</option>}
      {recipients.map(r => <option key={r.id} value={r.id}>{r.deck_name}{r.award ? ` · ${r.award}` : ""}</option>)}
    </select></label>
    {!busy && !error && !recipients.length && <p>{search ? "검색 결과가 없습니다. 전체 덱 보기를 눌러 다시 선택해주세요." : "등록된 덱이 없습니다."}</p>}
    {recipient && <RecipientMessages key={`${session}:${recipient.id}`} session={session} recipient={recipient} composing={setLocked} />}
  </section>;
}
