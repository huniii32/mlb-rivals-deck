import assert from 'node:assert/strict';
import {players, teams, findCandidates, summarize, validateLineup, signature, eligible, seriesData} from '../src/lib/rivalsSeries';
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
for(const allow of [false,true]) {
 const opts={preferredTeam:'LAD',allowCloserInRelief:allow,seed:19};
 const results=findCandidates(opts);
 assert.equal(results.length,3);
 assert.equal(new Set(results.map(signature)).size,3);
 assert.deepEqual(results,findCandidates(opts));
 for(const lineup of results) {
  assert.ok(validateLineup(lineup,allow));
  assert.ok(lineup.some(x=>x.player.team==='LAD'));
  assert.equal(summarize(lineup).live,26);
  assert.equal(Object.values(summarize(lineup).byTeam).reduce((a,b)=>a+b,0),26);
  assert.equal(validateLineup([...lineup.slice(1),lineup[1]],allow),false);
  assert.ok(lineup.every(x=>!seriesData.excludedFromSearch.includes(x.player.id)));
 }
 console.log('Rival Series candidate counts:',allow?'CP→RP experimental':'strict',results.map(summarize));
}
const cp=picks.find(p=>p.positions.includes('CP'))!;
assert.equal(eligible(cp,'RP1',false),false);
assert.equal(eligible(cp,'RP1',true),true);
assert.equal(eligible(cp,'SP1',true),false);
assert.equal(eligible(cp,'보관1',true),false);
assert.deepEqual(findCandidates({preferredTeam:'',allowCloserInRelief:false,seed:19},0),[]);
console.log('Rival Series official roster, eligibility, unique candidates and bounded search: PASS');
