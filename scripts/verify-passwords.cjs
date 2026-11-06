const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
let pass=0;function check(name,ok){if(!ok)throw Error(name);pass++;}
(async()=>{const db=new PGlite({extensions:{pgcrypto}});const sql=name=>fs.readFileSync(path.join(__dirname,name),'utf8');try{
 await db.exec('create role anon; create role authenticated;');
 for(const f of ['supabase_schema.sql','supabase_mig_ranking_delete.sql','supabase_mig_rate_limit.sql','supabase_mig_inquiry_admin.sql','supabase_mig_owner_codes.sql','supabase_mig_ranking_upsert.sql','supabase_mig_bullpen.sql','supabase_mig_deck_passwords.sql'])await db.exec(sql(f));
 const payload={id:'test-deck',name:'첫 번째 덱',players:Array.from({length:21},()=>({name:'P'})),password:'must-not-be-public',rank:{token:'must-not-be-public'}};
 const create=(client,local,name='첫 번째 덱',password='0123')=>db.query('select public.create_ranking_password($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as r',[client,local,password,name,100,100,100,100,21,JSON.stringify(payload)]).then(r=>r.rows[0].r);
 const call=(fn,types,values)=>db.query(`select public.${fn}(${types.map((t,i)=>'$'+(i+1)+'::'+t).join(',')}) as r`,values).then(r=>r.rows[0].r);
 await db.exec('set role anon');
 const created=await create('client1','local1');check('create under anonymous API role',typeof created.id==='string'&&created.token.length===64);
 const again=await create('client1','local1');check('retry creates no duplicate ranking',again.id===created.id);
 const wrong=await call('restore_ranking_password',['uuid','text'],[created.id,'9876']);check('wrong password gives no deck or token',wrong.error==='invalid_password'&&!wrong.deck&&!wrong.token);
 const restored=await call('restore_ranking_password',['uuid','text'],[created.id,'0123']);check('correct password restores original row',restored.id===created.id&&restored.deck.players.length===21);
 check('devices receive independent sessions',restored.token!==created.token);
 const update=(token,name)=>call('update_ranking_password',['uuid','text','text','float8','float8','float8','float8','int','jsonb'],[created.id,token,name,120,110,100,130,21,JSON.stringify(payload)]);
 check('phone session still works after laptop restore',await update(created.token,'휴대폰 수정'));
 check('laptop session updates same ranking',await update(restored.token,'노트북 수정'));
 check('wrong edit token cannot update',!(await update('invalid-token','잘못된 수정')));
 let denied=false;try{await db.query('select * from public.ranking_passwords');}catch(e){denied=e.message.includes('permission denied');}check('password hashes cannot be read by anon',denied);
 denied=false;try{await db.query('select * from public.ranking_password_sessions');}catch(e){denied=e.message.includes('permission denied');}check('edit session hashes cannot be read by anon',denied);
 denied=false;try{await db.query("insert into public.rankings(deck_name,total) values('bypass',1)");}catch(e){denied=e.message.includes('permission denied');}check('direct unauthenticated insert blocked',denied);
 denied=false;try{await db.query('select public._ranking_password_digest($1)', ['attempt']);}catch(e){denied=e.message.includes('permission denied');}check('private password helpers not callable',denied);
 let invalid=false;try{await create('invalid','invalid','   ');}catch(e){invalid=e.message.includes('name_required');}check('empty name rejected on server',invalid);
 for (const pin of [null, '', '123', '12345', '12a4', ' 123', '1234 ', '１２３４', '١٢٣٤', '1234\n', 'long-password']) {
  invalid=false;try{await create('invalid','invalid','정상 이름',pin);}catch(e){invalid=e.message.includes('password_length');}
  check('invalid PIN rejected on server: '+JSON.stringify(pin),invalid);
 }
 const lostZero=await call('restore_ranking_password',['uuid','text'],[created.id,'123']);
 check('leading zero is required for restore',lostZero.error==='invalid_password');
 await db.exec('reset role');
 const stored=(await db.query('select password_hash from public.ranking_passwords where ranking_id=$1',[created.id])).rows[0].password_hash;
 check('password stored as bcrypt hash',stored.startsWith('$2')&&stored!=='0123');
 const publicDeck=(await db.query('select deck_json from public.rankings where id=$1',[created.id])).rows[0].deck_json;
 check('password and rank token stripped from public payload',!('password' in publicDeck)&&!('rank' in publicDeck));
 check('one ranking despite repeated save',Number((await db.query('select count(*) as n from public.rankings')).rows[0].n)===1);
 await db.exec('set role anon');
 for(let i=0;i<10;i++)await call('restore_ranking_password',['uuid','text'],[created.id,'9999']);
 check('failed attempts persist and rate limit', (await call('restore_ranking_password',['uuid','text'],[created.id,'0123'])).error==='rate_limited');
 await db.exec('reset role');
 check('ten failed attempts recorded', (await db.query('select attempts from public.ranking_password_attempts where ranking_id=$1',[created.id])).rows[0].attempts===10);
 await db.query("update public.ranking_password_attempts set started_at=now()-interval '2 minutes' where ranking_id=$1",[created.id]);
 check('valid restore works after retry window',!!(await call('restore_ranking_password',['uuid','text'],[created.id,'0123'])).deck);
 // 이전 버전에서 저장한 긴 비밀번호와 기기 토큰도 재적용 후 계속 사용할 수 있어야 한다.
 await db.query('update public.ranking_passwords set password_hash=public._ranking_password_digest($1) where ranking_id=$2',['previous-password',created.id]);
 await db.exec(sql('supabase_mig_deck_passwords.sql'));
 check('legacy password still restores after migration',!!(await call('restore_ranking_password',['uuid','text'],[created.id,'previous-password'])).deck);
 check('existing device session survives migration',await update(created.token,'기존 기기'));
 check('migration rerun preserves existing ranking' ,Number((await db.query('select count(*) as n from public.rankings')).rows[0].n)===1);
 await db.exec(sql('supabase_reset_rankings_20261105.sql'));
 check('reset clears public ranking',Number((await db.query('select count(*) as n from public.rankings')).rows[0].n)===0);
 check('reset archives original ranking',Number((await db.query('select count(*) as n from ranking_reset_archive.rankings_20261105')).rows[0].n)===1);
 check('reset cascades edit sessions',Number((await db.query('select count(*) as n from public.ranking_password_sessions')).rows[0].n)===0);
 const fresh=await create('client2','local2','새 시즌 덱');check('new registration works after reset',!!fresh.id);
 await db.exec(sql('supabase_reset_rankings_20261105.sql'));check('repeated reset preserves newly registered decks',Number((await db.query('select count(*) as n from public.rankings')).rows[0].n)===1);
 await db.exec('set role anon');denied=false;try{await db.query('select * from ranking_reset_archive.rankings_20261105');}catch(e){denied=e.message.includes('permission denied');}check('archive is private',denied);
 console.log(`SQL pass=${pass} fail=0`);
 }finally{await db.close();}})().catch(e=>{console.error('SQL FAIL:',e.message);process.exitCode=1;});
