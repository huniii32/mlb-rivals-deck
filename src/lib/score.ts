import type { LineupSlot, Player, ScoreWeights } from "../types";

export interface ScoreBreakdown {
  total: number;
  gradePoints: number;
  overallPoints: number;
  synergyPoints: number;
  synergyTeam: string;
  synergyCount: number;
  filled: number;
  totalSlots: number;
}

export function calcScore(
  players: Player[],
  slots: LineupSlot[],
  weights: ScoreWeights,
): ScoreBreakdown {
  const byId = new Map(players.map((p) => [p.id, p]));
  const lined = slots
    .map((s) => (s.playerId ? byId.get(s.playerId) : undefined))
    .filter((p): p is Player => Boolean(p));

  let gradePoints = 0;
  let overallPoints = 0;
  for (const p of lined) {
    gradePoints += weights.gradeScores[p.grade] ?? 0;
    overallPoints += p.overall * weights.overallWeight;
  }

  const teamCount = new Map<string, number>();
  for (const p of lined) {
    const t = p.team.trim() || "무소속";
    teamCount.set(t, (teamCount.get(t) ?? 0) + 1);
  }
  let synergyTeam = "-";
  let synergyCount = 0;
  for (const [team, count] of teamCount) {
    if (count > synergyCount) {
      synergyCount = count;
      synergyTeam = team;
    }
  }
  const synergyPoints = Math.min(synergyCount * weights.synergyPerCount, weights.synergyMax);

  return {
    total: Math.round(gradePoints + overallPoints + synergyPoints),
    gradePoints: Math.round(gradePoints),
    overallPoints: Math.round(overallPoints),
    synergyPoints: Math.round(synergyPoints),
    synergyTeam,
    synergyCount,
    filled: lined.length,
    totalSlots: slots.length,
  };
}
