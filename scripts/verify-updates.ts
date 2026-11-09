import { blankPlayer, DEFAULT_CHEM, LINEUP, type Deck } from "../src/lib/deck";
import { calcDeckTotal, deckPlayerResults, flagDefaults, skillScore } from "../src/lib/engine";
import { applyDeckUpdate } from "../src/lib/playerUpdates";
import { syncLinks, rankArgs, deckSig, loadLinks } from "../src/lib/rankSync";
import { validDeckName, validDeckPassword } from "../src/lib/deckPassword";
import { parseDeckFile, withRank } from "../src/lib/deckFile";
let pass=0,fail=0;
const check=(name:string,ok:boolean)=>{if(ok)pass++;else{fail++;console.log("FAIL:",name);}};
const near=(a:number,b:number)=>Math.abs(a-b)<1e-8;
const tables={overrides:{},customs:[]};
const flags=Object.fromEntries(Object.keys(flagDefaults()).map(k=>[k,false]));
const deck:Deck={id:"d",name:"검증 덱",updatedAt:1,players:LINEUP.map(l=>blankPlayer(l.row,l.kind,l.pos,l.order)),chem:{...DEFAULT_CHEM},flags,yearInputs:{}};
deck.players[0]={...deck.players[0],name:"타자",card:"시그니처 블랙",year:2026,finalOv:[100,100,100]};
const edit=(field:Partial<Deck["players"][number]>)=>applyDeckUpdate(deck,{players:deck.players.map((p,i)=>i===0?{...p,...field}:p)},tables);
check("training redistribution updates entered finals",edit({train:[3,-2,1]}).players[0].finalOv.join()==="103,98,101");
check("enhancement table updates entered finals",edit({enhLv:1}).players[0].finalOv.join()==="100,101,100");
check("direct final edit is not overwritten",edit({finalOv:[111,112,113]}).players[0].finalOv.join()==="111,112,113");
const team=applyDeckUpdate(deck,{flags:{...flags,"10-team-L":true}},tables);
check("team 200 power +3 reaches entered final",team.players[0].finalOv[0]===103);
check("team 200 applies all three batter stats",team.players[0].finalOv.join()==="103,103,103");
check("team selection changes final deck score",near(calcDeckTotal(team,tables).total-calcDeckTotal(deck,tables).total,36));
const off=applyDeckUpdate(team,{flags},tables);
check("deselecting team score restores original total",off.players[0].finalOv.join()==="100,100,100"&&near(calcDeckTotal(off,tables).total,calcDeckTotal(deck,tables).total));
const year=applyDeckUpdate(deck,{flags:{...flags,"33-spec-L":true},yearInputs:{33:2020}},tables);
check("special 615 year criterion changes correct stat",year.players[0].finalOv[1]===101);
check("special year outside 0-9 is excluded",applyDeckUpdate(deck,{flags:{...flags,"33-spec-L":true},yearInputs:{33:2016}},tables).players[0].finalOv[1]===100);
const now=deckPlayerResults(deck,tables)[0];
const comeback=deckPlayerResults({...deck,chem:{...deck.chem,comebackFlag:"S2"}},tables)[0];
check("comeback team power/contact +4 is +8",near(comeback.total-now.total,8));
const pDeck={...deck,players:deck.players.map((p,i)=>i===9?{...p,name:"투수"}:p)};
const lock=deckPlayerResults({...pDeck,chem:{...deck.chem,lockdown:"O"}},tables);
check("lockdown CP placement team effect is +1.6",near(lock[9].total-deckPlayerResults(pDeck,tables)[9].total,1.6));
const caster={...pDeck,players:pDeck.players.map((p,i)=>i===17?{...p,name:"마무리",skills:["[S0] 락다운","","",""] as typeof p.skills}:p)};
check("lockdown owner is not double counted",near(deckPlayerResults({...caster,chem:{...caster.chem,lockdown:"O"}},tables)[17].total,deckPlayerResults(caster,tables)[17].total));
// 공식 스킬 설명의 스탯 수치로 독립 역산: 랭킹대전 공격(원정), 비평가 스탯 제외.
for(const [kind,name,score] of [
 ["batter","[S0] 키플레이어",6*(1.1+0.9+0.4)],
 ["pitcher","[S0] 키플레이어",6*(1.15+1.2)],
 ["batter","[S0] FREE AGENT",5*2.4+5*2.35],
 ["pitcher","[S0] FREE AGENT",5*2.35+5*(1.1+0.9)],
 ["pitcher","[S0] 스탠드 아웃(중계, 마무리)",12*2.35],
 ["pitcher","[S0] 락다운",7*2.4+2*2.4/3],
] as const)check("existing skill calibration: "+kind+name,near(skillScore(kind,name,tables)!,score));
for(const [i,b] of [14,16,18,20,22].entries())check("new decay average S"+i,near(skillScore("pitcher",`[S${i}] 신속한 처리 (중계, 3아웃 평균)`,tables)!,(b-1)*2.35));
for(const [i,b,extra,lead,comeback] of [[0,4,11,8,6],[1,6,13,10,8],[2,9,16,13,11]]){
 check("new leverage S"+i,near(skillScore("pitcher",`[S${i}] 레버리지 릴리퍼 (중계, 첫 3아웃 O)`,tables)!,b*2.4+extra*2));
 check("new victory S"+i,near(skillScore("pitcher",`[S${i}] 승리 공식 (중계, 동점·리드 O)`,tables)!,b*2.35+lead*2.4));
 check("new comeback S"+i,near(skillScore("pitcher",`[S${i}] 컴백 플래그 (중계, 동점·열세 O, 팀버프 X)`,tables)!,(b+comeback)*2.35));
 check("new leverage inactive S"+i,near(skillScore("pitcher",`[S${i}] 레버리지 릴리퍼 (중계, 첫 3아웃 X)`,tables)!,b*2.4));
 check("new victory inactive S"+i,near(skillScore("pitcher",`[S${i}] 승리 공식 (중계, 동점·리드 X)`,tables)!,b*2.35));
 check("new comeback inactive S"+i,near(skillScore("pitcher",`[S${i}] 컴백 플래그 (중계, 동점·열세 X, 팀버프 X)`,tables)!,b*2.35));
}
for(const [kind,own,opponent] of [["batter",2.4,2.35],["pitcher",2.35,2.4]] as const){
 check("WAR leader "+kind,near(skillScore(kind,"[S0] WAR 리더",tables)!,9*own+6*opponent));
 check("2026 trio excludes league-only bonus "+kind,near(skillScore(kind,"[S0] 2026 퍼포머트리오 (랭대기준)",tables)!,10*own));
}
for(const grade of ["S","S1"])check("comeback team "+grade,near(deckPlayerResults({...deck,chem:{...deck.chem,comebackFlag:grade}},tables)[0].total-now.total,6));
check("name required",!validDeckName("")&&!validDeckName("   ")&&validDeckName("내 덱"));
for (const pin of ["0000", "0123", "1234", "9999"]) check("four digit PIN accepted: " + pin, validDeckPassword(pin));
for (const pin of ["", "123", "12345", "12a4", " 123", "1234 ", "１２３４", "١٢٣٤", "1234\n", "valid-password"]) check("invalid PIN rejected: " + JSON.stringify(pin), !validDeckPassword(pin));
(async()=>{
 const publishingDeck={...deck,players:deck.players.map((p,i)=>({...p,name:p.name || `선수 ${i}`}))};
 const links={r:{deckId:deck.id,token:"session",password:true as const,sig:"old"}};
 const calls:{fn:string,args:Record<string,unknown>}[]=[];
 const synced=await syncLinks({decks:[publishingDeck],tables,links,rpc:async(fn,args)=>{calls.push({fn,args});return{data:true,error:null};}});
 check("password edit uses authenticated session RPC",calls[0].fn==="update_ranking_password"&&calls[0].args.p_token==="session"&&!("p_password" in calls[0].args)&&synced.pushed===1);
 check("sig represents latest payload",synced.links.r.sig===deckSig(rankArgs(publishingDeck,tables).args));
 calls.length=0;await syncLinks({decks:[{...deck,name:" "}],tables,links,rpc:async(fn,args)=>{calls.push({fn,args});return{data:true,error:null};}});
 check("unnamed deck never syncs",calls.length===0);
 const restored=parseDeckFile(withRank(deck,links))[0];check("file roundtrip preserves password-session kind",restored.rank?.password===true&&restored.rank?.token==="session"&&!JSON.stringify(restored.deck).includes("session"));
 (globalThis as {localStorage?:unknown}).localStorage={getItem:()=>JSON.stringify(links)};
 check("saved password link reloads correctly",loadLinks().r.password===true);
 console.log(`pass=${pass} fail=${fail}`);process.exit(fail?1:0);
})();
