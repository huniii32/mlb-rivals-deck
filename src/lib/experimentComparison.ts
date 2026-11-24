import { CHEM_LABELS } from "./teamBuffs";
import type { Deck } from "./deck";
import { BULLPEN_ROLES, ROLE_LABELS, bullpenCounts, bullpenRole, normalizeTactics } from "./bullpen";
import { BATTER_STATS, PITCHER_STATS, DECK_SCORE_OPTIONS, selectedEffect } from "./deckScoreOptions";
import type { PlayerInput, PlayerResult } from "./engine";

export const formatPoints = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
type Value = string | number | null | undefined;
export type Change = { label: string; before: string; after: string };
function compare(changes: Change[], label: string, before: Value, after: Value) {
  const show = (v: Value) => v == null || v === "" ? "—" : typeof v === "number" ? formatPoints(v) : v;
  if (show(before) !== show(after)) changes.push({ label, before: show(before), after: show(after) });
}

export function settingChanges(old: Deck, next: Deck) {
  const changes: Change[] = [];
  compare(changes, "선호 구단", old.preferredTeam, next.preferredTeam);
  for (const region of ["team", "spec"] as const) {
    for (const rule of DECK_SCORE_OPTIONS[region]) {
      const label = (region === "team" ? "팀" : "스페셜") + " 덱스코어 " + rule.threshold;
      if (rule.sides.length) compare(changes, label, selectedEffect(rule, old.flags)?.target, selectedEffect(rule, next.flags)?.target);
      if (rule.yearRow !== undefined) compare(changes, label + " 기준 연도", String(old.yearInputs[rule.yearRow] ?? ""), String(next.yearInputs[rule.yearRow] ?? ""));
    }
  }
  for (const [key, label] of CHEM_LABELS) compare(changes, label, old.chem[key] ?? "X", next.chem[key] ?? "X");
  const counts = bullpenCounts(old.players), nextCounts = bullpenCounts(next.players);
  for (const role of BULLPEN_ROLES) compare(changes, ROLE_LABELS[role] + " 배치", counts[role], nextCounts[role]);
  const names = { basic: "기본", aggressive: "적극", division: "분업" };
  const tactics = normalizeTactics(old.bullpenTactics), nextTactics = normalizeTactics(next.bullpenTactics);
  for (const role of ["winning", "chasing"] as const) compare(changes, ROLE_LABELS[role] + " 전술", names[tactics[role]], names[nextTactics[role]]);
  return changes;
}

const fields = { enhLv: "강화", transLv: "초월", pohLv: "포지션 훈련", team: "구단", year: "연도", card: "카드", cardOvr: "카드 OVR", order: "타순", pos: "포지션", wbcCountry: "WBC 국가", enName: "영문 이름" } as const;
const training = { base: "기본", train: "훈련", spec: "특훈", extra: "포훈 보너스", synergy: "시너지", locker: "라커룸", blackPos: "블랙포지션", blackBoost: "블랙부스트", leaderBonus: "리더 영향력" } as const;

function inputChanges(old: PlayerInput, next: PlayerInput, stats: readonly string[]) {
  const changes: Change[] = [];
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) compare(changes, fields[key], String(old[key] ?? ""), String(next[key] ?? ""));
  const a = bullpenRole(old), b = bullpenRole(next);
  compare(changes, "역할", a && ROLE_LABELS[a], b && ROLE_LABELS[b]);
  for (const key of Object.keys(training) as (keyof typeof training)[]) {
    stats.forEach((stat, i) => compare(changes, training[key] + " " + stat, old[key]?.[i], next[key]?.[i]));
  }
  if (old.photoUrl !== next.photoUrl) changes.push({ label: "선수 사진", before: old.photoUrl ? "기존 사진" : "기본", after: next.photoUrl ? "새 사진" : "기본" });
  return changes;
}

export function playerChanges(original: Deck, working: Deck, previous: PlayerResult[], results: PlayerResult[]) {
  const slots = new Set([...original.players, ...working.players].map(p => p.excelRow));
  return [...slots].flatMap(row => {
    const i = original.players.findIndex(p => p.excelRow === row), j = working.players.findIndex(p => p.excelRow === row);
    const old = original.players[i], next = working.players[j];
    const from = old?.name.trim() ? previous[i] : undefined, to = next?.name.trim() ? results[j] : undefined;
    if (!from && !to) return [];
    const stats = (next ?? old).kind === "pitcher" ? PITCHER_STATS : BATTER_STATS;
    const effects: Change[] = [];
    stats.forEach((stat, k) => {
      compare(effects, stat, from?.final[k], to?.final[k]);
      if (from && to && from.manual[k] !== to.manual[k]) compare(effects, stat + " 입력", from.manual[k] ? "직접" : "자동", to.manual[k] ? "직접" : "자동");
    });
    const skills: Change[] = [];
    for (let k = 0; k < 4; k++) {
      const line = (p: PlayerInput | undefined, r?: PlayerResult) => {
        const skill = r?.skillDetails[k];
        if (!skill?.name) return "";
        const entered = p?.skills[k];
        const label = entered && entered !== skill.name ? entered + " · " + skill.name : skill.name;
        return label + (skill.score == null ? " (점수 미확인)" : " (" + formatPoints(skill.score) + "점)");
      };
      compare(skills, "스킬 " + (k + 1), line(old, from), line(next, to));
    }
    compare(effects, "능력치 점수", from?.ability, to?.ability);
    compare(effects, "스킬 합계", from && (from.skill ?? "점수 미확인"), to && (to.skill ?? "점수 미확인"));
    const inputs = from && to ? inputChanges(old, next, stats) : [];
    const diff = (to?.total ?? 0) - (from?.total ?? 0);
    if (!effects.length && !skills.length && !inputs.length && old?.name === next?.name && !diff) return [];
    const title = old?.name === next?.name ? next.name : (old?.name || "빈 슬롯") + " → " + (next?.name || "빈 슬롯");
    return [{ row, title, pos: (next ?? old).pos, before: from?.total, after: to?.total, diff, changes: [...inputs, ...skills, ...effects] }];
  }).sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff));
}
