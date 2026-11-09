import type { PlayerInput } from "./engine";
import { bullpenRole } from "./bullpen";

export const RANKING_REQUIREMENT = "타자 9명 · 선발투수 5명 · 중계투수 3명 · 마무리 1명 이상";
export function rankingEligibility(players: PlayerInput[]) {
  const counts = { batter: 0, starter: 0, relief: 0, closer: 0 };
  const seen = new Set<number>();
  for (const p of players) {
    if (!p.name.trim() || seen.has(p.excelRow)) continue;
    seen.add(p.excelRow);
    if (p.kind === "batter" && p.excelRow >= 11 && p.excelRow <= 19) counts.batter++;
    else if (p.kind === "pitcher" && p.excelRow >= 22 && p.excelRow <= 26) counts.starter++;
    else {
      const role = bullpenRole(p);
      if (role === "closer") counts.closer++;
      else if (role) counts.relief++;
    }
  }
  const groups = [
    { key: "batter", label: "타자", count: counts.batter, required: 9 },
    { key: "starter", label: "선발투수", count: counts.starter, required: 5 },
    { key: "relief", label: "중계투수", count: counts.relief, required: 3 },
    { key: "closer", label: "마무리", count: counts.closer, required: 1 },
  ];
  const missing = groups.filter(g => g.count < g.required);
  return { groups, eligible: missing.length === 0,
    message: missing.length ? `공개 등록·업데이트에 필요한 선수가 부족합니다: ${missing.map(g => `${g.label} ${g.required - g.count}명`).join(", ")}. 선수 이름을 입력해주세요.` : "공개 등록 조건을 충족했습니다." };
}
