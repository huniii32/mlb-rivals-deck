import assert from 'node:assert/strict';
import {combinationRates,drawCombinationCandidates,pickCombination,shuffleCandidates,hasSpecialCandidate, type Material} from '../src/lib/momentCombination';
function rng(seed:number){return()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
assert.deepEqual(combinationRates(['moment','moment','moment']),{supreme:15,moment:85,S:0,A:0,B:0,C:0});
assert.deepEqual(combinationRates(['moment','S','C']),{supreme:5,moment:30,S:65,A:0,B:0,C:0});
assert.deepEqual(combinationRates(['S','S','S']),{supreme:0,moment:3,S:97,A:0,B:0,C:0});
assert.deepEqual(combinationRates(['C','C','C']),{supreme:0,moment:0,S:0,A:0,B:30,C:70});
const types:Material[]=['moment','S','A','B','C'];
for(const a of types)for(const b of types)for(const c of types){const r=combinationRates([a,b,c]);assert.equal(Object.values(r).reduce((a,b)=>a+b,0),100);assert.equal(r.supreme,[a,b,c].filter(m=>m==='moment').length*5);assert(Object.values(r).every(v=>v>=0&&v<=100));}
assert.throws(()=>combinationRates(['moment']));assert.throws(()=>combinationRates(['bad','S','C'] as Material[]));
const random=rng(37);let candidates=0,wins=0;
for(let i=0;i<50000;i++){const b=drawCombinationCandidates(['moment','moment','moment'],random);assert.equal(b.length,5);assert(b.every(g=>g==='moment'||g==='supreme'));if(b.includes('supreme'))candidates++;if(pickCombination(b,random).chosen==='supreme')wins++;}
assert(Math.abs(wins/50000-.15)<.01,'selected chance is 15%, not five-draw best-of chance');assert(Math.abs(candidates/50000-(1-.85**5))<.01,'candidate presence is a distinct probability');
const board=['supreme','moment','moment','moment','moment'] as const;
assert.equal(pickCombination(board,()=>.99).chosen,'moment','do not automatically choose supreme candidate');
assert.deepEqual([...shuffleCandidates(board,rng(90))].sort(),[...board].sort(),'shuffle preserves candidate multiset');
assert(hasSpecialCandidate(board));assert(!hasSpecialCandidate(['S','A','A','B','C']));
assert.throws(()=>pickCombination([],rng(2)));assert.throws(()=>drawCombinationCandidates(['C','C','C'],()=>1));
console.log('Moment combination: 125 material combinations, official cap/priority rules, five independent candidates, blind-selection frequencies and shuffle passed.');
