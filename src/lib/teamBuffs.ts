import type { Chem, PlayerInput } from "./engine";

/** 랭킹대전 공격 기준. 기존 개인 스킬표에 포함된 값과 팀 효과를 중복 합산하지 않는다. */
export function additionalTeamScore(p: PlayerInput, chem: Chem): number {
  if (p.kind === "batter") {
    const gain = ({ S: 3, S1: 3, S2: 4 } as Record<string, number>)[chem.comebackFlag ?? "X"] ?? 0;
    return gain * (1.1 + 0.9);
  }
  if (chem.lockdown !== "O") return 0;
  // 락다운 개인 18.4 = 등판 효과 7×2.4 + 7~9회 효과 2×2.4×(3/9).
  // 본인의 기존 개인 점수에는 이미 1.6이 포함돼 있다. 팀 전체 CP 배치 효과는 중첩되지 않는다.
  return p.skills.some((s) => s.trim() === "[S0] 락다운") ? 0 : 1.6;
}
