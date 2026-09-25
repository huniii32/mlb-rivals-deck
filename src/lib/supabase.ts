import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** env 없으면 null → 각 패널에서 localStorage 폴백으로 동작 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseOn = () => supabase !== null;

/** 이 브라우저의 익명 식별자 (한 번 생성해서 재사용). 서버 쪽 등록 간격 제한(스팸 방지)에 사용. */
export function getClientId(): string {
  const KEY = "rivals-client-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** postgrest 에러는 Error 인스턴스가 아닌 plain object({code,message,...}) 라서 message 를 직접 읽는다 */
export const errMessage = (e: unknown): string =>
  typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string"
    ? (e as { message: string }).message
    : String(e);

export const isRateLimited = (e: unknown): boolean => errMessage(e).includes("rate_limited");

/** RPC 함수가 DB에 없음 (마이그레이션 미실행) */
export const isMissingRpc = (e: unknown): boolean => {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === "PGRST202" || code === "42883" || errMessage(e).includes("Could not find the function");
};

export interface PublicRank {
  id: string;
  deck_name: string;
  total: number;
  sp: number;
  rp: number;
  bt: number;
  named: number;
  deck_json: unknown;
  created_at: string;
}

export interface PublicInquiry {
  id: string;
  name: string;
  body: string;
  reply: string | null;
  created_at: string;
}
