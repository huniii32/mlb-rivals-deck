const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const { createEventTestDb } = require('./event-test-db.cjs');
(async () => {
 const { db, users, rpc } = await createEventTestDb();
 try {
  const password = randomBytes(32).toString('hex');
  await db.query('insert into sim_event_operator_credentials values($1,public._ranking_hash($2))', [users.admin.id,password]);
  const {token} = await rpc('event_operator_login',{p_password:password});
  const a={p_ranking_id:users.alice.rank,p_token:users.alice.token};
  const b={p_ranking_id:users.bob.rank,p_token:users.bob.token};
  const img='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V0AAAAASUVORK5CYII=';
  const send={p_session:token,p_ranking_id:users.alice.rank,p_request_id:randomUUID(),p_subject:'당첨 안내',p_body:'<script>alert(1)</script>\n테스트 기프티콘',p_image_mime:'image/png',p_image_base64:img};
  await assert.rejects(rpc('mailbox_operator_send',{...send,p_session:users.alice.token}),/session_expired/);
  const result=await rpc('mailbox_operator_send',send);
  assert.equal(result.has_image,true); assert.equal(result.read_at,null); assert.equal(result.image_base64,undefined);
  assert.equal((await rpc('mailbox_operator_send',send)).id,result.id,'retry is idempotent');
  await assert.rejects(rpc('mailbox_operator_send',{...send,p_body:'changed'}),/request_conflict/);
  assert.equal((await db.query('select count(*)::int n from deck_private_messages')).rows[0].n,1);
  const list=await rpc('mailbox_list',{...a,p_offset:0});assert.equal(list.length,1);assert.equal(list[0].body,undefined);
  assert.deepEqual(await rpc('mailbox_list',{...b,p_offset:0}),[]);
  await assert.rejects(rpc('mailbox_list',{...a,p_token:b.p_token,p_offset:0}),/owner_required/);
  await assert.rejects(rpc('mailbox_read',{...b,p_id:result.id}),/message_unavailable/);
  const adminView=await rpc('mailbox_operator_read',{p_session:token,p_id:result.id});assert.equal(adminView.read_at,null,'operator preview must not mark recipient read');
  const opened=await rpc('mailbox_read',{...a,p_id:result.id});assert.ok(opened.read_at);assert.equal(opened.body,send.p_body);
  assert.equal(opened.image_base64.replace(/\s/g,''),img);
  assert.equal((await rpc('mailbox_read',{...a,p_id:result.id})).read_at,opened.read_at,'first read retained');
  assert.equal((await rpc('mailbox_operator_list',{p_session:token,p_ranking_id:a.p_ranking_id,p_offset:0}))[0].read_at,opened.read_at);
  for(const bad of [
    {p_image_mime:'image/svg+xml',p_image_base64:Buffer.from('<svg></svg>').toString('base64')},
    {p_image_mime:'image/png',p_image_base64:Buffer.from('<html>no image</html>').toString('base64')},
    {p_image_base64:'!'},{p_image_base64:Buffer.alloc(2097153).toString('base64')},
    {p_image_mime:null},{p_image_base64:null}
  ]) await assert.rejects(rpc('mailbox_operator_send',{...send,p_request_id:randomUUID(),...bad}),/invalid_image/);
  await assert.rejects(rpc('mailbox_operator_send',{...send,p_request_id:randomUUID(),p_subject:' '}),/invalid_message/);
  await assert.rejects(rpc('mailbox_operator_send',{...send,p_request_id:randomUUID(),p_ranking_id:randomUUID()}),/recipient_unavailable/);
  const plain=await rpc('mailbox_operator_send',{...send,p_request_id:randomUUID(),p_ranking_id:b.p_ranking_id,p_image_mime:null,p_image_base64:null});assert.equal(plain.has_image,false);
  await rpc('event_join',{p_event:'local-pilot',...a});
  await db.query("update sim_events set champion_id=(select id from sim_event_participants where ranking_id=$1) where id='local-pilot'",[a.p_ranking_id]);
  const awarded=await rpc('mailbox_operator_recipients',{p_session:token,p_event:'local-pilot',p_query:'다저스',p_offset:0});assert.equal(awarded[0].award,'스킬 점수 1위');
  const recipients=await rpc('mailbox_operator_recipients',{p_session:token,p_event:'local-pilot',p_query:'양키스',p_offset:0});assert.equal(recipients.length,1);assert.equal(recipients[0].id,b.p_ranking_id);
  // Permissions are enforced even when bypassing the app and calling SQL directly.
  for(const role of ['anon','authenticated']) for(const sql of ['select * from deck_private_messages','select public._mailbox_owner(null,null)','select public._mailbox_json(null,false)',"insert into deck_private_messages(subject) values('bad')",'delete from deck_private_messages']) {
    await db.exec(`begin;set local role ${role}`);
    try {await assert.rejects(db.query(sql),/permission denied/);} finally {await db.exec('rollback');}
  }
  await db.exec(fs.readFileSync(__dirname+'/supabase_mig_private_messages.sql','utf8'));
  assert.equal((await rpc('mailbox_list',{...a,p_offset:0})).length,1,'reapply preserves data');
  assert.deepEqual(await rpc('mailbox_list',{...a,p_offset:50}),[]);
  await db.query('delete from ranking_password_sessions where ranking_id=$1',[a.p_ranking_id]);
  await assert.rejects(rpc('mailbox_read',{...a,p_id:result.id}),/owner_required/);
  await rpc('event_operator_logout',{p_session:token});
  for(const name of ['mailbox_operator_send','mailbox_operator_list','mailbox_operator_read','mailbox_operator_recipients']) {
    const args=name.endsWith('_send')?send:name.endsWith('_list')?{p_session:token,p_ranking_id:a.p_ranking_id,p_offset:0}:name.endsWith('_read')?{p_session:token,p_id:result.id}:{p_session:token,p_event:'local-pilot',p_query:'',p_offset:0};
    await assert.rejects(rpc(name,args),/session_expired/);
  }
  const next=await rpc('event_operator_login',{p_password:password});
  await db.exec("update sim_event_operator_sessions set expires_at=now()-interval '1 minute'");
  await assert.rejects(rpc('mailbox_operator_send',{...send,p_session:next.token}),/session_expired/);
  console.log('Private inbox SQL: operator-only send, own-deck reads, private image ACL, retry deduplication, first read receipts, invalid/oversize image rejection, pagination, migration reapply, revoked and expired credentials passed.');
 } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
