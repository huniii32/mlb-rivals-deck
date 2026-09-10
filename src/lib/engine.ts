import lookup from "../data/lookup.json";
import deckdata from "../data/deckrules.json";

// 엑셀(MLB라이벌_덱관리프로그램_260812.xlsx) 로직의 웹 이식.
// 수식 출처: 라인업 시트 J/O/P/D열, 강화/포훈/초월/스킬점수 시트, 덱코(BF:HL) 규칙 파서 추출.

export type Kind = "batter" | "pitcher";

export const BATTER_STATS = ["파워", "정확", "선구"];
export const PITCHER_STATS = ["변화", "구위"];
// 덱코 규칙의 스탯 표기(파워/정확/선구)를 선수 스탯 인덱스로 매핑
const RULE_STAT_IDX: Record<string, number> = { 파워: 0, 정확: 1, 선구: 2 };

export interface Lookup {
  batter: { name: string; score: number }[];
  pitcher: { name: string; score: number }[];
  enhance: Record<string, number[]>;
  pohoon: Record<string, number[]>;
  transcend: Record<string, number[]>;
  cards: string[];
  years: number[];
  chem: Record<string, string[]>;
}
export const LOOKUP = lookup as Lookup;

interface DeckData {
  conds: Cond[];
  rules: { r: number; g: number; t: number | null; s: string; a: [number, number][] }[];
  flags: Record<string, boolean | number | null>;
}
const DECK = deckdata as unknown as DeckData;

export type Cond =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "flag"; row: number; region: string; side: string }
  | { t: "yearinput"; row: number }
  | { t: "card"; row: number }
  | { t: "order"; row: number }
  | { t: "enh"; row: number }
  | { t: "year"; row: number }
  | { t: "numcell"; row: number; col: string }
  | { t: "not"; x: Cond }
  | { t: "and"; items: Cond[] }
  | { t: "or"; items: Cond[] }
  | { t: "arith"; op: string; a: Cond; b: Cond }
  | { t: "cmp"; op: string; a: Cond; b: Cond };

export interface Chem {
  commander: string; // O2 커맨더
  catcher: string; // O3 포수리드
  pitchChem: string; // O4 투케
  batChem: string; // O5 타케
  wbcP: string; // O6 WBC에이스(투수)
  wbcB: string; // O7 WBC에이스(타자)
}

export interface PlayerInput {
  excelRow: number;
  kind: Kind;
  pos: string;
  order: number | "";
  card: string;
  name: string;
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
  skillB: boolean; // AQ: O면 +3
  skills: [string, string, string, string];
  finalOv: [number | "", number | "", number | ""];
}

export interface EvalCtx {
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
  cardByRow: Record<number, string>;
  orderByRow: Record<number, number>;
  enhByRow: Record<number, number>;
  yearByRow: Record<number, number>;
}

const num = (v: number | "" | null | undefined): number =>
  typeof v === "number" && !isNaN(v) ? v : 0;

function evVal(c: Cond, ctx: EvalCtx): string | number | boolean {
  switch (c.t) {
    case "num": return c.v;
    case "str": return c.v;
    case "flag": return !!ctx.flags[`${c.row}-${c.region}-${c.side}`];
    case "yearinput": {
      const v = ctx.yearInputs[c.row];
      return typeof v === "number" ? v : NaN;
    }
    case "card": return ctx.cardByRow[c.row] ?? "";
    case "order": return ctx.orderByRow[c.row] ?? 0;
    case "enh": return ctx.enhByRow[c.row] ?? 0;
    case "year": return ctx.yearByRow[c.row] ?? 0;
    case "numcell": return 0;
    case "not": return !evVal(c.x, ctx);
    case "and": return c.items.every((x) => !!evVal(x, ctx));
    case "or": return c.items.some((x) => !!evVal(x, ctx));
    case "arith": {
      const a = evVal(c.a, ctx) as number;
      const b = evVal(c.b, ctx) as number;
      return c.op === "+" ? a + b : c.op === "-" ? a - b : c.op === "*" ? a * b : a / b;
    }
    case "cmp": {
      const a = evVal(c.a, ctx);
      const b = evVal(c.b, ctx);
      if (typeof a === "string" || typeof b === "string") {
        const x = String(a).toLowerCase();
        const y = String(b).toLowerCase();
        return c.op === "=" ? x === y : x !== y;
      }
      const x = a as number;
      const y = b as number;
      switch (c.op) {
        case "=": return x === y;
        case "<>": return x !== y;
        case "<": return x < y;
        case ">": return x > y;
        case "<=": return x <= y;
        case ">=": return x >= y;
        default: return false;
      }
    }
  }
}

/** 덱코 보너스 합계 (스탯 인덱스별). 적중 내역도 반환(설명용). */
export function deckBonus(
  excelRow: number,
  ctx: EvalCtx,
): { sums: number[]; hits: { threshold: number | null; region: string; stat: string; pts: number }[] } {
  const sums = [0, 0, 0];
  const hits: { threshold: number | null; region: string; stat: string; pts: number }[] = [];
  for (const r of DECK.rules) {
    if (r.r !== excelRow) continue;
    let pts = 0;
    for (const [ci, p] of r.a) {
      const c = ci < 0 ? null : DECK.conds[ci];
      if (c === null || !!evVal(c, ctx)) {
        pts = p;
        break;
      }
    }
    if (pts) {
      const idx = RULE_STAT_IDX[r.s] ?? -1;
      if (idx >= 0) {
        sums[idx] += pts;
        hits.push({ threshold: r.t, region: r.g === 0 ? "팀덱코" : "스덱코", stat: r.s, pts });
      }
    }
  }
  return { sums, hits };
}

export interface SkillTables {
  overrides: Record<string, number>; // kind:name -> score
  customs: { kind: Kind; name: string; score: number }[];
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
  const custom = tables.customs.find((c) => c.kind === kind && c.name === n);
  if (custom) return custom.score;
  const list = kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher;
  const found = list.find((s) => s.name === n);
  return found ? found.score : null;
}

function tableBonus(
  table: Record<string, number[]>,
  key: string,
  lv: number | "",
  kind: "transcend" | "enhance" | "pohoon",
): { v: number; miss: boolean } {
  if (lv === "" || lv === null) return { v: 0, miss: false };
  const arr = table[key];
  if (!arr) return { v: 0, miss: true };
  const idx = kind === "transcend" ? (lv as number) : (lv as number) - 1;
  if (idx < 0 || idx >= arr.length) return { v: 0, miss: true };
  return { v: arr[idx] ?? 0, miss: false };
}

export interface PlayerResult {
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
  const { sums: deckSums, hits } = deckBonus(p.excelRow, ctx);
  for (let i = 0; i < 3; i++) {
    const stat = stats[i] ?? stats[0];
    let t: number | null = null;
    let e: number | null = null;
    let h: number | null = null;
    if (i < n) {
      const tr = tableBonus(LOOKUP.transcend, p.card + stat, p.transLv, "transcend");
      const en = tableBonus(LOOKUP.enhance, p.card + stat, p.enhLv, "enhance");
      const ph = tableBonus(LOOKUP.pohoon, p.pos + stat, p.pohLv, "pohoon");
      if (tr.miss && p.transLv !== "") warnings.push(`${stat} 초월표에 '${p.card}' 없음`);
      if (en.miss && p.enhLv !== "") warnings.push(`${stat} 강화표에 '${p.card}' 없음`);
      if (ph.miss && p.pohLv !== "") warnings.push(`${stat} 포훈표에 '${p.pos}' 없음`);
      t = p.transLv === "" ? null : tr.v;
      e = p.enhLv === "" ? null : en.v;
      h = p.pohLv === "" ? null : ph.v;
    }
    trans.push(t);
    enh.push(e);
    poh.push(h);
    const ar = p.skillB ? 3 : 0;
    const a =
      num(p.base[i]) + num(p.train[i]) + num(p.spec[i]) +
      (t ?? 0) + (e ?? 0) + (h ?? 0) + num(p.extra[i]) + num(p.synergy[i]) + num(p.locker[i]) + ar + (deckSums[i] ?? 0);
    auto.push(Math.round(a * 100) / 100);
    const ov = p.finalOv[i];
    manual.push(ov !== "");
    final.push(ov === "" ? auto[i] : (ov as number));
  }

  const ch = ctx as EvalCtx & { chem: Chem };
  const chem = ch.chem;
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

  const scores = p.skills.map((s) => (s.trim() ? skillScore(p.kind, s, tables) : 0));
  if (scores.slice(0, 3).some((s) => s === null)) {
    warnings.push("스킬 1~3 중 점수표에 없는 스킬 있음");
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
  const total = (skill ?? 0) + ability;
  return {
    auto, final, manual, trans, enh, poh,
    deck: [deckSums[0] ?? 0, deckSums[1] ?? 0, deckSums[2] ?? 0],
    deckHits: hits, ability, skill, total, warnings,
  };
}

/** 스킬 비교 계산기 (J35:O38 방식): 4개 스킬 합. 4번째 없으면 3개 합. */
export function skillCompare(kind: Kind, skills: string[], tables: SkillTables): number | null {
  const scores = skills.map((s) => (s.trim() ? skillScore(kind, s, tables) : 0));
  if (scores.slice(0, 3).some((s) => s === null)) return null;
  return (scores[0] ?? 0) + (scores[1] ?? 0) + (scores[2] ?? 0) + (scores[3] ?? 0);
}

/** 덱코 패널에 보여줄 참조 플래그 목록 (규칙에서 실제 참조된 것만) */
export function referencedFlags(): { row: number; region: string; side: string }[] {
  const seen = new Map<string, { row: number; region: string; side: string }>();
  const walk = (c: Cond | null) => {
    if (!c) return;
    if (c.t === "flag") seen.set(`${c.row}-${c.region}-${c.side}`, { row: c.row, region: c.region, side: c.side });
    else if (c.t === "not") walk(c.x);
    else if (c.t === "and" || c.t === "or") c.items.forEach(walk);
    else if (c.t === "arith" || c.t === "cmp") { walk(c.a); walk(c.b); }
  };
  for (const r of DECK.rules) for (const [ci] of r.a) {
    if (ci >= 0) walk(DECK.conds[ci]);
  }
  return [...seen.values()].sort((a, b) => a.region.localeCompare(b.region) || a.side.localeCompare(b.side) || a.row - b.row);
}

export function flagDefaults(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(DECK.flags)) {
    if (k.includes("team") || k.includes("spec")) out[k] = !!v;
  }
  return out;
}
