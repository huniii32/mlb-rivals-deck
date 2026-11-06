import assert from 'node:assert/strict';
import { ROSTER, ROSTER_METADATA, TEAMS, DIVISIONS, LEAGUES, PROTECTED_RATES, rosterForScope, createProtectedCombination, themeLabel, type CombinationScope, type Division, type League } from '../src/lib/combinationRoster';
import {shuffleCandidates,pickCombination} from '../src/lib/momentCombination';
function rng(seed:number){return()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
assert.equal(ROSTER.filter(p=>p.grade==='supreme').length,744);assert.equal(ROSTER.filter(p=>p.grade==='moment').length,2686);assert.equal(ROSTER_METADATA.excluded,6);
assert.equal(new Set(ROSTER.map(p=>p.id)).size,ROSTER.length);
assert(ROSTER.every(p=>p.name&&p.enName&&p.theme&&TEAMS.some(t=>t.id===p.team)));
assert.equal(new Set(ROSTER.filter(p=>p.grade==='supreme').map(p=>p.theme)).size,4);
assert.equal(new Set(ROSTER.filter(p=>p.grade==='moment').map(p=>p.theme)).size,20);
assert.deepEqual(PROTECTED_RATES,{supreme:15,moment:85});
for(const division of Object.keys(DIVISIONS))assert.equal(TEAMS.filter(t=>t.division===division).length,5);
for(const league of Object.keys(LEAGUES))assert.equal(TEAMS.filter(t=>t.league===league).length,15);
const scopes:CombinationScope[]=[{type:'all'},...TEAMS.map(t=>({type:'team' as const,value:t.id})),...(Object.keys(DIVISIONS) as Division[]).map(value=>({type:'division' as const,value})),...(Object.keys(LEAGUES) as League[]).map(value=>({type:'league' as const,value}))];
for(const scope of scopes){
 const pool=rosterForScope(scope);assert(pool.some(p=>p.grade==='supreme'));assert(pool.some(p=>p.grade==='moment'));
 const ids=new Set(pool.map(p=>p.id)),random=rng(492),draw=createProtectedCombination(scope,random);
 for(let i=0;i<100;i++){
  const candidates=draw();assert.equal(candidates.length,5);assert(candidates.every(p=>ids.has(p.id)));
  const shuffled=shuffleCandidates(candidates,random);assert.deepEqual(shuffled.map(p=>p.id).sort(),candidates.map(p=>p.id).sort());
  assert(ids.has(pickCombination(shuffled,random).chosen.id));
 }
 const allowedTeams=TEAMS.filter(t=>scope.type==='all'||(scope.type==='team'?t.id===scope.value:scope.type==='division'?t.division===scope.value:t.league===scope.value)).map(t=>t.id);
 assert(pool.every(p=>allowedTeams.includes(p.team)));
}
for(const scope of [{type:'all'},{type:'team',value:'NYY'},{type:'division',value:'NLW'},{type:'league',value:'AL'}] as CombinationScope[]){
 const random=rng(19),draw=createProtectedCombination(scope,random);let hits=0,present=0;
 for(let i=0;i<20000;i++){const candidates=draw();if(candidates.some(p=>p.grade==='supreme'))present++;if(pickCombination(candidates,random).chosen.grade==='supreme')hits++;}
 assert(Math.abs(hits/20000-.15)<.015,'guarantee scope keeps actual protected Supreme rate at15%');
 assert(Math.abs(present/20000-(1-.85**5))<.015,'candidate appearance and acquired card remain separate');
}
assert.throws(()=>rosterForScope({type:'team',value:'UNKNOWN'} as unknown as CombinationScope));
assert.throws(()=>createProtectedCombination({type:'all'},()=>1)());
assert.equal(themeLabel('OCTOBER LEGEND'),'옥토버 레전드');assert.equal(themeLabel('Franchise'),'Franchise');
console.log('Combination roster: 3,430 eligible card entries; 39 filter scopes, team/division/league containment, protected15/85%, independent candidates and blind shuffle passed.');
