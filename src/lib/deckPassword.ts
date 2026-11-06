import { isDeck, type Deck } from "./deck";

export const validDeckName = (name: string) => name.trim().length >= 1 && Array.from(name.trim()).length <= 50;
export const validDeckPassword = (value: string) => /^[0-9]{4}$/.test(value);
export interface PasswordCredential { token: string; password: true }
export function passwordResult(data: unknown): { id: string; token: string; deck?: Deck } {
  const r = data as { id?: unknown; token?: unknown; error?: unknown; deck?: unknown } | null;
  if (typeof r?.error === "string") throw new Error(r.error);
  if (typeof r?.id !== "string" || typeof r?.token !== "string") throw new Error("invalid_response");
  if (r.deck !== undefined && !isDeck(r.deck)) throw new Error("invalid_deck");
  return { id: r.id, token: r.token, ...(r.deck !== undefined ? { deck: r.deck as Deck } : {}) };
}
export function passwordError(e: unknown): string {
  const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
  if (message.includes("rate_limited")) return "시도 횟수가 많습니다. 잠시 후 다시 시도하세요.";
  if (message.includes("duplicate_name") || message.includes("rankings_name_unique")) return "이미 사용 중인 덱 이름입니다. 다른 이름을 사용하거나 해당 덱의 비밀번호로 연결하세요.";
  if (message.includes("invalid_password")) return "해당 덱의 비밀번호가 일치하지 않거나 접근할 수 없는 덱입니다.";
  if (message.includes("password_length")) return "비밀번호는 숫자 4자리로 입력하세요.";
  if (message.includes("ownership_required")) return "이 덱을 관리하던 기기에서 비밀번호를 먼저 설정하세요.";
  if (message.includes("save_ranking_password") && (message.includes("Could not find the function") || message.includes("PGRST202"))) return "서버에 같은 이름 덱 갱신 기능을 적용해야 합니다. 이 기기의 저장 데이터는 유지됩니다.";
  if (message.includes("Could not find the function") || message.includes("PGRST202")) return "서버에 덱 비밀번호 기능을 적용해야 합니다. 이 기기의 저장 데이터는 유지됩니다.";
  return "요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.";
}
