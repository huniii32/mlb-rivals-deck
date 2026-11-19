import assert from "node:assert/strict";
import {blankPlayer, DEFAULT_CHEM, LINEUP, normalizeDeck, type Deck} from "../src/lib/deck";
import {calcDeckTotal, deckPlayerResults, LOOKUP, skillScore} from "../src/lib/engine";
import {WBC_SKILLS} from "../src/lib/wbcSkills";
import {skillCondition} from "../src/lib/skillLabels";
import {applyDeckUpdate} from "../src/lib/playerUpdates";
import {parseDeckFile, buildBundle} from "../src/lib/deckFile";
import {rankArgs} from "../src/lib/rankSync";
import {tacticStatus} from "../src/lib/bullpen";
import {availableSkills, PROBABILITY_DATA, skillId} from "../src/lib/skillSimulator";
import {createScoreEvaluator} from "../src/lib/simulatorScore";
import {presetFromPlayer} from "../src/lib/simulatorPreset";

const tables={overrides:{},customs:[]};
const expected=[
 ["batter","키스톤 (SS·2B O)",35.70,40.45,45.20],
 ["batter","키스톤 (SS·2B X)",14.10,16.45,18.80],
 ["batter","사령관 (포수 O)",35.70,40.45,45.20],
 ["batter","사령관 (포수 X)",14.10,16.45,18.80],
 ["batter","하모니 (동일 국가 1명)",14.10,16.45,18.80],
 ["batter","하모니 (동일 국가 2~3명)",26.10,28.45,30.80],
 ["batter","하모니 (동일 국가 4명 이상)",42.90,45.25,47.60],
 ["pitcher","하모니 (동일 국가 1명)",12,14,16],
 ["pitcher","하모니 (동일 국가 2~3명)",23.75,25.75,27.75],
 ["pitcher","하모니 (동일 국가 4명 이상)",40.20,42.20,44.20],
] as const;
for(const [kind, name, ...values] of expected) for(let level=0;level<3;level++) {
 const key=`[S${level}] WBC ${name}`;
 assert.equal(skillScore(kind,key,tables),values[level],key);
 assert.ok(LOOKUP[kind].some(r=>r.name===key));
}
assert.equal(WBC_SKILLS.length,30);
assert.equal(skillCondition("[S0] 파워 피쳐(구속>인내) O"),"구속>인내 · O");
assert.equal(skillCondition("[S0] 파워 피쳐(구속>인내) X"),"구속>인내 · X");
assert.equal(skillCondition("[S0] 라이징 스타 (선발 (O))"),"선발 (O)");
assert.equal(skillScore("pitcher","[S0] 파워 피쳐(구속>인내) O",tables),47.5);
assert.equal(skillScore("pitcher","[S0] 파워 피쳐(구속>인내) X",tables),23.5);
const deck:Deck=normalizeDeck({id:"test",name:"시험 덱",updatedAt:1,chem:{...DEFAULT_CHEM},flags:{},yearInputs:{},players:LINEUP.map(l=>({...blankPlayer(l.row,l.kind,l.pos,l.order),name:`선수${l.row}`,card:"WBC 시그니처",wbcCountry:"USA"}))});
deck.players[0].wbcCountry="KOR";
deck.players[0].skills[0]="[S0] WBC 하모니 (동일 국가 4명 이상)";
const result=(d:Deck,i=0)=>deckPlayerResults(d,tables)[i];
assert.equal(result(deck).skillDetails[0].score,14.1,"stored selection cannot override one national player");
const spacing=structuredClone(deck);spacing.players[0].skills[0]="[S0]wbc하모니(동일국가4명이상)";
assert.equal(result(spacing).skillDetails[0].score,14.1,"spacing/case variants cannot bypass lineup conditions");
for(const n of [2,3,4]) {
 const d=structuredClone(deck);
 // Count across batter and pitcher groups, with the owner counted exactly once.
 for(let j=1;j<n;j++)d.players[8+j].wbcCountry="KOR";
 assert.equal(result(d).skillDetails[0].score,n>=4?42.9:26.1);
 assert.deepEqual(parseDeckFile(buildBundle([d],{}))[0].deck.players,d.players);
 assert.equal(rankArgs(d,tables).args.p_total,calcDeckTotal(d,tables).total);
}
const unknown=structuredClone(deck);
delete unknown.players[9].wbcCountry;
assert.equal(result(unknown).skill,null);
assert.ok(result(unknown).warnings.some(w=>w.includes("조건 미확인")));
const enough=structuredClone(unknown);
for(const i of [1,2,3])enough.players[i].wbcCountry="KOR";
assert.equal(result(enough).skillDetails[0].score,42.9,"unknown fifth player cannot change already satisfied maximum");
unknown.players[9].name="";
assert.equal(result(unknown).skillDetails[0].score,14.1,"empty slots do not count");
const notWbc=structuredClone(deck);
notWbc.players[9].card="시그니처";notWbc.players[9].wbcCountry="KOR";
assert.equal(result(notWbc).skillDetails[0].score,14.1,"country on a non-WBC card is not counted");
notWbc.players[0].card="시그니처";
assert.equal(result(notWbc).skillDetails[0].score,0,"new WBC skill on non-WBC card is inactive");
const positions=structuredClone(deck);
for(const [skill,good,bad] of [["키스톤 (SS·2B X)","SS","DH"],["사령관 (포수 X)","C","1B"]]){
 positions.players[0].skills[0]=`[S2] WBC ${skill}`;
 positions.players[0].pos=good;assert.equal(result(positions).skillDetails[0].score,45.2);
 positions.players[0].pos=bad;assert.equal(result(positions).skillDetails[0].score,18.8);
}
const pitcher=structuredClone(deck);
pitcher.players[9].skills[0]="[S0] WBC 하모니 (동일 국가 1명)";
assert.equal(result(pitcher,9).skillDetails[0].score,40.2,"pitcher debuff excludes vision");
const changing=structuredClone(deck);changing.players[0].finalOv=[180,180,180];
const changed=applyDeckUpdate(changing,{players:changing.players.map((p,i)=>i===9?{...p,wbcCountry:"KOR"}:p)},tables);
assert.deepEqual(changed.players[0].finalOv,[180,180,180],"skill condition changes must not alter input stats");
assert.equal(result(changed).total-result(changing).total,12);
const saved=JSON.stringify(changed);result(changed);result(changed);
assert.equal(JSON.stringify(changed),saved,"calculations do not mutate input");
const preset=presetFromPlayer(changed.players[0],tables,"superior",changed.players);
assert.equal(preset.choices["WBC:WORLD BASEBALL CLASSIC 하모니"],"[S0] WBC 하모니 (동일 국가 2~3명)");
assert.throws(()=>presetFromPlayer(deck.players[0],tables),/조건 미확인/);
const training=structuredClone(deck);training.players[0].skills=["","","",""];training.players[0].pohLv=20;training.players[0].finalOv=[180,180,180];
for(const level of [21,23,26]){
 const updated=applyDeckUpdate(training,{players:training.players.map((p,i)=>i===0?{...p,pohLv:level}:p)},tables);
 assert.deepEqual(result(updated).poh,result(training).poh,"unverified extension retains verified 20-level portion");
 assert.deepEqual(updated.players[0].finalOv,training.players[0].finalOv);
 assert.ok(result(updated).warnings.some(w=>w.includes("20레벨까지만 반영한 임시 점수")));
}
const basic={winning:"basic",chasing:"basic"} as const;
assert.equal(tacticStatus(deck.players,{...basic,winning:"aggressive"}).winningBonus,2);
assert.equal(tacticStatus(deck.players,{...basic,chasing:"aggressive"}).chasingBonus,0);
assert.equal(tacticStatus(deck.players.map(p=>p.excelRow===27?{...p,name:""}:p),{...basic,winning:"aggressive"}).winningBonus,0);
assert.equal(tacticStatus(deck.players,{...basic,winning:"division"}).winningBonus,0);
assert.equal(PROBABILITY_DATA.asOf,"2026-11-18");
for(const position of ["SP","RP","CP","C","SS","2B","DH"] as const)for(const card of ["wbc","wbcBlack"] as const)for(const ticket of ["advanced","superior"] as const){
 const settings={position,card,ticket,protectS:true,momentSkill:""};
 const pool=availableSkills(settings), evaluator=createScoreEvaluator(settings,tables);
 const harmony=pool.find(s=>s.name==="WORLD BASEBALL CLASSIC 하모니");assert.ok(harmony);
 assert.equal(evaluator.options.get(skillId(harmony))?.length,3);
 for(const s of pool.filter(s=>/키스톤|사령관/.test(s.name))){
  assert.equal(evaluator.options.get(skillId(s))?.length,1,"simulator uses actual position");
  assert.equal(evaluator.selected.get(skillId(s))?.score,35.7);
 }
}
console.log("Nov 18: 30 scores, comparison labels, position/country thresholds, missing data, deck round-trip, rank payload, training fallback, tactics and official WBC simulator pools passed.");
