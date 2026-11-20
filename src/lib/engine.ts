import { NEW_SKILLS } from "./skillUpdates";
import { WBC_SKILLS, resolveWbcSkill } from "./wbcSkills";
import lookup from "../data/lookup.json";
import { flags as workbookFlags } from "../data/deckrules.json";
import { ROLE_PROFILES, bullpenRole, tacticBonuses } from "./bullpen";
import type { BullpenRole, BullpenTactics } from "./bullpen";
import { additionalTeamScore } from "./teamBuffs";
import { BATTER_STATS, PITCHER_STATS, officialDeckBonus } from "./deckScoreOptions";
export { BATTER_STATS, PITCHER_STATS } from "./deckScoreOptions";

export type Kind = "batter" | "pitcher";

interface Lookup {
  batter: { name: string; score: number }[];
  pitcher: { name: string; score: number }[];
  enhance: Record<string, number[]>;
  pohoon: Record<string, number[]>;
  transcend: Record<string, number[]>;
  cards: string[];
  chem: Record<string, string[]>;
}
export const LOOKUP: Lookup = {
  ...lookup,
  batter: [...lookup.batter, ...WBC_SKILLS.filter(s => s.kind === "batter")],
  pitcher: [...lookup.pitcher, ...WBC_SKILLS.filter(s => s.kind === "pitcher")],
};

export interface Chem {
  comebackFlag?: string; // 구버전 덱 호환용. 상시 팀 점수에는 사용하지 않는다.
  lockdown?: string; // CP 배치 락다운의 7~9회 팀 효과 (랭대 9이닝 평균)
  commander: string; // O2 커맨더
  catcher: string; // O3 포수리드
  pitchChem: string; // O4 투수케미스트리
  batChem: string; // O5 타자케미스트리
  wbcP: string; // O6 WBC에이스(투수)
  wbcB: string; // O7 WBC에이스(타자)
}

export interface PlayerInput {
  bullpenRole?: BullpenRole;
  excelRow: number;
  kind: Kind;
  pos: string;
  order: number | "";
  card: string;
  name: string;
  team: string; // 도감식 카드 팀 뱃지용 (예: LAD, NYY)
  cardOvr?: number | "";
  wbcCountry?: string; // WBC 카드 뒷면 국가 코드. 기존 덱은 미입력으로 유지.
  year: number | "";
  enName: string; // Wikimedia Commons 검색용 영문명
  photoUrl: string; // 수동 사진 URL (직접 지정 시 우선)
  base: [number | "", number | "", number | ""];
  train: [number | "", number | "", number | ""];
  spec: [number | "", number | "", number | ""];
  transLv: number | "";
  enhLv: number | "";
  pohLv: number | "";
  extra: [number | "", number | "", number | ""];
  synergy: [number | "", number | "", number | ""]; // 게임 육성수치 시너지 행
  locker: [number | "", number | "", number | ""]; // 게임 육성수치 라커룸(+효과) 행
  // 시그니처 블랙 등급 전용 수동 보너스칸(조견표 미확보라 수치 직접입력, extra/synergy와 같은 방식).
  // 구버전 덱·공유링크 호환을 위해 optional로 둠 — 없으면 0으로 취급.
  blackPos?: [number | "", number | "", number | ""];
  blackBoost?: [number | "", number | "", number | ""];
  leaderBonus?: [number | "", number | "", number | ""]; // 게임에 표시된 리더 영향력 합계
  skillB: boolean; // 레거시(AQ): 항상 +3 적용이라 무시됨. 구 덱링크 호환용.
  skills: [string, string, string, string];
  finalOv: [number | "", number | "", number | ""];
}

interface EvalCtx {
  preferredTeam?: string;
  players?: PlayerInput[];
  tacticsByRow?: Record<number, number>;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
  chem: Chem;
}

const num = (v: number | "" | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export interface SkillTables {
  overrides: Record<string, number>; // kind:name -> score
  customs: { kind: Kind; name: string; score: number }[];
  tables?: {
    enhance?: Record<string, number[]>;
    transcend?: Record<string, number[]>;
    pohoon?: Record<string, number[]>;
  };
}

export type TableKind = "enhance" | "transcend" | "pohoon";
export const TABLE_LEVELS: Record<TableKind, number> = { enhance: 20, transcend: 16, pohoon: 20 };
export const TABLE_LABEL: Record<TableKind, string> = { enhance: "강화", transcend: "초월", pohoon: "포훈" };

export function getTable(kind: TableKind, tables: SkillTables): Record<string, number[]> {
  const base = LOOKUP[kind] as unknown as Record<string, number[]>;
  return { ...base, ...(tables.tables?.[kind] ?? {}) };
}

export function skillScore(
  kind: Kind,
  name: string,
  tables: SkillTables,
): number | null {
  const n = name.trim();
  if (!n) return null;
  const key = `${kind}:${n}`;
  if (tables.overrides[key] !== undefined) return tables.overrides[key];
  const custom = tables.customs.find((c) => c.kind === kind && normalizeSkillKey(c.name) === normalizeSkillKey(n));
  if (custom) return custom.score;
  const list = [...(kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher), ...NEW_SKILLS.filter(s => s.kind === kind)];
  // 공백·유니코드 표기 차이만 보정. 오타/조건/등급은 임의로 추측하지 않는다.
  const found = list.find((s) => normalizeSkillKey(s.name) === normalizeSkillKey(n));
  return found ? tables.overrides[`${kind}:${found.name}`] ?? found.score : null;
}

/** 점수 표시용: 소수 둘째자리까지 반올림, 끝의 0은 생략 (15.899999878 → 15.9) */
export const fmtScore = (n: number): string => String(Math.round(n * 100) / 100);

const normKey = (s: string): string => s.replace(/\s+/g, "");

/** 카드가 시그니처 블랙 계열(시그니처 블랙/WBC/FA 전부 포함)인지 — 공백 무시 매칭 */
export const isSigBlackCard = (card: string): boolean => normKey(card).includes("시그니처블랙");
const normSkill = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
export const normalizeSkillKey = (s: string): string => s.normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]/g, "").toLowerCase();

/** 구 스킬명 → 현행명. 저장된 덱·표에 옛 이름이 남아있으면 로드 시 치환. */
const SKILL_RENAMES: Record<string, string> = {
  "batter:[S0] 2026 퍼포머트리오 (리그·라이브 매치 O)": "[S0] 2026 퍼포머트리오 (랭대기준)",
  "batter:[S0] 2026 퍼포머트리오 (리그·라이브 매치 X)": "[S0] 2026 퍼포머트리오 (랭대기준)",
  "pitcher:[S0] 2026 퍼포머트리오 (리그·라이브 매치 O)": "[S0] 2026 퍼포머트리오 (랭대기준)",
  "pitcher:[S0] 2026 퍼포머트리오 (리그·라이브 매치 X)": "[S0] 2026 퍼포머트리오 (랭대기준)",
  "batter:[S0] 리그 주도자 (-)": "[S0] 리그의 주도자 (-)",
  "batter:[S1] 리그 주도자 (-)": "[S1] 리그의 주도자 (-)",
  "batter:[S2] 리그 주도자 (-)": "[S2] 리그의 주도자 (-)",
};

export function migrateSkillName(kind: Kind, name: string): string {
  return SKILL_RENAMES[`${kind}:${name}`] ?? name;
}
const stripBracket = (s: string): string => s.replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, "");
const stripParticle = (s: string): string =>
  s.replace(/(에게|한테|부터|까지|처럼|보다|으로|의|은|는|이|가|을|를|에|와|과|로|도|만)$/, "");

function lev(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[b.length];
}

/** 스킬 후보 찾기: 정확 포함 → 조사 무시 토큰 매칭 → 오타 2자까지 허용 */
export function suggestSkills(kind: Kind, query: string, tables: SkillTables, limit = 5): string[] {
  const q = query.trim();
  if (!q) return [];
  const names = [
    ...tables.customs.filter((c) => c.kind === kind).map((c) => c.name),
    ...(kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher).map((s) => s.name),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (n: string) => {
    if (!seen.has(n) && out.length < limit) {
      seen.add(n);
      out.push(n);
    }
  };
  names.forEach((n) => { if (n.includes(q)) push(n); });
  if (out.length >= limit) return out;
  const toks = q.split(/\s+/).map((t) => stripParticle(normSkill(stripBracket(t)))).filter(Boolean);
  if (toks.length) {
    names.forEach((n) => {
      const nn = normSkill(stripBracket(n));
      if (toks.every((t) => nn.includes(t))) push(n);
    });
  }
  if (out.length >= limit) return out;
  const nq = normSkill(stripBracket(q));
  if (nq.length >= 3) {
    const scored: { n: string; d: number }[] = [];
    names.forEach((n) => {
      if (seen.has(n)) return;
      const nn = normSkill(stripBracket(n));
      if (Math.abs(nn.length - nq.length) <= 2) {
        const d = lev(nn, nq);
        if (d <= 2) scored.push({ n, d });
      }
    });
    scored.sort((a, b) => a.d - b.d).forEach(({ n }) => push(n));
  }
  return out;
}

// 실측Alias: 게임 화면에서 원본 등급과 동일함이 확인된 것만. (WBC시그니처 강화는 별도 실측값으로 표에 있음)
// - 강화: WBC시그니처블랙==시그니처블랙(+1~10 확인), 슈프림모먼트==모먼트(60셀 전체 확인),
//   WBC시그니처 투수 변화/구위 별도 실측 입력 (버그사항2 16장, +20 합계 21)
// - 초월: 명시 복사본 있음. WBC시그니처 투수는 LV1~9 실측확인(합계 4.0, LV10~15 무보너스).
//   남은 구멍(WBC프라임)은 경고 유지.
const TABLE_ALIAS: Record<string, Record<string, string>> = {
  enhance: { "WBC시그니처블랙": "시그니처블랙", "슈프림모먼트": "모먼트" },
  transcend: {},
};
const STAT_SUFFIX = ["파워", "정확", "선구", "변화", "구위"];

function splitCardStat(key: string): [string, string] | null {
  const nk = normKey(key);
  for (const s of STAT_SUFFIX) {
    if (nk.endsWith(s)) return [nk.slice(0, nk.length - s.length), s];
  }
  return null;
}

function tableBonus(
  key: string,
  lv: number | "",
  kind: TableKind,
  tables: SkillTables,
): { v: number; miss: boolean } {
  if (lv === "" || lv === null || lv === 0) return { v: 0, miss: false };
  // 엑셀 원본 결함: 카드 드롭다운('FA 시그니처 블랙')과 표 키('FA시그니처 블랙')의 띄어쓰기가
  // 달라 FA 계열이 전부 #N/A가 난다. 공백 제거 매칭으로 수정 (WBC 등 표 자체에 없는 카드는 그대로 경고).
  const table = getTable(kind, tables);
  const want = normKey(key);
  let entry = Object.entries(table).find(([k]) => normKey(k) === want);
  if (!entry && kind !== "pohoon") {
    // 검증된 등급Alias에서 원본 표를 찾는다 (사용자 customs·명시값 우선, base 표 대상)
    const split = splitCardStat(key);
    const aliasGrade = split ? TABLE_ALIAS[kind]?.[split[0]] : undefined;
    if (aliasGrade) {
      const want2 = normKey(aliasGrade + split![1]);
      const baseEntry = Object.entries(LOOKUP[kind] as unknown as Record<string, number[]>)
        .find(([k]) => normKey(k) === want2);
      if (baseEntry) entry = baseEntry;
    }
  }
  if (!entry) return { v: 0, miss: true };
  const arr = entry[1];
  const idx = kind === "transcend" ? (lv as number) : (lv as number) - 1;
  if (!Number.isInteger(idx)) return { v: 0, miss: true };
  if (idx < 0 || idx >= arr.length) return { v: 0, miss: true };
  return { v: arr[idx] ?? 0, miss: false };
}

export interface PlayerResult {
  skillDetails: {name: string; score: number | null; note?: string}[];
  team: number;
  tactics: number[];
  auto: number[];
  final: number[];
  manual: boolean[];
  trans: (number | null)[];
  enh: (number | null)[];
  poh: (number | null)[];
  deck: number[];
  deckHits: { threshold: number | null; region: string; stat: string; pts: number }[];
  ability: number; // J
  skill: number | null; // O
  total: number; // P
  warnings: string[];
}

export function calcPlayer(
  p: PlayerInput,
  ctx: EvalCtx,
  tables: SkillTables,
): PlayerResult {
  const stats = p.kind === "batter" ? BATTER_STATS : PITCHER_STATS;
  const n = p.kind === "batter" ? 3 : 2;
  const warnings: string[] = [];
  const auto: number[] = [];
  const final: number[] = [];
  const manual: boolean[] = [];
  const trans: (number | null)[] = [];
  const enh: (number | null)[] = [];
  const poh: (number | null)[] = [];
  const role = bullpenRole(p);
  const profile = role ? ROLE_PROFILES[role] : { row: p.excelRow, pos: p.pos };
  const { sums: deckSums, hits } = officialDeckBonus(p, ctx.flags, ctx.yearInputs, ctx.preferredTeam);
  const tactic = p.kind === "pitcher" ? ctx.tacticsByRow?.[p.excelRow] ?? 0 : 0;
  const tactics = [tactic, tactic, 0];
  for (let i = 0; i < 3; i++) {
    const stat = stats[i] ?? stats[0];
    let t: number | null = null;
    let e: number | null = null;
    let h: number | null = null;
    if (i < n) {
      const tr = tableBonus(p.card + stat, p.transLv, "transcend", tables);
      const en = tableBonus(p.card + stat, p.enhLv, "enhance", tables);
      const ph = tableBonus(profile.pos + stat, p.pohLv, "pohoon", tables);
      const extendedTraining = typeof p.pohLv === "number" && Number.isInteger(p.pohLv) && p.pohLv > 20 && p.pohLv <= 26;
      const training = extendedTraining && ph.miss ? tableBonus(profile.pos + stat, 20, "pohoon", tables) : ph;
      if (tr.miss && p.transLv !== "") warnings.push(`${stat} 초월표에 '${p.card}' 없음`);
      if (en.miss && p.enhLv !== "") warnings.push(`${stat} 강화표에 '${p.card}' 없음`);
      if (ph.miss && p.pohLv !== "") warnings.push(`${stat} 포지션훈련 ${p.pohLv}레벨: ${p.pos} 수치 미확인 · ${extendedTraining ? "20레벨까지만 반영한 임시 점수" : "자동 합계에서 제외됨"}. 게임의 적용 수치를 확인하세요.`);
      t = p.transLv === "" ? null : tr.v;
      e = p.enhLv === "" ? null : en.v;
      h = p.pohLv === "" ? null : training.v;
    }
    trans.push(t);
    enh.push(e);
    poh.push(h);
    // 스킬 보너스(AR): 전원 S라 상시 +3. skillB 플래그는 구버전 호환용으로만 유지.
    const ar = 3;
    const a =
      num(p.base[i]) + num(p.train[i]) + num(p.spec[i]) +
      (t ?? 0) + (e ?? 0) + (h ?? 0) + num(p.extra[i]) + num(p.synergy[i]) + num(p.locker[i]) +
      (isSigBlackCard(p.card) ? num(p.blackPos?.[i]) + num(p.blackBoost?.[i]) : 0) + num(p.leaderBonus?.[i]) + ar + (deckSums[i] ?? 0);
    auto.push(Math.round((a + tactics[i]) * 100) / 100);
    const ov = p.finalOv[i];
    manual.push(ov !== "");
    final.push(ov === "" ? auto[i] : (ov as number) + tactics[i]);
  }

  const chem = ctx.chem;
  let ability: number;
  if (p.kind === "batter") {
    const pb =
      (chem.batChem === "S1" ? 2 : chem.batChem === "S" ? 1 : 0) +
      (chem.wbcB === "S2" ? 2 : chem.wbcB === "S1" ? 2 : chem.wbcB === "S" ? 1 : 0);
    const ab =
      (chem.batChem === "S1" ? 2 : chem.batChem === "S" ? 1 : 0) +
      (chem.wbcB === "S2" ? 2 : chem.wbcB === "S1" ? 1 : chem.wbcB === "S" ? 1 : 0);
    ability = (final[0] + pb) * 1.1 + (final[1] + ab) * 0.9 + final[2] * 0.4;
  } else {
    if (chem.pitchChem === "S2") warnings.push("투수 케미스트리 S2는 팀 버프 수치가 미확인입니다. 현재 팀 버프에 포함되지 않습니다.");
    const oc = chem.commander;
    const pc = chem.catcher;
    const tc = chem.pitchChem;
    const wb = chem.wbcP;
    const chg =
      (oc === "S" ? 1 : 0) +
      (pc === "S3" || pc === "S4" ? 2 : pc === "S" || pc === "S1" || pc === "S2" ? 1 : 0) +
      (tc === "S1" ? 2 : tc === "S" ? 1 : 0) +
      (wb === "S2" ? 2 : wb === "S1" ? 1 : wb === "S" ? 1 : 0);
    const ctl =
      (oc === "S" ? 2 : 0) +
      (pc === "S1" || pc === "S2" || pc === "S3" || pc === "S4" ? 1 : 0) +
      (tc === "S1" ? 2 : tc === "S" ? 1 : 0) +
      (wb === "S2" ? 2 : wb === "S1" ? 2 : wb === "S" ? 1 : 0);
    ability = (final[0] + chg) * 1.15 + (final[1] + ctl) * 1.2;
  }

  const skillDetails = p.skills.map((s) => {
    // 현행 O/X·평균 이름과 이전 아웃별 이름에 같은 중계 전용 조건을 적용한다.
    const relieverOnly = /^\[S[0-4]\](신속한처리|레버리지릴리퍼|승리공식|컴백플래그)\(/i.test(normalizeSkillKey(s));
    if (p.kind === "pitcher" && relieverOnly && (!role || role === "closer")) {
      warnings.push(`${s}: 중계 투수 전용 효과 미적용`);
      return {name: s, score: 0};
    }
    const wbc = resolveWbcSkill(p, s, ctx.players);
    if (wbc) {
      if (!wbc.name) warnings.push(`${s}: ${wbc.note}`);
      return {name: wbc.name ?? s, score: wbc.inactive ? 0 : wbc.name ? skillScore(p.kind, wbc.name, tables) : null, note: wbc.note};
    }
    return {name: s, score: s.trim() ? skillScore(p.kind, s, tables) : 0};
  });
  const scores = skillDetails.map(s => s.score);
  if (scores.slice(0, 3).some((s) => s === null)) {
    warnings.push("스킬 1~3 중 점수 또는 적용 조건을 확인하지 못한 스킬 있음");
  }
  const missing4 = scores[3] === null;
  const skill: number | null =
    scores.slice(0, 3).some((s) => s === null)
      ? null
      : (scores[0] ?? 0) + (scores[1] ?? 0) + (scores[2] ?? 0) + (missing4 ? 0 : (scores[3] ?? 0));
  if (scores.some((s) => s === null)) {
    const bad = p.skills.filter((s, i) => s.trim() && scores[i] === null);
    if (bad.length) warnings.push(`점수 없음: ${bad.join(", ")}`);
  }
  const team = additionalTeamScore(p, chem);
  ability += team;
  const knownSkill = scores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
  const total = knownSkill + ability;
  if (scores.some(s => s === null)) warnings.push("점수·조건 미확인 스킬을 제외한 임시 점수입니다. 스킬과 적용 조건을 확인하세요.");
  return {
    auto, final, manual, trans, enh, poh, tactics, team, skillDetails,
    deck: [deckSums[0] ?? 0, deckSums[1] ?? 0, deckSums[2] ?? 0],
    deckHits: hits, ability, skill, total, warnings,
  };
}

interface DeckLike {
  preferredTeam?: string;
  bullpenTactics?: BullpenTactics;
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
}

/** 덱의 선수별 계산 결과 (players와 같은 순서). 덱 비교·랭킹 등에서 재사용. */
export function deckPlayerResults(d: DeckLike, tables: SkillTables): PlayerResult[] {
  const ctx: EvalCtx = {
    players: d.players,
    tacticsByRow: tacticBonuses(d.players, d.bullpenTactics),
    flags: d.flags, yearInputs: d.yearInputs,
    preferredTeam: d.preferredTeam, chem: d.chem,
  };
  return d.players.map((p) => calcPlayer(p, ctx, tables));
}

/** 덱 총점 가중치 (선발/계투/타자) */
export const DECK_WEIGHTS = { sp: 0.4, rp: 0.1, bt: 0.5 };

/** 덱 전체 총점. 타자9/선발5/가변 불펜 순서에서 이름 있는 선수만 평균×10 후 가중합. */
export function deckTotals(
  players: PlayerInput[],
  results: PlayerResult[],
): { sp: number; rp: number; bt: number; total: number } {
  const avg10 = (from: number, to?: number) => {
    const v = results.slice(from, to).filter((_, i) => players[from + i].name.trim()).map((r) => r.total);
    return (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0) * 10;
  };
  const sp = avg10(9, 14);
  const rp = avg10(14);
  const bt = avg10(0, 9);
  return { sp, rp, bt, total: sp * DECK_WEIGHTS.sp + rp * DECK_WEIGHTS.rp + bt * DECK_WEIGHTS.bt };
}

export function calcDeckTotal(
  d: DeckLike,
  tables: SkillTables,
): { sp: number; rp: number; bt: number; total: number; named: number } {
  const named = d.players.filter((p) => p.name.trim()).length;
  return { ...deckTotals(d.players, deckPlayerResults(d, tables)), named };
}

export function flagDefaults(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(workbookFlags)) {
    if (k.includes("team") || k.includes("spec")) out[k] = !!v;
  }
  return out;
}
