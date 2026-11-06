import { errMessage, isMissingRpc, supabase } from "./supabase";
import type { RankRef } from "./deckFile";
import type { DrawSkill } from "./skillSimulator";

export const EVENT_ID = import.meta.env.VITE_EVENT_ID || "coffee-20261109";
export const EVENT_MISSIONS = {
  deck: "덱 등록",
  skills: "스킬 시뮬레이터",
  moment: "슈프림 모먼트 조합",
  hof: "일반 HOF 영입",
} as const;
export type EventMission = keyof typeof EVENT_MISSIONS;
export type EventSkill = DrawSkill & { score: number; basis: string };
export interface EventAttempt {
  number: number;
  request_id: string;
  score: number;
  board: EventSkill[];
  achieved_at: string;
}
export interface EventPlayer {
  id: string;
  name: string;
  team?: string;
  theme?: string;
  grade?: string;
}
export interface EventExperience {
  preview: EventPlayer[] | null;
  result: EventPlayer | null;
  chosen_slot: number | null;
}
export interface EventTicket {
  id: string;
  participant_id: string;
  deck_name: string;
  mission: EventMission;
  issued_at: string;
  eligible: boolean;
}
export interface EventState {
  event: {
    id: string;
    title: string;
    rules_id: string;
    opens_at: string;
    ends_at: string | null;
    published: boolean;
    phase: "open" | "closed" | "drawn";
    closed_at: string | null;
    drawn_at: string | null;
    champion_id: string | null;
    winner_id: string | null;
    winning_ticket: string | null;
    champion_verified_at: string | null;
    champion_delivered_at: string | null;
    winner_verified_at: string | null;
    winner_delivered_at: string | null;
  };
  verification_decks: {
    id: string;
    deck_name: string;
    joined_at: string;
    deck: { players?: { name?: string; pos?: string; card?: string }[] } | null;
  }[];
  server_now: string;
  is_admin: boolean;
  me: null | {
    id: string;
    ranking_id: string;
    deck_name: string;
    attempts: EventAttempt[];
    evidence: Partial<Record<EventMission, string>>;
    experiences: Partial<Record<"moment" | "hof", EventExperience>>;
  };
  rankings: {
    rank: number;
    id: string;
    deck_name: string;
    score: number;
    achieved_at: string;
    board: EventSkill[];
  }[];
  tickets: EventTicket[];
  audit: { action: string; at: string; details: Record<string, unknown> }[];
}
const messages: Record<string, string> = {
  event_not_found: "이벤트를 준비 중입니다. 공개 후 다시 확인해주세요.",
  event_login_required: "운영자 계정으로 로그인해주세요.",
  event_not_open: "아직 이벤트 참여가 시작되지 않았습니다.",
  event_closed:
    "이벤트가 마감되었습니다. 기록과 결과는 계속 확인할 수 있습니다.",
  event_join_required: "등록한 덱으로 먼저 이벤트에 참여해주세요.",
  event_deck_ownership_required:
    "덱 소유권을 확인할 수 없습니다. 덱랭킹에서 비밀번호로 내 덱을 다시 가져와주세요.",
  event_registered_deck_required:
    "선수가 등록된 덱을 덱랭킹에 저장한 뒤 참여해주세요.",
  event_attempt_limit: "5번의 도전을 모두 사용했습니다.",
  event_evidence_required: "해당 시뮬레이터의 이벤트 참여를 먼저 완료해주세요.",
  event_experience_required: "먼저 조합 후보를 확인해주세요.",
  event_admin_required: "운영자만 실행할 수 있습니다.",
  event_winner_required: "당첨자가 확정된 뒤 처리할 수 있습니다.",
  event_verification_required: "실제 게임 덱 인증을 먼저 확인해주세요.",
  event_close_first: "이벤트를 마감한 후 추첨해주세요.",
  event_rules_missing:
    "이벤트 준비 중입니다. 아직 도전 횟수는 사용되지 않았습니다.",
};
export function eventError(error: unknown): string {
  if (isMissingRpc(error))
    return "이벤트 서버를 준비 중입니다. 연결이 완료되면 참여할 수 있어요.";
  const message = errMessage(error);
  return (
    Object.entries(messages).find(([key]) => message.includes(key))?.[1] ||
    "요청 결과를 확인하지 못했습니다. 새로고침하거나 다시 시도해주세요. 같은 도전 요청은 중복 차감되지 않습니다."
  );
}
export async function eventRequest(
  action: string,
  args: Record<string, unknown> = {},
  deck?: RankRef,
): Promise<EventState> {
  if (!supabase) throw Error("event_not_found");
  const { data, error } = await supabase.rpc(`event_${action}`, {
    p_event: EVENT_ID,
    ...args,
    ...(action === "admin"
      ? {}
      : { p_ranking_id: deck?.id ?? null, p_token: deck?.token ?? null }),
  });
  if (error) throw error;
  if (!data?.event || !data?.server_now) throw Error("invalid_event_response");
  return data as EventState;
}
export function eventAccepting(state: EventState): boolean {
  const e = state.event,
    now = Date.parse(state.server_now);
  return (
    e.published &&
    e.phase === "open" &&
    now >= Date.parse(e.opens_at) &&
    (!e.ends_at || now < Date.parse(e.ends_at))
  );
}
