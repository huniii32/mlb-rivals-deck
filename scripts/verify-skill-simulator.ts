import assert from "node:assert/strict";
import { availableSkills, CARD_TYPES, createSimulator, dedicatedTiers, runTrialChunk, slotRules, TICKETS, goalPossible, LEVELS, matchesGoal, momentSkills, POSITIONS, PROBABILITY_DATA, skillId, slotCount, type Board, type SimSettings, type Ticket, type Tier } from "../src/lib/skillSimulator";
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
for (const ticket of Object.keys(TICKETS) as Ticket[]) for (const card of Object.keys(CARD_TYPES) as SimSettings['card'][]) for (const position of Object.keys(POSITIONS) as SimSettings['position'][]) {
  const settings = { ...base, ticket, card, position, momentSkill: momentSkills(position)[0].name };
  const allowed = new Set(availableSkills(settings).map(skillId));
  for (const rule of slotRules(settings)) check(Math.abs(Object.values(rule.tiers).reduce((a,b) => a+b,0)-100)<1e-9, 'slot probabilities total 100');
  const draw = createSimulator(settings, rng(842));
  for (let i=0;i<60;i++) {
    const b=draw();
    check(b.length===slotCount(card) && b.every(s=>allowed.has(s.id)), 'ticket/card/position pool');
    check(new Set(b.map(s=>s.name)).size===b.length, 'no duplicate names for any ticket');
    check(b.filter(s=>s.tier==='Black').length<=1, 'at most one Black for all tickets');
    if (ticket!=='superior') check(b.every(s=>s.tier!=='Moment'), 'Moment requires superior ticket');
    if (ticket==='basic') check(b.every(s=>s.tier!=='Black' && s.tier!=='WBC'), 'basic has no Black/WBC');
  }
}
for (const ticket of ['basic','advanced'] as const) {
  const draw=createSimulator({...base,ticket,protectS:false},rng(991));
  const counts:Partial<Record<Tier,number>>={}; const levelCounts=Object.fromEntries(LEVELS.map(l=>[l,0]));
  for(let i=0;i<30000;i++){const b=draw(); counts[b[0].tier]=(counts[b[0].tier]??0)+1;levelCounts[b[0].level]++;}
  for(const [tier,rate] of [['Iron',.35],['Bronze',.3],['Silver',.2],['Gold',.15]] as const) check(Math.abs(counts[tier]!/30000-rate)<.012, `${ticket} ${tier} frequency`);
  for(const [i,rate] of [.4,.3,.2,.07,.03].entries()) check(Math.abs(levelCounts[LEVELS[i]]/30000-rate)<.012, `${ticket} level ${LEVELS[i]}`);
  for(const [card,tier,rate] of [['hof','HOF',ticket==='basic'?.001:.015],['wbc','WBC',ticket==='basic'?0:.005],['black','Black',ticket==='basic'?0:.05]] as const){
    const special=createSimulator({...base,card,ticket},rng(893));let hits=0;
    for(let i=0;i<50000;i++)if(special()[0].tier===tier)hits++;
    check(Math.abs(hits/50000-rate)<.0025, `${ticket}/${card} dedicated probability`);
  }
}
// After Black, WBC must use .5% (not .5/95%); normal Black returns to 35/30/20/15.
for(const card of ['black','wbcBlack'] as const){
  let calls=0;const b=createSimulator({...base,card,ticket:'advanced'},()=>calls++===0?.999: .1)();
  check(b[0].tier==='Black' && b.slice(1).every(s=>s.tier!=='Black'),'advanced Black cannot recur');
  check(!goalPossible({...base,card,ticket:'advanced'},availableSkills({...base,card,ticket:'advanced'}).filter(s=>s.tier==='Black').slice(0,2).map(skillId)),'advanced two Black goal impossible');
}
check(goalPossible({...base,ticket:'basic'},PROBABILITY_DATA.tables.basic.SP.filter(s=>s.tier==='Iron').slice(0,3).map(skillId)), 'basic permits three Iron');
const transitionRandom=[.999,0,.9949,0,.1,0,.1,0];let transitionIndex=0;
const transitioned=createSimulator({...base,card:'wbcBlack',ticket:'advanced'},()=>transitionRandom[transitionIndex++])();
check(transitioned[0].tier==='Black' && transitioned[1].tier==='Gold', 'after Black uses exactly Gold 99.5%, not 94.5/95');
check(!goalPossible({...base,card:'moment',ticket:'advanced'},[skillId(momentSkills('SP')[0])]), 'lower ticket cannot target Moment');
// Regression: 100 requested, dedicated skill on draw 97 => exactly 97 consumed and winner retained.
for(const [card,tier] of [['moment','Moment'],['supreme','Moment'],['hof','HOF'],['wbc','WBC'],['wbcBlack','WBC']] as const){
  for(const [limit,at] of [[100,97],[10,7],[100,1],[100,100],[10,11]]){
    let drawn=0,recorded=0;let last:Board=[];
    const special=dedicatedTiers({...base,card});
    const result=runTrialChunk(()=>{drawn++;return [{...board[0],tier:drawn===at?tier:'Gold'}];},limit,b=>{last=b;recorded++;},b=>b.some(s=>special.includes(s.tier)));
    check(result.completed===Math.min(limit,at) && drawn===recorded && drawn===result.completed,'actual consumption at first dedicated skill');
    check(result.stopped===(at<=limit) && last[0].tier===(at<=limit?tier:'Gold'),'winning result preserved');
  }
}
check(!dedicatedTiers({...base,card:'wbcBlack'}).includes('Black'),'guaranteed Black does not stop superior');
check(dedicatedTiers({...base,card:'wbcBlack',ticket:'advanced'}).includes('Black'),'rare Black stops advanced');
let goalDraws=0;
const goalResult=runTrialChunk(()=>{goalDraws++;return [{...board[0],id:goalDraws===5?'target':'other',tier:'Moment'}];},10,()=>{},b=>matchesGoal(b,['target'],'S'));
check(goalResult.completed===5 && goalResult.stopped,'goal mode continues through other dedicated skills');
console.log(`Skill simulator: ${assertions} checks passed (three tickets, all card/position pools, official probabilities, exact stop counts).`);
