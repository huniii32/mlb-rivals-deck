import assert from 'node:assert/strict';
import {analyzeTrials} from '../src/lib/simulatorAnalysis';
import {matchesCombinationGoal,validCombinationGoal} from '../src/lib/combinationGoal';
import {ROSTER,rosterForScope} from '../src/lib/combinationRoster';
import {presetFromPlayer,lockedPreset,presetSkills} from '../src/lib/simulatorPreset';
import {skillId,type SimSettings} from '../src/lib/skillSimulator';
import {readSession,saveSession,object} from '../src/lib/simulatorSession';
import type {PlayerInput} from '../src/lib/engine';
async function main(){
 const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)}});
 assert(saveSession('skills',{mode:'score',target:42}));assert.deepEqual(readSession('skills',object),{mode:'score',target:42});memory.set('rivals.simulator.skills.v1','{bad');assert.equal(readSession('skills',object),null);assert.equal(readSession('combination',object),null);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('quota')}}});assert.equal(readSession('skills',object),null);assert.equal(saveSession('skills',{}),false);
 const pool=rosterForScope({type:'team',value:'LAD'});const desired=pool.find(p=>ROSTER.some(q=>q.id!==p.id&&q.name===p.name))!;const sameName=ROSTER.find(p=>p.id!==desired.id&&p.name===desired.name)!;
 assert(validCombinationGoal(pool,{mode:'wishlist',ids:[desired.id]}));assert(!validCombinationGoal(pool,{mode:'wishlist',ids:[]}));assert(!validCombinationGoal(pool,{mode:'wishlist',ids:['missing']}));assert(matchesCombinationGoal(desired,{mode:'wishlist',ids:[desired.id]}));assert(!matchesCombinationGoal(sameName,{mode:'wishlist',ids:[desired.id]}),'different theme/team is not the desired card');assert(matchesCombinationGoal(desired,{mode:'supreme'}));
 const settings:SimSettings={card:'normal',position:'DH',ticket:'superior',protectS:true,momentSkill:''};const first=presetSkills(settings).find(s=>s.name==='배팅 머신')!;
 const preset=lockedPreset(settings,skillId(first),'S');assert.equal(preset.locked?.name,first.name);assert.equal(preset.board.length,1);assert.throws(()=>lockedPreset({...settings,card:'hof'},skillId(first),'S'));assert.throws(()=>lockedPreset(settings,'missing','S'));
 const p={name:'테스트',card:'시그니처',kind:'batter',pos:'DH',skills:['[S4] 배팅 머신','[S0] 타점기계','[S0] 클린업 트리오 (O)','']} as PlayerInput;
 const before=JSON.stringify(p);const imported=presetFromPlayer(p,{overrides:{},customs:[]});assert.equal(imported.board.length,3);assert.equal(imported.board[0].level,'S');assert.equal(imported.settings.position,'DH');assert.equal(imported.choices['Gold:클린업 트리오'],'[S0] 클린업 트리오 (O)');assert.equal(imported.locked,null);assert.equal(JSON.stringify(p),before,'deck unchanged');
 assert.equal(presetFromPlayer({...p,card:'WBC 시그니처 블랙'},{overrides:{},customs:[]}).settings.card,'wbcBlack');assert.equal(presetFromPlayer({...p,card:'명예의 전당',kind:'pitcher',pos:'RP2',bullpenRole:'closer'},{overrides:{},customs:[]}).settings.position,'CP');
 const incomplete=presetFromPlayer({...p,skills:['[S0] 알수없음','[S0] 배팅 머신','','']},{overrides:{},customs:[]});assert.equal(incomplete.board.length,0,'unmatched first slot must not shift second into first');assert.match(incomplete.message,/직접 확인/);
 const controller=new AbortController();let experiment=0;const result=await analyzeTrials(()=>{const target=[1,3,101,Infinity][experiment++];let n=0;return()=>++n===target;},4,200,controller.signal);
 assert.deepEqual({done:result.completed,success:result.successes,within:result.within100,mean:result.mean,median:result.median,tries:result.attempts},{done:4,success:3,within:2,mean:35,median:3,tries:305});
 const cancel=new AbortController();const partial=await analyzeTrials(()=>()=>false,2,5000,cancel.signal,()=>{},async()=>{cancel.abort()});assert.equal(partial.completed,0);assert.equal(partial.successes,0);assert.equal(partial.attempts,2000);assert.equal(partial.mean,null);assert(partial.stopped);
 await assert.rejects(()=>analyzeTrials(()=>()=>true,1000,10000,controller.signal));
 console.log('Simulator features: session fallback, storage failure, exact card wishlist, manual locks, deck mapping/conditions/non-mutation, independent analysis/censoring/cancellation passed.');
}
void main().catch(e=>{console.error(e);process.exitCode=1});
