import assert from 'node:assert/strict';
import fs from 'node:fs';
import { availableSkills, skillId, type DrawSkill } from '../src/lib/skillSimulator';
import { SETTINGS, EVALUATOR } from '../src/demo/eventModel';
import { HOF_PLAYERS } from '../src/lib/hofRecruitment';
import { ROSTER, themeLabel } from '../src/lib/combinationRoster';
const sql=fs.readFileSync('scripts/event-rules-v1.sql','utf8');
const json=sql.match(/'(\{.*\})'::jsonb/)?.[1];
assert.ok(json);
const rules=JSON.parse(json.replace(/''/g,"'"));
assert.deepEqual(rules.settings,SETTINGS);
assert.deepEqual(rules.skills,availableSkills(SETTINGS).map(s=>{
  const item=EVALUATOR.evaluate({...s,id:skillId(s),level:'S'} as DrawSkill);
  assert.notEqual(item.score,null);
  return {id:skillId(s),name:s.name,tier:s.tier,weight:s.rates.reduce((a,b)=>a+b,0),score:item.score,basis:item.basis};
}));
assert.deepEqual(rules.hof,HOF_PLAYERS);
assert.deepEqual(rules.moment,ROSTER.map(p=>({id:p.id,name:p.name,team:p.team,grade:p.grade,theme:themeLabel(p.theme)})));
console.log('Frozen event SQL rules match all official skill/HOF pools, S score conditions, and 3,430 moment roster entries.');
