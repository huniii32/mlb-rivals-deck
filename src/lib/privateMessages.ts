import { errMessage, isMissingRpc, supabase } from "./supabase";
export interface PrivateMessage {
  id: string; recipient_id: string; subject: string; created_at: string;
  read_at: string | null; has_image: boolean;
  body?: string; image_mime?: string | null; image_base64?: string | null;
}
export interface MessageRecipient { id: string; deck_name: string; award?: string | null }
export interface MessageImage { mime: string; base64: string }
export async function mailboxRequest<T>(action: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw Error("mailbox_unconfigured");
  const { data, error } = await supabase.rpc(`mailbox_${action}`, args);
  if (error) throw error;
  return data as T;
}
export function mailboxError(e: unknown): string {
  const message = errMessage(e);
  if (isMissingRpc(e) || message.includes("mailbox_unconfigured")) return "쪽지함 연결을 준비 중입니다. 잠시 후 다시 확인해주세요.";
  if (message.includes("session_expired")) return "관리자 로그인이 만료되었습니다. 다시 로그인해주세요.";
  if (message.includes("mailbox_owner_required")) return "덱 소유 확인이 필요합니다. 덱랭킹에서 비밀번호로 내 덱을 다시 가져와주세요.";
  if (message.includes("mailbox_invalid_image")) return "PNG·JPG·WEBP 이미지(최대 2MB)를 선택해주세요.";
  if (message.includes("mailbox_recipient_unavailable")) return "등록 덱을 찾을 수 없습니다. 받는 사람을 다시 선택해주세요.";
  if (message.includes("mailbox_request_conflict")) return "전송 확인 중 내용이 달라졌습니다. 보낸 내역을 새로고침해 확인해주세요.";
  if (message.includes("mailbox_message_unavailable")) return "이 쪽지를 열 수 없습니다.";
  return "요청 결과를 확인하지 못했습니다. 연결을 확인하고 다시 시도해주세요.";
}
export async function readMessageImage(file: File): Promise<MessageImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2097152 || !file.size) throw Error("mailbox_invalid_image");
  // Decode before preview/send; never accept HTML/SVG or a URL supplied as a file.
  try { const bitmap = await createImageBitmap(file); bitmap.close(); }
  catch { throw Error("mailbox_invalid_image"); }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { mime: file.type, base64: btoa(binary) };
}
export function messageBlob(image: MessageImage): Blob {
  if (!["image/png", "image/jpeg", "image/webp"].includes(image.mime)) throw Error("mailbox_invalid_image");
  const raw = atob(image.base64);
  if (raw.length > 2097152) throw Error("mailbox_invalid_image");
  return new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: image.mime });
}

export const PRIZE_LABELS = { champion: "스킬 점수 1위", winner: "응모권 추첨 당첨자" } as const;
export type MessagePrize = keyof typeof PRIZE_LABELS;
/** Fetch every matching registered deck; the RPC returns at most 50 per page. */
export async function listAllMessageRecipients(
  session: string, eventId: string, query = "", request = mailboxRequest,
): Promise<MessageRecipient[]> {
  const recipients = new Map<string, MessageRecipient>();
  for (let offset = 0; ; offset += 50) {
    const page = await request<MessageRecipient[]>("operator_recipients", {
      p_session: session, p_event: eventId, p_query: query, p_offset: offset,
    });
    const previousSize = recipients.size;
    for (const recipient of page) recipients.set(recipient.id, recipient);
    if (page.length < 50) return [...recipients.values()];
    if (recipients.size === previousSize) throw Error("mailbox_recipient_pagination_failed");
  }
}
/** The RPC derives awards from participant ranking IDs, including renamed decks. */
export async function findPrizeRecipients(
  session: string, eventId: string, expected: MessagePrize[],
  request = mailboxRequest,
): Promise<Partial<Record<MessagePrize, MessageRecipient>>> {
  const found: Partial<Record<MessagePrize, MessageRecipient>> = {};
  const seen = new Set<string>();
  for (let offset = 0; expected.some(prize => !found[prize]); offset += 50) {
    const page = await request<MessageRecipient[]>("operator_recipients", {
      p_session: session, p_event: eventId, p_query: "", p_offset: offset,
    });
    for (const recipient of page) {
      for (const prize of expected) if (recipient.award === PRIZE_LABELS[prize]) found[prize] = recipient;
    }
    if (page.length < 50) break;
    if (page.every(recipient => seen.has(recipient.id))) throw Error("mailbox_recipient_pagination_failed");
    for (const recipient of page) seen.add(recipient.id);
  }
  return found;
}
