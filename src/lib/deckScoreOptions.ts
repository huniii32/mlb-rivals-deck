import type { PlayerInput } from "./engine";
import { bullpenRole } from "./bullpen";
import { findTeam } from "./mlbTeams";
import { DECADE_TARGET_ROWS, YEAR_ANCHOR, type DeckScoreRegion, type DeckScoreSide } from "./deckScoreTargets";

export const BATTER_STATS = ["파워", "정확", "선구"] as const;
export const PITCHER_STATS = ["변화", "구위"] as const;
type Bonuses = Partial<Record<typeof BATTER_STATS[number] | typeof PITCHER_STATS[number] | "전체" | "제구" | "수비", number>>;

function playerConditions(p: PlayerInput, preferredTeam?: string) {
  const pos = p.pos.trim().toUpperCase();
  const batter = p.kind === "batter";
  const pitcher = p.kind === "pitcher";
  const relief = bullpenRole(p);
  const order = Number(p.order);
  const card = p.card.trim();
  const live = ["라이브/시즌", "라이브", "시즌"].includes(card);
  const special = !!card && !live;
  const hof = card === "명예의 전당" || card === "HOF";
  const universal = hof || /^(FA|WBC)/.test(card);
  const team = findTeam(p.team);
  const preferred = findTeam(preferredTeam);
  const preferredCard = universal || (!!preferred && team?.id === preferred.id);
  const league = (universal ? preferred : team)?.league;
  const decadeEligible = !!card && !hof && !card.includes("모먼트");
  return {
    "타자": batter, "투수": pitcher,
    "선발 투수": pitcher && !relief, "불펜 투수": !!relief, "마무리": relief === "closer",
    "미드 인필더(2루수 + 유격수)": batter && ["2B", "SS"].includes(pos),
    "코너 인필더(1루수 + 3루수)": batter && ["1B", "3B"].includes(pos),
    "내야수 + 포수": batter && ["C", "1B", "2B", "3B", "SS"].includes(pos),
    "외야수 + 지명타자": batter && ["LF", "CF", "RF", "DH"].includes(pos),
    "배터리(투수 + 포수)": pitcher || pos === "C",
    "테이블 세터": batter && [1, 2].includes(order),
    "클린업 트리오": batter && [3, 4, 5].includes(order),
    "하위 타선": batter && [6, 7, 8, 9].includes(order),
    "라이브/시즌 선수": live, "라이브/시즌 투수": live && pitcher,
    "스페셜 카드 선수": special, "스페셜 카드 투수": special && pitcher,
    "선호구단 선수": preferredCard,
    "선호구단 라이브/시즌 선수": preferredCard && live,
    "선호구단 스페셜 카드 선수": preferredCard && special,
    "AL 선수": league === "AL", "AL 타자": league === "AL" && batter, "AL 투수": league === "AL" && pitcher,
    "NL 선수": league === "NL", "NL 타자": league === "NL" && batter, "NL 투수": league === "NL" && pitcher,
    "+10 강화 이상 타자": batter && Number(p.enhLv) >= 10, "+10 강화 이상 투수": pitcher && Number(p.enhLv) >= 10,
    "OVR 80 이상 타자": batter && Number(p.cardOvr) >= 80, "OVR 80 이상 투수": pitcher && Number(p.cardOvr) >= 80,
    "선택 연대 타자": batter && decadeEligible, "선택 연대 투수": pitcher && decadeEligible,
    "선택 연대 선호구단 선수": preferredCard && decadeEligible,
  };
}

function effect(target: keyof ReturnType<typeof playerConditions>, bonuses: Bonuses) {
  return { target, bonuses };
}
type Effect = ReturnType<typeof effect>;
function row(region: DeckScoreRegion, row: number, threshold: number, left: Effect, right?: Effect) {
  const yearRow = region === "spec" ? YEAR_ANCHOR[threshold] : undefined;
  const targetRow = region === "spec" ? DECADE_TARGET_ROWS[threshold] : undefined;
  const sides: DeckScoreSide[] = right ? ["L", "R"] : yearRow === undefined ? ["L"] : [];
  return { region, row, threshold, left, right, sides, yearRow, targetRow };
}

// 공식 개편표 11960(팀), 13363(스페셜). 저장된 선택 키의 행 번호를 유지한다.
// 평가 능력치를 기록하고, 확인된 게임 내 추가 효과도 함께 표시한다. 점수 합산은 평가 능력치만 사용한다.
export const DECK_SCORE_OPTIONS = {
  team: [
    row("team", 10, 200, effect("선호구단 선수", {전체: 3})),
    row("team", 11, 240, effect("타자", {파워: 2, 정확: 2, 선구: 1}), effect("투수", {구위: 2, 변화: 2})),
    row("team", 12, 260, effect("선발 투수", {변화: 1}), effect("불펜 투수", {구위: 1})),
    row("team", 13, 280, effect("선호구단 라이브/시즌 선수", {전체: 2}), effect("선호구단 스페셜 카드 선수", {전체: 1})),
    row("team", 14, 300, effect("미드 인필더(2루수 + 유격수)", {정확: 2, 선구: 1}), effect("코너 인필더(1루수 + 3루수)", {파워: 2})),
    row("team", 15, 315, effect("AL 선수", {전체: 1}), effect("NL 선수", {전체: 1})),
    row("team", 16, 330, effect("라이브/시즌 투수", {}), effect("선호구단 스페셜 카드 선수", {})),
    row("team", 17, 345, effect("내야수 + 포수", {}), effect("불펜 투수", {})),
    row("team", 18, 360, effect("외야수 + 지명타자", {파워: 1, 정확: 1}), effect("선발 투수", {구위: 1})),
    row("team", 19, 375, effect("라이브/시즌 선수", {전체: 1}), effect("선호구단 스페셜 카드 선수", {전체: 1})),
    row("team", 20, 390, effect("테이블 세터", {정확: 1, 선구: 1}), effect("마무리", {전체: 1})),
    row("team", 21, 405, effect("+10 강화 이상 타자", {파워: 1, 정확: 1}), effect("+10 강화 이상 투수", {구위: 1, 변화: 1})),
    row("team", 22, 420, effect("타자", {파워: 1, 선구: 1}), effect("투수", {구위: 1})),
    row("team", 23, 435, effect("내야수 + 포수", {전체: 1}), effect("외야수 + 지명타자", {전체: 1})),
    row("team", 24, 450, effect("타자", {파워: 1, 정확: 1}), effect("투수", {구위: 1, 변화: 1})),
    row("team", 25, 460, effect("라이브/시즌 선수", {전체: 1}), effect("선호구단 스페셜 카드 선수", {전체: 1})),
    row("team", 26, 470, effect("타자", {정확: 1}), effect("투수", {변화: 1})),
    row("team", 27, 480, effect("선발 투수", {전체: 1}), effect("불펜 투수", {전체: 2})),
    row("team", 28, 490, effect("불펜 투수", {변화: 2, 구위: 2}), effect("선발 투수", {변화: 1, 구위: 1})),
    row("team", 29, 500, effect("선호구단 선수", {전체: 2})),
    row("team", 30, 520, effect("타자", {정확: 1}), effect("투수", {변화: 1})),
    row("team", 31, 540, effect("내야수 + 포수", {정확: 1}), effect("불펜 투수", {구위: 1})),
    row("team", 32, 560, effect("클린업 트리오", {정확: 2, 선구: 2}), effect("선발 투수", {구위: 1})),
    row("team", 33, 580, effect("타자", {파워: 1}), effect("투수", {구위: 1})),
    row("team", 34, 600, effect("선발 투수", {전체: 1}), effect("불펜 투수", {전체: 2})),
  ],
  spec: [
    row("spec", 10, 100, effect("선호구단 선수", {전체: 2})),
    row("spec", 11, 150, effect("타자", {파워: 1, 정확: 1, 선구: 1})),
    row("spec", 12, 200, effect("선호구단 선수", {전체: 3})),
    row("spec", 13, 220, effect("AL 타자", {정확: 1, 선구: 1}), effect("NL 타자", {정확: 1, 선구: 1})),
    row("spec", 14, 240, effect("불펜 투수", {구위: 1}), effect("하위 타선", {선구: 2, 정확: 1})),
    row("spec", 15, 260, effect("타자", {전체: 1}), effect("투수", {전체: 1})),
    row("spec", 16, 280, effect("미드 인필더(2루수 + 유격수)", {전체: 1}), effect("코너 인필더(1루수 + 3루수)", {전체: 1})),
    row("spec", 17, 300, effect("AL 투수", {전체: 1}), effect("NL 투수", {전체: 1})),
    row("spec", 18, 320, effect("선발 투수", {구위: 1}), effect("불펜 투수", {전체: 1})),
    row("spec", 19, 340, effect("타자", {정확: 1, 선구: 1}), effect("투수", {변화: 1})),
    row("spec", 20, 360, effect("+10 강화 이상 타자", {정확: 1}), effect("+10 강화 이상 투수", {변화: 1})),
    row("spec", 21, 380, effect("라이브/시즌 투수", {전체: 1}), effect("스페셜 카드 투수", {변화: 1})),
    row("spec", 22, 400, effect("선호구단 선수", {전체: 1})),
    row("spec", 23, 420, effect("테이블 세터", {전체: 1}), effect("미드 인필더(2루수 + 유격수)", {전체: 1})),
    row("spec", 24, 440, effect("OVR 80 이상 타자", {파워: 2, 선구: 1}), effect("OVR 80 이상 투수", {구위: 2})),
    row("spec", 25, 460, effect("타자", {파워: 1, 선구: 1}), effect("투수", {구위: 1})),
    row("spec", 26, 480, effect("배터리(투수 + 포수)", {전체: 1}), effect("타자", {전체: 1})),
    row("spec", 27, 500, effect("AL 선수", {전체: 2}), effect("NL 선수", {전체: 2})),
    row("spec", 28, 520, effect("내야수 + 포수", {파워: 1, 정확: 1}), effect("선발 투수", {변화: 1})),
    row("spec", 29, 540, effect("하위 타선", {파워: 1, 선구: 1}), effect("불펜 투수", {전체: 1})),
    row("spec", 30, 560, effect("라이브/시즌 선수", {전체: 2}), effect("스페셜 카드 선수", {전체: 1})),
    row("spec", 31, 580, effect("테이블 세터", {파워: 1}), effect("클린업 트리오", {정확: 1, 선구: 1})),
    row("spec", 32, 600, effect("타자", {전체: 1}), effect("투수", {전체: 1})),
    row("spec", 33, 615, effect("선택 연대 타자", {정확: 1, 선구: 1}), effect("선택 연대 투수", {변화: 1, 제구: 1})),
    row("spec", 34, 630, effect("외야수 + 지명타자", {정확: 1}), effect("불펜 투수", {전체: 1})),
    row("spec", 35, 645, effect("선택 연대 타자", {파워: 1}), effect("선택 연대 투수", {구위: 1, 수비: 1})),
    row("spec", 36, 660, effect("선호구단 선수", {파워: 1, 정확: 1, 선구: 1, 변화: 1, 구위: 1})),
    row("spec", 37, 680, effect("선택 연대 선호구단 선수", {전체: 1})),
    row("spec", 38, 700, effect("선호구단 선수", {전체: 1})),
  ],
};

const rules = [...DECK_SCORE_OPTIONS.team, ...DECK_SCORE_OPTIONS.spec];
type ScoreRule = typeof rules[number];
export function selectedEffect(rule: ScoreRule, flags: Record<string, boolean>) {
  if (!rule.sides.length) return rule.left;
  const key = `${rule.row}-${rule.region}`;
  const left = !!flags[`${key}-L`];
  const right = !!rule.right && !!flags[`${key}-R`];
  return left === right ? undefined : right ? rule.right : rule.left;
}

type Eligibility = { state: "applied" | "excluded" | "unknown"; reason: string };
function matchesRow(rule: ScoreRule, choice: Effect, p: PlayerInput, years: Record<number, number | "">,
  conditions: ReturnType<typeof playerConditions>) {
  if (!conditions[choice.target]) return false;
  if (rule.yearRow === undefined) return true;
  const year = years[rule.yearRow];
  return typeof year === "number" && typeof p.year === "number" && p.year >= year && p.year <= year + 9;
}

function rowEligibility(rule: ScoreRule, choice: Effect, p: PlayerInput, years: Record<number, number | "">,
  preferredTeam: string | undefined, conditions: ReturnType<typeof playerConditions>): Eligibility {
  if (matchesRow(rule, choice, p, years, conditions)) return { state: "applied", reason: "" };
  const target = choice.target;
  const excluded = (reason: string): Eligibility => ({ state: "excluded", reason });
  const unknown = (reason: string): Eligibility => ({ state: "unknown", reason });
  if ((target.endsWith("투수") && p.kind !== "pitcher") || (target.endsWith("타자") && p.kind !== "batter"))
    return excluded("타자·투수 구분 불일치");
  const card = p.card.trim();
  if (rule.yearRow !== undefined) {
    if (card === "HOF" || card === "명예의 전당" || card.includes("모먼트")) return excluded("연대 효과 제외 카드");
    const year = years[rule.yearRow];
    if (typeof year !== "number") return unknown("구간 기준 연도 미입력");
    if (typeof p.year === "number" && (p.year < year || p.year > year + 9)) return excluded(`${p.year}년 · 선택 연대 밖`);
    if (typeof p.year !== "number") return unknown("선수 연도 미입력");
  }
  if (target.includes("OVR") && typeof p.cardOvr !== "number") return unknown("카드 OVR 미입력");
  if (target.startsWith("+10") && typeof p.enhLv !== "number") return unknown("강화 단계 미입력");
  if (["테이블 세터", "클린업 트리오", "하위 타선"].includes(target) && p.kind === "batter" && !p.order) return unknown("타순 미입력");
  const live = conditions["라이브/시즌 선수"];
  if (card && ((target.includes("라이브/시즌") && !live) || (target.includes("스페셜 카드") && live))) return excluded("카드 종류 불일치");
  if (!p.pos.trim() && p.kind === "batter" && /인필더|내야수|외야수|배터리/.test(target)) return unknown("포지션 미입력");
  if (!card && /선호구단|라이브|스페셜|연대|^(AL|NL)/.test(target)) return unknown("카드 종류 미입력");
  if (target.includes("선호구단") && !findTeam(preferredTeam)) return unknown("선호 구단 미선택");
  if (target.includes("선호구단") && !findTeam(p.team)) return unknown("선수 구단 확인 필요");
  if (/^(AL|NL)/.test(target)) {
    const universal = card === "HOF" || card === "명예의 전당" || /^(FA|WBC)/.test(card);
    if (!findTeam(universal ? preferredTeam : p.team)) return unknown(universal ? "선호 구단 미선택" : "선수 구단 확인 필요");
  }
  return excluded(`${target} 조건 불충족`);
}

export function rowPlayers(rule: ScoreRule, choice: Effect, players: PlayerInput[], years: Record<number, number | "">, preferredTeam: string) {
  return players.filter(p => p.name.trim()).map(p => ({
    player: p, ...rowEligibility(rule, choice, p, years, preferredTeam, playerConditions(p, preferredTeam)),
  }));
}
export function officialDeckBonus(p: PlayerInput, flags: Record<string, boolean>, years: Record<number, number | "">, preferredTeam?: string) {
  const conditions = playerConditions(p, preferredTeam);
  const stats = p.kind === "pitcher" ? PITCHER_STATS : BATTER_STATS;
  const sums = [0, 0, 0];
  const hits: { threshold: number; region: string; stat: string; pts: number }[] = [];
  for (const rule of rules) {
    const choice = selectedEffect(rule, flags);
    if (!choice || !matchesRow(rule, choice, p, years, conditions)) continue;
    stats.forEach((stat, i) => {
      const pts = choice.bonuses[stat] ?? choice.bonuses.전체;
      if (!pts) return;
      sums[i] += pts;
      hits.push({ threshold: rule.threshold, region: rule.region === "team" ? "팀덱코" : "스덱코", stat, pts });
    });
  }
  return { sums, hits };
}
