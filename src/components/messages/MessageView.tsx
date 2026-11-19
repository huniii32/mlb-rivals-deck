import { useEffect, useState } from "react";
import { messageBlob, type MessageImage, type PrivateMessage } from "../../lib/privateMessages";
export function PrivateImage({ image, download = false }: { image: MessageImage; download?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl("");
    let next = "";
    try { next = URL.createObjectURL(messageBlob(image)); setUrl(next); } catch { /* Do not render invalid attachment data. */ }
    return () => { if (next) URL.revokeObjectURL(next); };
  }, [image.mime, image.base64]);
  return url ? <figure className="private-message-image"><img src={url} alt="쪽지에 첨부된 이미지" />
    {download && <a href={url} download={`gift-image.${image.mime === "image/jpeg" ? "jpg" : image.mime.split("/")[1]}`}>이미지 저장</a>}
  </figure> : <p role="alert">이미지를 표시할 수 없습니다.</p>;
}
export const messageTime = (date: string) => new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function MessageView({ message }: { message: PrivateMessage }) {
  return <article className="private-message-content">
    <h3>{message.subject}</h3><small>운영자 · {messageTime(message.created_at)}</small>
    <p className="private-message-body">{message.body}</p>
    {message.image_base64 && message.image_mime && <PrivateImage key={message.id} image={{ mime: message.image_mime, base64: message.image_base64 }} download />}
  </article>;
}
export function MessageList({ messages, open, disabled }: { messages: PrivateMessage[]; open: (id: string) => void; disabled: boolean }) {
  return <ul className="private-message-list">{messages.map(m => <li key={m.id}><button disabled={disabled} onClick={() => open(m.id)}>
    <strong>{m.subject}</strong><span>{m.has_image ? "이미지 첨부 · " : ""}{m.read_at ? `읽음 ${messageTime(m.read_at)}` : "읽지 않음"}</span><small>{messageTime(m.created_at)}</small>
  </button></li>)}</ul>;
}
