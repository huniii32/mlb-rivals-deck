/** 공식 효과를 앱의 기존 능력치 가중치로 환산. 게임의 승률/획득확률이 아니다. */
export const SKILL_SOURCES = {
  september: "https://community.withhive.com/MLB9IRIVALS/ko/board/all/17590",
  october: "https://community.withhive.com/MLB9IRIVALS/ko/board/all/17979",
};
type Entry = { kind: "batter" | "pitcher"; name: string; score: number; formula: string; source: string; rpOnly?: boolean };
const entries: Entry[] = [];
const add = (kind: Entry["kind"], name: string, score: number, formula: string, source: string, rpOnly = false) =>
  entries.push({ kind, name, score: Math.round(score * 100) / 100, formula, source, rpOnly });
const bat = 1.1 + 0.9 + 0.4, pitch = 1.15 + 1.2;
for (const kind of ["batter", "pitcher"] as const) {
  const self = kind === "batter" ? bat : pitch;
  const opponent = kind === "batter" ? pitch : bat;
  add(kind, "[S0] 2026 퍼포머트리오 (랭대)", 10 * self, `10 × ${self.toFixed(2)}`, SKILL_SOURCES.october);
  add(kind, "[S0] WAR 리더", 9 * self + 6 * opponent,
    `9 × ${self.toFixed(2)} + 상대 감소 6 × ${opponent.toFixed(2)}`, SKILL_SOURCES.october);
}
// S = 기존 점수표의 S0. 조건별 점수를 별도 선택하여 임의의 발동률을 넣지 않는다.
for (let level = 0; level <= 2; level++) {
  const base = [4, 6, 9][level], early = [11, 13, 16][level];
  const win = [8, 10, 13][level], comeback = [6, 8, 11][level];
  for (const active of [false, true]) {
    add("pitcher", `[S${level}] 레버리지 릴리퍼 (${active ? "3아웃 이전" : "3아웃 이후"})`,
      base * bat + (active ? early * 2 : 0), `${base} × 2.4${active ? ` + ${early} × 2.0` : ""}`, SKILL_SOURCES.september, true);
    add("pitcher", `[S${level}] 승리 공식 (${active ? "동점·리드" : "지고 있음"})`,
      base * pitch + (active ? win * bat : 0), `${base} × 2.35${active ? ` + ${win} × 2.4` : ""}`, SKILL_SOURCES.september, true);
    add("pitcher", `[S${level}] 컴백 플래그 (${active ? "동점·지고 있음" : "리드"})`,
      (base + (active ? comeback : 0)) * pitch,
      `(${base} + ${active ? comeback : 0}) × 2.35; 팀 타자 버프는 투수 개인점수에서 제외`, SKILL_SOURCES.september, true);
  }
}
// 아웃 카운트는 등판 이후 처리한 수. 기대값이 아닌 해당 시점의 점수.
for (let level = 0; level <= 4; level++) {
  for (const outs of Array.from({ length: 21 }, (_, i) => i)) {
    const value = Math.max(2, 14 + 2 * level - outs);
    add("pitcher", `[S${level}] 신속한 처리 (${outs}아웃 처리)`, value * pitch,
      `max(2, ${14 + 2 * level} − ${outs}) × 2.35`, SKILL_SOURCES.october, true);
  }
}
export const NEW_SKILLS = entries;

/** 상호 배타적인 두 상황의 가중 평균. 확률은 사용자가 명시한 가정이다. */
export function expectedScore(inactive: number, active: number, percent: number): number {
  if (![inactive, active, percent].every(Number.isFinite) || percent < 0 || percent > 100) return NaN;
  return inactive + (active - inactive) * percent / 100;
}
export function trialProbability(percent: number, trials: number): { atLeastOne: number; meanTrials: number } | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || !Number.isSafeInteger(trials) || trials < 0) return null;
  const p = percent / 100;
  return { atLeastOne: trials === 0 ? 0 : p === 1 ? 1 : -Math.expm1(trials * Math.log1p(-p)), meanTrials: p === 0 ? Infinity : 1 / p };
}
