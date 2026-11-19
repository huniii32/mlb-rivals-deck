import assert from 'node:assert/strict';
import {calculateBuffs} from '../src/lib/rivalsSeriesBuffs';
import {players, teams, findCandidates, summarize, validateLineup, signature, eligible, seriesData, formationSlots, targetFeasibility} from '../src/lib/rivalsSeries';
assert.equal(players.length,1186);
assert.equal(new Set(players.map(p=>p.id)).size,players.length);
const picks=players.filter(p=>p.pick);
assert.equal(picks.length,60);
for(const team of teams) assert.equal(picks.filter(p=>p.team===team).length,2);
assert.equal(picks.find(p=>p.noticeName==='메이슨 밀러')?.ovr,86);
assert.equal(picks.find(p=>p.noticeName==='피트 크로우-암스트롱')?.ovr,88);
assert.equal(picks.filter(p=>p.positions.includes('SP')).length,0);
assert.equal(seriesData.excludedFromSearch.length,50);
for(const id of seriesData.excludedFromSearch) assert.equal(players.find(p=>p.id===id)?.positions.length,0);
for(const starters of [4,5,6] as const) for(const closers of [1,2] as const) {
 const opts={preferredTeam:'LAD',starters,closers,seed:19};
 const results=findCandidates(opts,40);
 assert.equal(results.length,3);
 assert.equal(new Set(results.map(signature)).size,3);
 if(starters===5 && closers===2) assert.deepEqual(results,findCandidates(opts,40));
 for(const lineup of results) {
  assert.ok(validateLineup(lineup,opts));
  assert.notEqual(calculateBuffs(summarize(lineup)).match,'exact');
  assert.equal(calculateBuffs(summarize(lineup)).total.all,closers===2?18:17);
  const otherCP=picks.find(p=>p.positions.includes('CP')&&!lineup.some(x=>x.player.id===p.id))!;
  assert.equal(validateLineup(lineup.map(x=>x.slot==='RP1'?{...x,player:otherCP}:x),opts),false);
  assert.ok(lineup.some(x=>x.player.team==='LAD'));
  assert.equal(lineup.filter(x=>x.slot.startsWith('SP')).length,starters);
  assert.equal(lineup.filter(x=>x.slot.startsWith('CP')).length,closers);
  assert.equal(lineup.filter(x=>x.slot.startsWith('RP')).length,12-starters-closers);
  assert.equal(lineup.filter(x=>x.slot.startsWith('후보')).length,5);
  assert.equal(validateLineup([...lineup.slice(1),lineup[1]],opts),false);
  assert.ok(lineup.every(x=>!seriesData.excludedFromSearch.includes(x.player.id)));
  assert.ok(lineup.filter(x=>x.slot.startsWith('RP')).every(x=>x.player.positions.includes('RP')));
 }
 console.log('Formation',starters,closers,'buffs',results.map(r=>calculateBuffs(summarize(r)).total));
}
const cp=picks.find(p=>p.positions.includes('CP'))!;
assert.equal(eligible(cp,'RP1'),false);
assert.equal(eligible(cp,'SP1'),false);
assert.equal(eligible(cp,'후보1'),false);
assert.equal(eligible(cp,'CP2'),true);
assert.equal(formationSlots({starters:6,closers:2}).length,26);
assert.equal(targetFeasibility().possible,false);
assert.throws(()=>formationSlots({starters:5,closers:3} as never));
assert.deepEqual(findCandidates({preferredTeam:'',starters:5,closers:2,seed:19},0),[]);
console.log('Rival Series official roster, eligibility, unique candidates and bounded search: PASS');
