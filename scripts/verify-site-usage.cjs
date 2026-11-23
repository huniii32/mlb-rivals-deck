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
    assert.deepEqual(first.sites.find(r=>r.site==='service'),{site:'service',online:0,returning_browsers:0,visitors:1,views:1,seconds:20});
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
    // All dates are relative to midnight in Seoul, independent of the test runner's timezone.
    const a=randomUUID(), b=randomUUID();
    async function sample(browser,daysAgo,clock,seconds,site='service') {
      await db.query(`insert into site_usage_views(view_id,browser_id,site,page,opened_at,seq,seconds,active)
        values($1,$2,$3,'ranking',(((now() at time zone 'Asia/Seoul')::date - $4::int) + $5::time)
          at time zone 'Asia/Seoul',1,$6,false)`,[randomUUID(),browser,site,daysAgo,clock,seconds]);
    }
    await sample(a,2,'23:59',150);
    await sample(a,1,'23:05',10);
    await sample(a,1,'00:00',20);
    await sample(b,1,'23:10',0);
    await sample(b,1,'23:11',5);
    await sample(b,8,'23:11',5);
    await sample(a,2,'23:59',50,'demo');
    const weekly=await report();
    const hourly=weekly.hourly.filter(r=>r.site==='service');
    const prior=now.hourly.find(r=>r.site==='service' && r.hour===23);
    const peak=hourly.find(r=>r.hour===23);
    assert.deepEqual(peak,{site:'service',hour:23,views:4+(prior?.views??0),seconds:165+(prior?.seconds??0),visitors:2+(prior?.visitors??0)});
    const midnight=hourly.find(r=>r.hour===0);
    assert.equal(midnight.seconds,20+(now.hourly.find(r=>r.site==='service' && r.hour===0)?.seconds??0));
    assert.equal(weekly.sites.find(r=>r.site==='service').returning_browsers,1);
    assert.equal(weekly.sites.find(r=>r.site==='demo').returning_browsers,0);
    assert.equal((await report(token,30)).sites.find(r=>r.site==='service').returning_browsers,2);
    const today=await report(token,1);
    assert.equal(today.sites.find(r=>r.site==='service').returning_browsers,0);
    assert.deepEqual(today.hourly.filter(r=>r.site==='service'),now.hourly.filter(r=>r.site==='service'));
    for(const total of weekly.sites) {
      const buckets=weekly.hourly.filter(r=>r.site===total.site);
      for(const key of ['views','seconds']) assert.equal(buckets.reduce((sum,r)=>sum+r[key],0),total[key]);
    }
    await db.exec(sql);
    assert.deepEqual((await report()).hourly,weekly.hourly);
    await rpc('event_operator_logout',{p_session:token});
    await assert.rejects(report(),/session_expired/);
    console.log('Usage aggregation, categories, KST periods, heartbeat ordering, unique browsers, stale presence and operator access passed.');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
