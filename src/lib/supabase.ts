import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** env 없으면 null → 각 패널에서 localStorage 폴백으로 동작 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseOn = () => supabase !== null;

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
  created_at: string;
}
