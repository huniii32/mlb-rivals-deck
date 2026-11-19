import assert from 'node:assert/strict';
import {calculateBuffs,buffRules,type BuffCounts} from '../src/lib/rivalsSeriesBuffs';
const empty=(): BuffCounts=>({byTeam:{},live:0,pick:0,s:0,a:0,unknownGrade:0});
const eightTeams=Object.fromEntries(Array.from({length:8},(_,i)=>[`TEAM${i}`,i<2?4:3]));
// Screenshot: 24 Live, 2 Pick, S21/A5. Team contribution +8 is inferred from
// displayed total, not an assertion about the unseen club names.
assert.deepEqual(calculateBuffs({...empty(),byTeam:eightTeams,live:24,pick:2,s:21,a:5}).total,{all:17,batter:3,pitcher:3,box:20});
const target={...empty(),byTeam:eightTeams,live:26,pick:15,s:20,a:6};
assert.deepEqual(calculateBuffs(target).total,{all:19,batter:4,pitcher:5,box:30});
assert.equal(calculateBuffs(target).match,'exact');
assert.equal(calculateBuffs({...target,s:21,a:5}).total.pitcher,4);
assert.equal(calculateBuffs({...target,pick:14}).match,'below');
assert.equal(calculateBuffs({...target,unknownGrade:1}).match,'unknown');
assert.equal(calculateBuffs({...target,byTeam:{...eightTeams,EXTRA:3}}).match,'above');
// Every threshold: one player short, exact threshold, one extra. All previous
// threshold effects persist, independently for A and S and for each club.
for(const category of Object.keys(buffRules) as (keyof typeof buffRules)[]) {
 for(const rule of buffRules[category]) {
  const get=(n:number)=>calculateBuffs({...empty(),...(category==='team'?{byTeam:{ONE:n}}:{[category]:n})}).total;
  const before=get(rule.at-1),at=get(rule.at),after=get(rule.at+1);
  for(const key of ['all','batter','pitcher','box'] as const) assert.equal(at[key]-before[key],rule.effect[key]);
  assert.deepEqual(after,at);
 }
}
assert.deepEqual(calculateBuffs({...empty(),byTeam:{ONE:8,TWO:6}}).total,{all:2,batter:2,pitcher:1,box:0});
assert.deepEqual(calculateBuffs({...empty(),s:20,a:6}).total,{all:2,batter:2,pitcher:3,box:0});
console.log('Rival Series screenshots 17/3/3, target 19/4/5, cumulative thresholds and independent grades: PASS');
