const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const {createEventTestDb}=require('./event-test-db.cjs');

(async()=>{
  const {db,users,rpc}=await createEventTestDb();
  const sql=fs.readFileSync(__dirname+'/supabase_mig_site_usage.sql','utf8');
  try {
    await db.exec(sql);
    const password=randomBytes(32).toString('hex');
    await db.query('insert into sim_event_operator_credentials values($1,public._ranking_hash($2))',[users.admin.id,password]);
    const {token}=await rpc('event_operator_login',{p_password:password});
    async function asAnon(statement,args=[]) {
      await db.exec('begin;set local role anon');
      try {const out=await db.query(statement,args);await db.exec('commit');return out.rows[0];}
      catch(error){await db.exec('rollback');throw error;}
    }
    const report=async(session=token,days=7)=>(await asAnon('select event_operator_usage($1,$2) as r',[session,days])).r;
    const visitor=randomUUID(), view=randomUUID();
    const send=(id,site,page,seq,seconds,active=true)=>asAnon('select record_site_usage($1,$2,$3,$4,$5,$6,$7)',[id,visitor,site,page,seq,seconds,active]);
    assert.equal((await report()).sites.length,3);
    await send(view,'service','ranking',1,0);
    await send(view,'service','ranking',3,20,false);
    await send(view,'service','ranking',2,10);
    await send(view,'service','ranking',3,20,false);
    await send(view,'demo','ranking',4,25);
    const first=await report();
    assert.deepEqual(first.sites.find(r=>r.site==='service'),{site:'service',online:0,visitors:1,views:1,seconds:20});
    await send(randomUUID(),'service','lineup',1,0);
    await send(randomUUID(),'service','rivals-series',1,0);
    await send(randomUUID(),'demo','rivals-series',1,0);
    await send(randomUUID(),'admin','admin-event',1,0);
    await assert.rejects(send(randomUUID(),'admin','lineup',1,0),/invalid_usage/);
    await assert.rejects(send(randomUUID(),'demo','arbitrary personal value',1,0),/invalid_usage/);
    await assert.rejects(report(null),/session_expired/);
    await assert.rejects(asAnon('select * from site_usage_views'),/permission denied/);
    const now=await report();
    assert.deepEqual(now.sites.map(r=>r.online),[1,1,1]);
    assert.equal(now.pages.find(x=>x.page==='ranking').seconds,20);
    await db.query("update site_usage_views set last_seen=now()-interval '91 seconds' where active");
    const old=await report();
    assert.ok(old.sites.every(row=>row.online===0));
    await db.query("update site_usage_views set opened_at=((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul') - interval '1 second' where site='admin'");
    assert.equal((await report(token,1)).sites.find(r=>r.site==='admin').views,0);
    assert.equal((await report(token,7)).sites.find(r=>r.site==='admin').views,1);
    await db.exec(sql);
    await rpc('event_operator_logout',{p_session:token});
    await assert.rejects(report(),/session_expired/);
    console.log('Usage aggregation, categories, KST periods, heartbeat ordering, unique browsers, stale presence and operator access passed.');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
