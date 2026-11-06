import assert from "node:assert/strict";
import { availableSkills, CARD_TYPES, createSimulator, goalPossible, LEVELS, matchesGoal, momentSkills, POSITIONS, PROBABILITY_DATA, skillId, slotCount, type SimSettings, type Tier } from "../src/lib/skillSimulator";
let assertions = 0;
function check(value: unknown, message: string) { assertions++; assert.ok(value, message); }
function rng(seed: number) { return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const base: SimSettings = { card: "normal", position: "SP", protectS: true, momentSkill: "" };
for (const [sheet, positions] of Object.entries(PROBABILITY_DATA.tables)) for (const [position, rows] of Object.entries(positions)) {
  check(Math.abs(rows.reduce((sum, r) => sum + r.rates.reduce((a, b) => a + b, 0), 0) - 100) < .0001, `${sheet}/${position} probability total`);
  check(new Set(rows.map(skillId)).size === rows.length, `${sheet}/${position} unique skills`);
  for (const r of rows) check(r.rates.length === 5 && r.rates.every(x => Number.isFinite(x) && x >= 0), 'valid rates');
}
// Four cells in the official RP table use decimal fractions instead of % text.
assert.equal(PROBABILITY_DATA.tables.normal.RP.find(s => s.name === "홈 어드밴티지")!.rates[2], .142857);
for (const card of Object.keys(CARD_TYPES) as SimSettings['card'][]) for (const position of Object.keys(POSITIONS) as SimSettings['position'][]) {
  const settings = { ...base, card, position, momentSkill: momentSkills(position)[0].name };
  const allowed = new Set(availableSkills(settings).map(skillId));
  const draw = createSimulator(settings, rng(47));
  for (let i = 0; i < 120; i++) {
    const board = draw();
    check(board.length === slotCount(card), 'slot count');
    check(board.every(s => s.level === 'S' && allowed.has(s.id)), 'protected S and correct positional pool');
    check(new Set(board.map(s => s.name)).size === board.length, 'duplicates excluded');
    if (card === 'normal') check(board[0].tier === 'Gold', 'first normal slot Gold');
    if (card === 'black' || card === 'wbcBlack') check(board.filter(s => s.tier === 'Black').length === 1, 'exactly one Black');
    if (card === 'black' && board[0].tier !== 'Black') check(board[0].tier === 'Gold', 'first non-Black slot Gold');
    if (card === 'moment' || card === 'supreme') check(board.slice(1).every(s => s.tier !== 'Moment'), 'Moment only in slot 1');
    if (card === 'moment') check(board.every(s => s.tier !== 'Moment' || s.name === settings.momentSkill), 'only card-specific Moment');
  }
}
for (const [card, tier, rate] of [['normal', 'Gold', 1], ['moment', 'Moment', .06], ['supreme', 'Moment', .30], ['hof', 'HOF', .10], ['wbc', 'WBC', .10]] as const) {
  const draw = createSimulator({ ...base, card, momentSkill: momentSkills('SP')[0].name }, rng(8812));
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (draw()[0].tier === tier) hits++;
  check(Math.abs(hits / 20000 - rate) < .012, `${card} first-tier frequency ${hits / 20000}`);
}
const raw = createSimulator({ ...base, protectS: false }, rng(193));
const levels = Object.fromEntries(LEVELS.map(l => [l, 0]));
const tiers: Partial<Record<Tier, number>> = {};
for (let i = 0; i < 30000; i++) { const b = raw(); check(new Set(b.map(s => s.name)).size === b.length, 'same name excluded across raw levels'); levels[b[0].level]++; tiers[b[1].tier] = (tiers[b[1].tier] || 0) + 1; }
for (const [i, rate] of [.4,.3,.2,.07,.03].entries()) check(Math.abs(levels[LEVELS[i]] / 30000 - rate) < .012, `raw grade ${LEVELS[i]}`);
for (const [tier, rate] of [['Bronze',.35],['Silver',.4],['Gold',.25]] as const) check(Math.abs(tiers[tier]! / 30000 - rate) < .012, `normal remaining ${tier}`);
const black = createSimulator({ ...base, card: 'black' }, rng(83)); const placements = [0,0,0,0];
for (let i = 0; i < 20000; i++) placements[black().findIndex(s => s.tier === 'Black')]++;
check(placements.every(n => Math.abs(n/20000-.25) < .015), 'Black slot uniform 25%');
// A stale runtime option cannot re-enable duplicates after its removal from the interface.
const legacy = createSimulator({ ...base, noDuplicates: false } as SimSettings, () => 0)();
assert.notEqual(legacy[1].name, legacy[2].name);
const excluded = createSimulator(base, () => 0)(); assert.notEqual(excluded[1].name, excluded[2].name);
const wbc = createSimulator({ ...base, card: 'wbc', protectS: false }, rng(19));
for (let i=0;i<100;i++) check(wbc().every(s => s.level==='S'), 'WBC native S');
const moment = createSimulator({ ...base, card: 'moment', protectS: false, momentSkill: momentSkills('SP')[0].name }, rng(21));
for (let i=0;i<100;i++) check(moment().every(s => s.level==='S'), 'Moment modeled as already S, never silently downgraded');
const blackSettings = { ...base, card: 'black' as const };
const blacks = availableSkills(blackSettings).filter(s => s.tier === 'Black');
check(!goalPossible(blackSettings, blacks.slice(0,2).map(skillId)), 'two Black skills impossible');
check(goalPossible(blackSettings, [skillId(blacks[0])]), 'one Black goal possible');
const bronzes = availableSkills(base).filter(s => s.tier === 'Bronze');
check(!goalPossible(base, bronzes.slice(0,3).map(skillId)), 'three Bronze impossible under Gold guarantee');
check(!goalPossible(base, ['not a skill']), 'invalid goal rejected');
check(!goalPossible(base, [skillId(bronzes[0]), skillId(bronzes[0])]), 'duplicate target rejected');
const board = createSimulator(base, () => 0)();
check(matchesGoal([...board].reverse(), board.slice(0,2).map(s => s.id), 'S'), 'goal order irrelevant');
check(!matchesGoal([{ ...board[0], level: 'A' }], [board[0].id], 'S'), 'goal minimum level');
check(!matchesGoal(board, [], 'S'), 'empty goal is not a success');
assert.throws(() => createSimulator({ ...base, card: 'moment', momentSkill: 'unknown' }, rng(1)));
assert.throws(() => createSimulator(base, () => 1)());
assert.throws(() => createSimulator(base, () => NaN)());
console.log(`Skill simulator: ${assertions} checks passed (all card/position pools, slot guarantees, seeded frequency tests, target feasibility).`);
