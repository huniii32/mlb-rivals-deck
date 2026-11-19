// Uses only a local SQL pilot with fake accounts. Never send real winners test prizes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const api=process.env.WINNER_TEST_API||'http://localhost:8796',base=process.env.WINNER_TEST_WEB||'http://localhost:5196';
for(const url of [api,base])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
async function rpc(name,args){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
(async()=>{
 const {users}=await(await fetch(api+'/pilot/config')).json();const login=await rpc('event_operator_login',{p_password:'a'.repeat(64)});
 const operator={p_session:login.token,p_event:'local-pilot'};
 let state=await rpc('event_operator_get',operator);
 if(state.event.phase==='open'){
  for(const user of [users.alice,users.bob]){
   const auth={p_event:'local-pilot',p_ranking_id:user.rank,p_token:user.token};const joined=await rpc('event_join',auth);
   for(let i=joined.me.attempts.length;i<5;i++)await rpc('event_attempt',{...auth,p_request_id:randomUUID()});
   await rpc('event_claim',{...auth,p_mission:'deck'});
  }
  state=await rpc('event_operator_action',{...operator,p_action:'close'});
 }
 if(state.event.phase==='closed')state=await rpc('event_operator_action',{...operator,p_action:'draw'});
 assert.ok(state.event.champion_id&&state.event.winner_id);
 const recipients=await rpc('mailbox_operator_recipients',{...operator,p_query:'',p_offset:0});
 const champion=recipients.find(r=>r.award==='스킬 점수 1위'),winner=recipients.find(r=>r.award==='응모권 추첨 당첨자');
 assert.ok(champion&&winner);assert.notEqual(champion.id,winner.id);
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await b.newContext({viewport:{width:1366,height:1000}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const host=new URL(r.request().url()).hostname;return host&&!['localhost','127.0.0.1'].includes(host)?r.abort():r.continue()});
  await p.goto(base+'/demo/event-pilot.html');await p.getByRole('button',{name:'테스트 운영자로 시작'}).click();
  await p.getByRole('button',{name:'점수 1위 · 쪽지 보내기',exact:true}).click();
  const chooser=p.getByRole('region',{name:'당첨자 쪽지 보내기'});
  await p.getByRole('heading',{name:'받는 덱: '+champion.deck_name,exact:true}).waitFor();
  assert.equal(await p.getByLabel('받는 덱 선택').inputValue(),champion.id);
  assert.ok((await chooser.innerText()).includes(winner.deck_name));
  await p.getByRole('button',{name:'당첨 안내문 채우기',exact:true}).click();
  assert.ok((await p.getByLabel('쪽지 내용',{exact:true}).inputValue()).includes(champion.deck_name));
  await p.waitForFunction(()=>document.querySelector('.private-messages select')?.disabled);
  assert.equal(await p.getByLabel('받는 덱 선택').isDisabled(),true);
  const title='WINNER DELIVERY TEST '+Date.now();await p.getByLabel('쪽지 제목',{exact:true}).fill(title);
  const image=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#edf4ef';x.fillRect(0,0,400,200);x.fillStyle='#173b35';x.font='24px sans-serif';x.fillText('TEST ONLY - NOT A COUPON',10,100);return c.toDataURL('image/png').split(',')[1]});
  await p.getByLabel('기프티콘 이미지 (선택)').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await p.getByAltText('쪽지에 첨부된 이미지').waitFor();
  await p.getByRole('button',{name:'전송 내용 확인',exact:true}).click();
  const confirmation=p.getByRole('region',{name:'전송 전 확인'});await confirmation.waitFor();assert.ok((await confirmation.innerText()).includes(champion.deck_name));
  await p.getByRole('button',{name:'다시 편집',exact:true}).click();assert.equal(await p.getByLabel('받는 덱 선택').isDisabled(),true,'editing must keep recipient locked');
  await p.getByRole('button',{name:'전송 내용 확인',exact:true}).click();await p.getByRole('button',{name:'이 덱에 쪽지 보내기',exact:true}).click();await p.getByRole('status').filter({hasText:'쪽지를 보냈습니다'}).waitFor();
  const owner=Object.values(users).find(u=>u.rank===champion.id),other=Object.values(users).find(u=>u.rank===winner.id);
  const list=await rpc('mailbox_list',{p_ranking_id:owner.rank,p_token:owner.token,p_offset:0});const sent=list.find(m=>m.subject===title);assert.ok(sent?.has_image);
  assert.equal((await rpc('mailbox_list',{p_ranking_id:other.rank,p_token:other.token,p_offset:0})).some(m=>m.id===sent.id),false);
  const received=await rpc('mailbox_read',{p_ranking_id:owner.rank,p_token:owner.token,p_id:sent.id});assert.equal(received.image_base64.replace(/\s/g,''),image);
  await p.getByRole('button',{name:'보낸 내역 새로고침',exact:true}).click();const sentRow=p.locator('.private-message-list button').filter({hasText:title});await sentRow.filter({hasText:/읽음/}).waitFor();assert.match(await sentRow.innerText(),/읽음/);
  const after=await rpc('event_operator_get',operator);assert.equal(after.event.champion_delivered_at,state.event.champion_delivered_at);assert.equal(after.event.winner_delivered_at,state.event.winner_delivered_at);
  await chooser.getByRole('article',{name:'응모권 추첨 당첨자',exact:true}).getByRole('button').click();await p.getByRole('heading',{name:'받는 덱: '+winner.deck_name,exact:true}).waitFor();assert.equal(await p.getByLabel('받는 덱 선택').inputValue(),winner.id);
  for(const width of [1366,390,320]){await p.setViewportSize({width,height:1000});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  fs.mkdirSync('/workspace/artifacts/winner-mailbox',{recursive:true});await p.screenshot({path:'/workspace/artifacts/winner-mailbox/mobile.png',fullPage:true});
  await p.setViewportSize({width:1366,height:1000});await p.screenshot({path:'/workspace/artifacts/winner-mailbox/desktop.png',fullPage:true});
  await p.getByRole('button',{name:'로그아웃',exact:true}).click();await p.getByRole('heading',{name:'관리자 로그인'}).waitFor();assert.equal(await chooser.count(),0);assert.deepEqual(errors,[]);
  console.log('Winner mailbox PASS: authoritative recipients, event winner shortcut, draft recipient lock, template, image confirmation/send, owner-only read, read receipt, unchanged prize status, 320/390/1366px and logout.');
 }finally{await b.close();await rpc('event_operator_logout',{p_session:login.token});}
})().catch(e=>{console.error(e);process.exit(1)});
