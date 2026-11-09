import assert from "node:assert/strict";
import { blankPlayer, LINEUP, normalizeDeck, resizeBullpen } from "../src/lib/deck";
import { rankingEligibility } from "../src/lib/rankingEligibility";
import { syncLinks } from "../src/lib/rankSync";

const players = LINEUP.map(l => ({ ...blankPlayer(l.row,l.kind,l.pos,l.order), name: `선수 ${l.row}` }));
assert.equal(rankingEligibility(players).eligible,true);
for (const index of [0,9,14,17]) {
  const sparse = players.map((p,i) => i===index ? {...p,name:" \t\n　 "} : p);
  assert.equal(rankingEligibility(sparse).eligible,false);
  assert.match(rankingEligibility(sparse).message,/1명/);
}
assert.equal(rankingEligibility([...players.slice(0,-1),{...players[14]}]).eligible,false,"duplicate slot cannot replace closer");
// An explicit role may differ from its original spreadsheet row.
const moved = players.map(p => p.excelRow===30 ? {...p,bullpenRole:"winning" as const} : p.excelRow===27 ? {...p,bullpenRole:"closer" as const} : p);
assert.equal(rankingEligibility(moved).eligible,true);
const noCloser = players.map(p => p.excelRow===30 ? {...p,bullpenRole:"winning" as const} : p);
assert.equal(rankingEligibility(noCloser).eligible,false);
const expanded = resizeBullpen(players,"winning",4);
assert.equal(expanded.length,21);
assert.equal(rankingEligibility(expanded).eligible,true,"optional empty bullpen slots are allowed");

async function run() {
  const full = normalizeDeck({ id:"requirements",name:"완성 덱",updatedAt:1,players,flags:{},yearInputs:{},chem:{} } as any);
  const incomplete = {...full,players:players.map((p,i)=>i===17?{...p,name:""}:p)};
  let writes=0;
  const rpc = async()=>{writes++; return {data:true,error:null};};
  const links = { ranking:{deckId:full.id,token:"test-token",password:true as const,sig:"previous-valid-state"} };
  const blocked = await syncLinks({links,decks:[incomplete],tables:{customs:[],overrides:{}},rpc});
  assert.equal(writes,0); assert.equal(blocked.blocked,1);
  assert.deepEqual(blocked.links,links,"incomplete local edits never overwrite or unlink published deck");
  const resumed = await syncLinks({links:blocked.links,decks:[full],tables:{customs:[],overrides:{}},rpc});
  assert.equal(writes,1); assert.equal(resumed.pushed,1); assert.equal(resumed.blocked,0);
  console.log("Ranking roster: each minimum, blank names, role changes, optional slots, update hold and resume passed.");
}
run().catch(e=>{console.error(e);process.exitCode=1;});
