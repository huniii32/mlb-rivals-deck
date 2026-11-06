export const time = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
export const score = (value: number) => value.toFixed(2);
export const prizeStatus = (
  verified: string | null,
  delivered: string | null,
) =>
  delivered
    ? "지급 완료"
    : verified
      ? "게임 덱 인증 완료 · 지급 대기"
      : "게임 덱 인증 대기";
export const auditLabels: Record<string, string> = {
  publish: "이벤트 공개",
  unpublish: "이벤트 비공개 전환",
  close: "마감 · 점수 1위 및 추첨 대상 확정",
  draw: "추첨 완료 · 결과 고정",
  verify_champion: "점수 1위 · 게임 덱 인증 완료",
  verify_winner: "추첨 당첨자 · 게임 덱 인증 완료",
  deliver_champion: "점수 1위 · 경품 지급 완료",
  deliver_winner: "추첨 당첨자 · 경품 지급 완료",
};
