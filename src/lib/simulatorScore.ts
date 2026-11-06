import { LOOKUP, normalizeSkillKey, skillScore, type SkillTables } from "./engine";
import { availableSkills, skillId, slotCount, type Board, type DrawSkill, type SimSettings } from "./skillSimulator";

export interface ScoreOption { name: string; score: number }
export type ScoreChoices = Record<string, string>;
export interface SkillEvaluation { score: number | null; basis: string }
export interface BoardEvaluation { total: number | null; skills: SkillEvaluation[] }

// Only documented spelling/abbreviation differences; never fuzzy-match skills.
function baseName(name: string) {
  const base = normalizeSkillKey(name.replace(/^\[[^\]]+\]\s*/, "").split("(")[0]);
  return base.replace(/^worldbaseballclassic/, "wbc").replace(/^파워피처$/, "파워피쳐");
}
function applicable(name: string, settings: SimSettings) {
  const condition = name.slice(name.indexOf("("));
  if (settings.position === "SP" || settings.position === "RP" || settings.position === "CP") {
    const roleWords = /선발|중계|마무리|승리조|추격조|롱\s*릴리프/;
    if (roleWords.test(condition)) {
      const wanted = settings.position === "SP" ? /선발/ : settings.position === "CP" ? /마무리/ : /중계|승리조|추격조|롱\s*릴리프/;
      if (!wanted.test(condition)) return false;
    }
    if (/명전\s*선발/.test(condition) && settings.card !== "hof") return false;
    if (/일반\s*선발/.test(condition) && settings.card === "hof") return false;
  }
  if (baseName(name) === "도전정신") {
    const type = settings.card === "hof" ? "명예의 전당" : ["moment", "supreme"].includes(settings.card) ? "모먼트" : "시그니처";
    return condition.includes(type);
  }
  return true;
}

/** Uses the exact same S0 ranked score rows and user overrides as deck management. */
export function createScoreEvaluator(settings: SimSettings, tables: SkillTables, choices: ScoreChoices = {}, locked: DrawSkill | null = null) {
  const kind = ["SP", "RP", "CP"].includes(settings.position) ? "pitcher" : "batter";
  const rows = [...LOOKUP[kind], ...tables.customs.filter(s => s.kind === kind)].filter(r => /^\[S0\]/.test(r.name));
  const index = new Map<string, ScoreOption[]>();
  for (const row of rows) {
    if (!applicable(row.name, settings)) continue;
    const score = skillScore(kind, row.name, tables);
    if (score === null || !Number.isFinite(score)) continue;
    const key = baseName(row.name);
    const entries = index.get(key) ?? [];
    if (!entries.some(e => e.name === row.name)) entries.push({ name: row.name, score });
    index.set(key, entries);
  }
  const pool = availableSkills(settings, locked);
  const options = new Map<string, ScoreOption[]>();
  const selected = new Map<string, ScoreOption>();
  for (const skill of pool) {
    const key = skillId(skill);
    // Mirror calcPlayer's ranked reliever-only handling, rather than applying RP scores to SP/CP.
    const relieverOnly = kind === "pitcher" && settings.position !== "RP" && /^(신속한처리|레버리지릴리퍼|승리공식|컴백플래그)$/.test(baseName(skill.name));
    const entries = relieverOnly ? [{ name: "중계 투수 전용 효과 미적용", score: 0 }] : [...(index.get(baseName(skill.name)) ?? [])].sort((a,b) => a.score-b.score || a.name.localeCompare(b.name,"ko"));
    options.set(key, entries);
    const chosen = entries.find(e => e.name === choices[key]) ?? entries[0];
    if (chosen) selected.set(key, chosen);
  }
  function evaluate(skill: DrawSkill): SkillEvaluation {
    if (skill.level !== "S") return { score: null, basis: `${skill.level} 레벨 점수 미등록` };
    const row = selected.get(skill.id);
    return row ? { score: row.score, basis: row.name } : { score: null, basis: "S0 점수 미등록" };
  }
  function board(board: Board): BoardEvaluation {
    const skills = board.map(evaluate);
    const changing = locked ? skills.slice(1) : skills;
    return { skills, total: board.length !== slotCount(settings.card) || changing.some(s => s.score === null) ? null : changing.reduce((sum,s) => sum+s.score!,0) };
  }
  // A permissive upper bound: ignores slot restrictions, but never rejects a reachable score.
  const scoredSlots = slotCount(settings.card)-(locked ? 1 : 0);
  const changingPool = pool.filter(s => skillId(s) !== locked?.id);
  const rest = changingPool.map(s => selected.get(skillId(s))?.score).filter((s): s is number => s !== undefined).sort((a,b)=>b-a).slice(0,scoredSlots);
  const upperBound = rest.length < scoredSlots ? 0 : rest.reduce((a,b)=>a+b,0);
  return { options, selected, evaluate, board, scoredSlots, upperBound: Math.round(upperBound*100)/100, missing: changingPool.filter(s => !selected.has(skillId(s))) };
}

export function meetsScoreGoal(score: number | null, target: number): boolean {
  return score !== null && Number.isFinite(score) && Number.isFinite(target) && target > 0 && Math.round(score * 100) / 100 >= target;
}
