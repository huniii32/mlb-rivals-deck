import type { Chem, PlayerInput } from "./engine";

export const CHEM_LABELS: [keyof Chem, string][] = [
  ["commander", "커맨더"],
  ["catcher", "포수리드"],
  ["pitchChem", "투수케미스트리"],
  ["batChem", "타자케미스트리"],
  ["wbcP", "WBC에이스(투수)"],
  ["wbcB", "WBC에이스(타자)"],
  ["lockdown", "락다운(CP 배치)"],
];

/** 랭킹대전 공격 기준. 기존 개인 스킬표에 포함된 값과 팀 효과를 중복 합산하지 않는다. */
export function additionalTeamScore(p: PlayerInput, chem: Chem): number {
  // 컴백 플래그는 중계 등판·점수 상황에 따른 효과다. 이전 덱의 선택값도
  // 상시 팀 가산에 사용하지 않는다. 투수 개인 스킬 점수는 별도로 유지한다.
  if (p.kind === "batter") return 0;
  if (chem.lockdown !== "O") return 0;
  // 락다운 개인 18.4 = 등판 효과 7×2.4 + 7~9회 효과 2×2.4×(3/9).
  // 본인의 기존 개인 점수에는 이미 1.6이 포함돼 있다. 팀 전체 CP 배치 효과는 중첩되지 않는다.
  return p.skills.some((s) => s.trim() === "[S0] 락다운") ? 0 : 1.6;
}
