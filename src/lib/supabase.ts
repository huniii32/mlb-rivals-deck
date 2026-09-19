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

export const isRateLimited = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("rate_limited");

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
