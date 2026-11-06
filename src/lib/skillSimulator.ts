import source from "../data/skillProbabilities.json";

export const POSITIONS = { SP: "선발 투수", RP: "중계 투수", CP: "마무리 투수", C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수", DH: "지명타자" } as const;
export type SimPosition = keyof typeof POSITIONS;
export const CARD_TYPES = { normal: "일반 · 임팩트 · 프라임 · 시그니처", moment: "모먼트 (전용 스킬 1종)", supreme: "슈프림 모먼트", hof: "HOF", black: "시그니처 블랙", wbc: "WBC 시그니처 · 프라임", wbcBlack: "WBC 블랙 시그니처" } as const;
export type SimCard = keyof typeof CARD_TYPES;
export const TICKETS = { superior: "최고급", advanced: "고급", basic: "일반" } as const;
export type Ticket = keyof typeof TICKETS;
export const TIERS = { Iron: "아이언", Bronze: "브론즈", Silver: "실버", Gold: "골드", Moment: "모먼트", HOF: "HOF", Black: "블랙", WBC: "WBC" } as const;
export type Tier = keyof typeof TIERS;
export type Level = "D" | "C" | "B" | "A" | "S";
export const LEVELS: Level[] = ["D", "C", "B", "A", "S"];
export interface RateSkill { name: string; tier: Tier; rates: number[] }
type Sheet = "normal" | "hof" | "black" | "blackOther" | "wbc" | "wbcBlack" | "wbcBlackOther" | "supreme" | "basic" | "hofBasic" | "hofAdvanced" | "blackAdvanced" | "wbcBasic" | "wbcAdvanced" | "wbcBlackAdvanced";
export const PROBABILITY_DATA = source as unknown as { asOf: string; checkedAt: string; overview: { url: string }; sources: Record<Sheet, { url: string; sha256: string }>; tables: Record<Sheet, Record<SimPosition, RateSkill[]>> };
export interface SimSettings { card: SimCard; position: SimPosition; protectS: boolean; momentSkill: string; ticket?: Ticket }
export interface DrawSkill { id: string; name: string; tier: Tier; level: Level }
export type Board = DrawSkill[];
export const skillId = (skill: Pick<RateSkill, "tier" | "name">) => `${skill.tier}:${skill.name}`;
export const slotCount = (card: SimCard) => card === "black" || card === "wbcBlack" ? 4 : 3;
export type Random = () => number;

/** Web Crypto uniform uint32 / 2^32, buffered for bulk simulations. */
export function browserRandom(): Random {
  const buffer = new Uint32Array(256);
  let index = buffer.length;
  return () => {
    if (index === buffer.length) { crypto.getRandomValues(buffer); index = 0; }
    return buffer[index++] / 0x100000000;
  };
}
function unit(random: Random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("난수는 0 이상 1 미만이어야 합니다.");
  return value;
}
function pick<T>(items: readonly T[], weights: readonly number[], random: Random): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!items.length || total <= 0 || !Number.isFinite(total)) throw new Error("선택 가능한 스킬이 없습니다.");
  let remaining = unit(random) * total;
  for (let i = 0; i < items.length; i++) {
    remaining -= weights[i];
    if (remaining < 0) return items[i];
  }
  return items[items.length - 1];
}
interface Rule { sheet: Sheet; tiers: Partial<Record<Tier, number>> }
const normalRest: Rule = { sheet: "normal", tiers: { Bronze: 35, Silver: 40, Gold: 25 } };
const gold: Rule = { sheet: "normal", tiers: { Gold: 100 } };
const wbc: Rule = { sheet: "wbc", tiers: { Gold: 90, WBC: 10 } };
const basic: Rule = { sheet: "basic", tiers: { Iron: 35, Bronze: 30, Silver: 20, Gold: 15 } };
const wbcAdvanced: Rule = { sheet: "wbcAdvanced", tiers: { Gold: 99.5, WBC: .5 } };
export function slotRules(settings: SimSettings, blackSlot = 0): Rule[] {
  const ticket = settings.ticket ?? "superior";
  if (ticket !== "superior") {
    let rule: Rule = basic;
    if (settings.card === "hof") rule = ticket === "basic"
      ? { sheet: "hofBasic", tiers: { Iron: 34.965, Bronze: 29.97, Silver: 19.98, Gold: 14.985, HOF: .1 } }
      : { sheet: "hofAdvanced", tiers: { Iron: 34.475, Bronze: 29.55, Silver: 19.7, Gold: 14.775, HOF: 1.5 } };
    if (settings.card === "black" && ticket === "advanced") rule = { sheet: "blackAdvanced", tiers: { Iron: 33.25, Bronze: 28.5, Silver: 19, Gold: 14.25, Black: 5 } };
    if (settings.card === "wbc" || settings.card === "wbcBlack") rule = ticket === "basic"
      ? { sheet: "wbcBasic", tiers: { Gold: 100 } }
      : settings.card === "wbcBlack" ? { sheet: "wbcBlackAdvanced", tiers: { Gold: 94.5, WBC: .5, Black: 5 } } : wbcAdvanced;
    return Array.from({ length: slotCount(settings.card) }, () => rule);
  }
  switch (settings.card) {
    case "normal": return [gold, normalRest, normalRest];
    case "moment": return [{ sheet: "supreme", tiers: { Gold: 94, Moment: 6 } }, normalRest, normalRest];
    case "supreme": return [{ sheet: "supreme", tiers: { Gold: 70, Moment: 30 } }, normalRest, normalRest];
    case "hof": return [{ sheet: "hof", tiers: { Gold: 90, HOF: 10 } }, ...Array.from({ length: 2 }, (): Rule => ({ sheet: "hof", tiers: { Bronze: 31.5, Silver: 36, Gold: 22.5, HOF: 10 } }))];
    case "black": return Array.from({ length: 4 }, (_, i): Rule => i === blackSlot ? { sheet: "black", tiers: { Black: 100 } } : i === 0 ? gold : { sheet: "blackOther", tiers: { Bronze: 20, Silver: 30, Gold: 50 } });
    case "wbc": return [wbc, wbc, wbc];
    case "wbcBlack": return Array.from({ length: 4 }, (_, i): Rule => i === blackSlot ? { sheet: "wbcBlack", tiers: { Black: 100 } } : { sheet: "wbcBlackOther", tiers: { Gold: 90, WBC: 10 } });
  }
}
function candidates(settings: SimSettings, rule: Rule, tier: Tier) {
  return PROBABILITY_DATA.tables[rule.sheet][settings.position].filter(skill => skill.tier === tier &&
    (settings.card !== "moment" || tier !== "Moment" || skill.name === settings.momentSkill));
}
export function momentSkills(position: SimPosition) {
  return PROBABILITY_DATA.tables.supreme[position].filter(skill => skill.tier === "Moment");
}
export function availableSkills(settings: SimSettings): RateSkill[] {
  const result = new Map<string, RateSkill>();
  // Enumerate every possible black slot so that all candidate tiers are represented.
  for (let blackSlot = 0; blackSlot < slotCount(settings.card); blackSlot++) {
    for (const rule of slotRules(settings, blackSlot)) for (const tier of Object.keys(rule.tiers) as Tier[]) {
      for (const skill of candidates(settings, rule, tier)) result.set(skillId(skill), skill);
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
export function createSimulator(settings: SimSettings, random: Random = browserRandom()): () => Board {
  if (!(settings.card in CARD_TYPES) || !(settings.position in POSITIONS)) throw new Error("카드 종류와 포지션을 확인하세요.");
  const ticket = settings.ticket ?? "superior";
  if (!(ticket in TICKETS)) throw new Error("변경권 종류를 확인하세요.");
  if (settings.card === "moment" && ticket === "superior" && !momentSkills(settings.position).some(s => s.name === settings.momentSkill)) throw new Error("카드의 전용 모먼트 스킬을 선택하세요.");
  const prepare = (rule: Rule) => ({
    tiers: Object.keys(rule.tiers) as Tier[], weights: Object.values(rule.tiers) as number[],
    pools: Object.fromEntries((Object.keys(rule.tiers) as Tier[]).map(tier => [tier, candidates(settings, rule, tier)])) as Partial<Record<Tier, RateSkill[]>>,
  });
  const variants = Array.from({ length: slotCount(settings.card) }, (_, blackSlot) => slotRules(settings, blackSlot).map(prepare));
  const afterBlack = prepare(settings.card === "wbcBlack" ? wbcAdvanced : basic);
  return () => {
    const rules = variants[ticket === "superior" && slotCount(settings.card) === 4 ? Math.floor(unit(random) * 4) : 0];
    const used = new Set<string>();
    let blackDrawn = false;
    return rules.map(initialRule => {
      // Advanced tickets allow at most one Black. Subsequent slots use the
      // official normal advanced distribution, not a renormalized 95% pool.
      const rule = ticket === "advanced" && blackDrawn ? afterBlack : initialRule;
      const tier = pick(rule.tiers, rule.weights, random);
      if (tier === "Black") blackDrawn = true;
      const pool = rule.pools[tier]!.filter(skill => !used.has(skill.name));
      const skill = pick(pool, pool.map(s => s.rates.reduce((a, b) => a + b, 0)), random);
      used.add(skill.name);
      // Moment cards always protect their level. This simulator models already-S cards.
      const level = settings.protectS || settings.card === "moment" || settings.card === "supreme" ? "S" : pick(LEVELS, skill.rates, random);
      return { id: skillId(skill), name: skill.name, tier, level };
    });
  };
}
/** All selected target names must occur in the same result, in any slot order. */
export function matchesGoal(board: Board, ids: string[], minimum: Level) {
  return ids.length > 0 && ids.every(id => board.some(s => s.id === id && LEVELS.indexOf(s.level) >= LEVELS.indexOf(minimum)));
}
/** Reject impossible combinations (e.g. two Black skills, or three Bronze skills on a normal card). */
export function goalPossible(settings: SimSettings, ids: string[]) {
  if (!ids.length || ids.length > slotCount(settings.card) || new Set(ids).size !== ids.length) return false;
  const skills = availableSkills(settings);
  const targets = ids.map(id => skills.find(s => skillId(s) === id));
  if (targets.some(t => !t)) return false;
  if (targets.filter(t => t!.tier === "Black").length > 1) return false;
  for (let blackSlot = 0; blackSlot < slotCount(settings.card); blackSlot++) {
    const rules = slotRules(settings, blackSlot);
    function assign(index: number, used: number): boolean {
      if (index === targets.length) return true;
      const target = targets[index]!;
      return rules.some((rule, slot) => !(used & (1 << slot)) && rule.tiers[target.tier] &&
        candidates(settings, rule, target.tier).some(s => skillId(s) === ids[index]) && assign(index + 1, used | (1 << slot)));
    }
    if (assign(0, 0)) return true;
  }
  return false;
}
export function ruleSummary(card: SimCard, ticket: Ticket = "superior") {
  if (ticket !== "superior") {
    if (card === "hof") return `모든 슬롯 HOF ${ticket === "basic" ? "0.1" : "1.5"}% · 나머지는 아이언/브론즈/실버/골드 35:30:20:15`;
    if (card === "wbc" || card === "wbcBlack") return ticket === "basic" ? "모든 슬롯 골드 100% · S 레벨 확정 · 전용 스킬 등장 없음" : card === "wbcBlack" ? "골드 94.5% / WBC 0.5% / 블랙 5% · 블랙 등장 후 골드 99.5% / WBC 0.5% · 모두 S" : "모든 슬롯 골드 99.5% / WBC 0.5% · S 레벨 확정";
    if (card === "black" && ticket === "advanced") return "아이언 33.25% / 브론즈 28.5% / 실버 19% / 골드 14.25% / 블랙 5% · 블랙은 최대 1개, 등장 후 일반 고급 확률";
    return "모든 슬롯 아이언 35% / 브론즈 30% / 실버 20% / 골드 15% · 전용 스킬 등장 없음";
  }
  switch (card) {
    case "normal": return "첫 슬롯 골드 100% · 나머지 슬롯 브론즈 35% / 실버 40% / 골드 25%";
    case "moment": return "첫 슬롯 전용 모먼트 6% / 골드 94% · 나머지 슬롯은 일반 확률";
    case "supreme": return "첫 슬롯 모먼트 30% / 골드 70% · 나머지 슬롯은 일반 확률";
    case "hof": return "첫 슬롯 골드 90% / HOF 10% · 나머지 슬롯 HOF 10%, 일반 티어 90%";
    case "black": return "블랙 1개 확정 · 위치는 각 25% · 첫 슬롯이 블랙이 아니면 골드 확정";
    case "wbc": return "모든 슬롯 골드 90% / WBC 10% · S 레벨 확정";
    case "wbcBlack": return "블랙 1개 확정 · 위치는 각 25% · 나머지 골드 90% / WBC 10% · 모두 S";
  }
}

/** Guaranteed Black on superior tickets must not cause every batch to stop at 1. */
export function dedicatedTiers(settings: SimSettings): Tier[] {
  const ticket = settings.ticket ?? "superior";
  if (settings.card === "hof") return ["HOF"];
  if (settings.card === "moment" || settings.card === "supreme") return ticket === "superior" ? ["Moment"] : [];
  if (settings.card === "wbc" || settings.card === "wbcBlack") return ticket === "basic" ? [] : settings.card === "wbcBlack" && ticket === "advanced" ? ["WBC", "Black"] : ["WBC"];
  return settings.card === "black" && ticket === "advanced" ? ["Black"] : [];
}

/** Record the winning draw before stopping; never consume a ticket after it. */
export function runTrialChunk(draw: () => Board, limit: number, record: (board: Board) => void, stop: (board: Board) => boolean) {
  for (let completed = 1; completed <= limit; completed++) {
    const board = draw();
    record(board);
    if (stop(board)) return { completed, stopped: true };
  }
  return { completed: limit, stopped: false };
}
