import forecast from '../src/data/rivalPickForecast20.json';
import {forecastRoster, arizonaBatters} from '../src/lib/rivalPickForecastRoster';
import assert from 'node:assert/strict';
import {calculateBuffs} from '../src/lib/rivalsSeriesBuffs';
import {players, teams, findCandidates, summarize, validateLineup, signature, eligible, seriesData, formationSlots, targetFeasibility, editRequirement, makeRequirement} from '../src/lib/rivalsSeries';
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
 const opts={preferredTeams:['LAD'],starters,closers,seed:19};
 const results=findCandidates(opts,40);
 assert.equal(results.length,3);
 assert.equal(new Set(results.map(signature)).size,3);
 if(starters===5 && closers===2) assert.deepEqual(results,findCandidates(opts,40));
 for(const lineup of results) {
  assert.ok(validateLineup(lineup,opts));
  assert.equal(summarize(lineup).live,20);
  assert.equal(lineup.filter(x=>x.player.requirement&&!x.player.live).length,6);
  assert.ok(lineup.every(x=>x.player.pick || (x.player.requirement && x.player.year===null && x.player.ovr===null)));
  if(starters===5 && closers===2) {
    const original=JSON.stringify(lineup), source=JSON.stringify(players);
    const live=lineup.find(x=>x.player.requirement&&x.player.live)!;
    const changed=editRequirement(lineup,live.slot,{live:false});
    assert.ok(validateLineup(changed,opts));
    assert.equal(summarize(changed).live,19);
    assert.equal(calculateBuffs(summarize(changed)).total.all,calculateBuffs(summarize(lineup)).total.all-2);
    assert.equal(summarize(changed).pick,summarize(lineup).pick);
    assert.equal(summarize(changed).s,summarize(lineup).s);
    assert.deepEqual(summarize(changed).byTeam,summarize(lineup).byTeam);
    assert.deepEqual(editRequirement(changed,live.slot,{live:true}),lineup);
    const s=lineup.find(x=>x.player.requirement&&x.player.grade==='S')!;
    const graded=editRequirement(lineup,s.slot,{grade:'A'});
    assert.equal(summarize(graded).s,summarize(lineup).s-1);
    assert.equal(summarize(graded).a,summarize(lineup).a+1);
    assert.equal(JSON.stringify(lineup),original);assert.equal(JSON.stringify(players),source);
    assert.throws(()=>editRequirement(lineup,lineup.find(x=>x.player.pick)!.slot,{live:false}));
  }

  assert.notEqual(calculateBuffs(summarize(lineup)).match,'exact');
  assert.equal(calculateBuffs(summarize(lineup)).total.all,closers===2?18:17);
  const otherCP=picks.find(p=>p.positions.includes('CP')&&!lineup.some(x=>x.player.id===p.id))!;
  assert.equal(validateLineup(lineup.map(x=>x.slot==='RP1'?{...x,player:otherCP}:x),opts),false);
  assert.ok(summarize(lineup).byTeam.LAD>=3);
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
assert.throws(()=>makeRequirement('SP1','INVALID','S'));
assert.throws(()=>makeRequirement('SP1','LAD','B' as never));
const cp=picks.find(p=>p.positions.includes('CP'))!;
assert.equal(eligible(cp,'RP1'),false);
assert.equal(eligible(cp,'SP1'),false);
assert.equal(eligible(cp,'후보1'),false);
assert.equal(eligible(cp,'CP2'),true);
assert.equal(formationSlots({starters:6,closers:2}).length,26);
assert.equal(targetFeasibility().possible,false);
assert.throws(()=>formationSlots({starters:5,closers:3} as never));
assert.deepEqual(findCandidates({preferredTeams:[],starters:5,closers:2,seed:19},0),[]);
console.log('Rival Series official roster, eligibility, unique candidates and bounded search: PASS');

for(const preferredTeams of [['LAD','NYY'],teams.slice(0,8)]) {
 const options={preferredTeams,starters:5 as const,closers:2 as const,seed:19};
 const results=findCandidates(options,20);
 assert.ok(results.length>0);
 for(const lineup of results) {
  assert.ok(validateLineup(lineup,options));
  for(const team of preferredTeams) assert.ok(summarize(lineup).byTeam[team]>=3,`${team} needs three players`);
  assert.equal(summarize(lineup).live,20);
 }
}
assert.throws(()=>findCandidates({preferredTeams:teams.slice(0,9),starters:5,closers:2,seed:19}));
assert.throws(()=>findCandidates({preferredTeams:['INVALID'],starters:5,closers:2,seed:19}));
console.log('Multiple required clubs: three per club, eight-club boundary and invalid input PASS');

for (const batter of arizonaBatters) {
 const roster=forecastRoster(batter);
 const projected=roster.filter(p=>p.pick);
 assert.equal(projected.length,60);
 for (const team of teams) assert.equal(projected.filter(p=>p.team===team).length,2);
 assert.ok(projected.every(p=>!picks.some(old=>old.id===p.id) && p.ovr===null));
 assert.equal(projected.filter(p=>!p.positions.length).length,3);
 assert.ok(projected.some(p=>p.noticeName===batter && p.team==='AZ'));
 for (const row of Object.values(forecast)) {
   assert.ok(projected.some(p=>p.id===row.pitcherCardId && p.noticeName===row.pitcher));
 }
 const options={preferredTeams:['LAD','NYY'],starters:6 as const,closers:1 as const,seed:19};
 const results=findCandidates(options,40,roster);
 assert.equal(results.length,3);
 for (const lineup of results) {
   assert.ok(validateLineup(lineup,options,roster));
   assert.ok(!validateLineup(lineup,options));
   const counts=summarize(lineup);
   assert.ok(counts.byTeam.LAD>=3 && counts.byTeam.NYY>=3);
   assert.equal(calculateBuffs(counts).match,'exact');
 }
}
console.log('20차 예상 카드 대조, AZ 동률 시나리오, 19/4/5 탐색 PASS');
