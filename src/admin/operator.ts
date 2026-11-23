import { supabase, isMissingRpc, errMessage } from "../lib/supabase";
import { eventError } from "../lib/events";

export async function operatorRpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw Error("operator_server_missing");
  const { data, error } = await supabase.rpc(`event_operator_${name}`, args);
  if (error) throw error;
  return data;
}
export function operatorError(e: unknown) {
  if (isMissingRpc(e) || errMessage(e).includes("operator_server_missing"))
    return "관리자 서버 설정이 아직 적용되지 않았습니다. 전달받은 이벤트 설치 SQL을 Supabase SQL Editor에서 실행해주세요.";
  if (errMessage(e).includes("event_invalid_credentials")) return "비밀번호가 올바르지 않습니다.";
  if (errMessage(e).includes("event_operator_session_expired"))
    return "로그인이 만료되었습니다. 다시 로그인해주세요.";
  return eventError(e);
}
