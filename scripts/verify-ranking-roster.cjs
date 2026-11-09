const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEventTestDb } = require("./event-test-db.cjs");
const positions = ["C","1B","2B","3B","SS","LF","CF","RF","DH","SP1","SP2","SP3","SP4","SP5","RP1","RP2","RP3","CP1"];
const rows = [11,12,13,14,15,16,17,18,19,22,23,24,25,26,27,28,29,30];
const full = {id:"full",name:"Roster test",players:rows.map((excelRow,i)=>({excelRow,pos:positions[i],kind:i<9?"batter":"pitcher",name:`Player ${i}`}))};
const missing = i => ({...full,players:full.players.map((p,n)=>n===i?{...p,name:" \n\t ﻿　"}:p)});
(async()=>{
 const {db,users}=await createEventTestDb();
 const one=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
 const migration=fs.readFileSync(path.join(__dirname,"supabase_mig_ranking_roster.sql"),"utf8");
 const save=(deck,name="Roster test",client="roster-browser",named=18)=>one("select save_ranking_password($1,'full','1234',$2,100,100,100,100,$3,$4)",[client,name,named,deck]);
 const update=(id,token,deck)=>one("select update_ranking_password($1,$2,'Roster test',999,999,999,999,21,$3)",[id,token,deck]);
 try{
  const historical=await one("select count(*)::int from rankings");
  const legacy=await one("select insert_ranking('legacy-roster','Legacy roster',100,1,1,1,18,$1,'legacy-test-secret')",[full]);
  const code=await one("select create_owner('owner-roster')");
  const owned=await one("select insert_ranking_owned('owner-roster',$1,'Owned roster',100,1,1,1,18,$2)",[code,full]);
  await db.exec(migration);
  assert.equal(await one("select count(*)::int from rankings"),historical+2,"existing incomplete decks retained");
  await db.exec("set role anon");
  const valid=await save(full);
  assert.ok(valid.id && valid.token);
  for(const index of [0,9,14,17]){
   await assert.rejects(save(missing(index)),/ranking_roster_incomplete/);
   await assert.rejects(update(valid.id,valid.token,missing(index)),/ranking_roster_incomplete/);
  }
  const restored=await one("select restore_ranking_password($1,'1234')",[users.alice.rank]);
  assert.ok(restored.token,"an incomplete old deck can still be restored to finish editing");
  await assert.rejects(one("select update_ranking($1,'legacy-test-secret','Legacy roster',999,1,1,1,21,$2)",[legacy,missing(0)]),/ranking_roster_incomplete/);
  await assert.rejects(one("select update_ranking_owned($1,$2,'Owned roster',999,1,1,1,21,$3)",[owned,code,missing(17)]),/ranking_roster_incomplete/);
  // Old registration endpoints are already revoked for public clients; the trigger
  // also validates them when invoked by a privileged maintenance caller.
  await assert.rejects(one("select insert_ranking('new-legacy','Bad legacy',1,1,1,1,21,$1,'new-secret')",[missing(9)]),/permission denied/);
  await db.exec("reset role");
  await assert.rejects(one("select insert_ranking('new-legacy','Bad legacy',1,1,1,1,21,$1,'new-secret')",[missing(9)]),/ranking_roster_incomplete/);
  await assert.rejects(one("select insert_ranking_owned('new-owner',$1,'Bad owner',1,1,1,1,21,$2)",[code,missing(14)]),/ranking_roster_incomplete/);
  assert.equal(await one("select total from rankings where id=$1",[valid.id]),100,"failed update preserves published score");
  assert.equal(await one("select deck_json from rankings where id=$1",[legacy]).then(d=>d.players.length),18);
  // Client count cannot substitute for actual roster validation or inflate displayed count.
  const direct=await one("insert into rankings(deck_name,total,named,deck_json) values('Direct valid',100,21,$1) returning named",[full]);
  assert.equal(direct,18);
  await assert.rejects(db.query("insert into rankings(deck_name,total,named,deck_json) values('Fake count',100,21,$1)",[missing(17)]),/ranking_roster_incomplete/);
  for(const deck of [
    {...full,players:[...full.players.slice(0,-1),full.players[14]]},
    {...full,players:full.players.map((p,i)=>i===0?{...p,kind:"pitcher"}:p)},
    {...full,players:full.players.map((p,i)=>i===17?{...p,bullpenRole:"invalid"}:p)},
  ]) await assert.rejects(one("select public._ranking_validate_roster($1)",[deck]),/ranking_roster_invalid/);
  const moved={...full,players:full.players.map(p=>p.excelRow===30?{...p,bullpenRole:"winning"}:p.excelRow===27?{...p,bullpenRole:"closer"}:p)};
  assert.equal(await one("select public._ranking_validate_roster($1)",[moved]),18);
  await assert.rejects(one("select public._ranking_validate_roster($1)",[{...full,players:full.players.map(p=>p.excelRow===30?{...p,bullpenRole:"winning"}:p)}]),/ranking_roster_incomplete/);
  const expanded={...full,players:[...full.players,...[31,32,33].map(excelRow=>({excelRow,kind:"pitcher",pos:"RP4",name:""}))]};
  assert.equal(await one("select public._ranking_validate_roster($1)",[expanded]),18,"empty optional bullpen slots allowed");
  await db.exec("set role anon");
  assert.equal(await update(valid.id,valid.token,full),true,"completing roster resumes updates");
  await db.exec("reset role");
  const before=await one("select count(*)::int from rankings");
  await db.exec(migration);
  assert.equal(await one("select count(*)::int from rankings"),before,"reapplying keeps all rows");
  await assert.rejects(db.query("update rankings set total=999 where id=$1",[users.alice.rank]),/ranking_roster_invalid/);
  console.log("Roster SQL: all role minimums, all registration/update RPC paths, direct-write guard, derived counts, legacy restore, published-data preservation and migration replay passed.");
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
