// Real local SQL, fake users only. Start the pilot on 8795/5195; no production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const base=process.env.INBOX_ALERT_WEB_URL||'http://localhost:5195';
const api=process.env.INBOX_ALERT_API_URL||'http://localhost:8795';
for(const url of [base,api])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
async function rpc(name,args){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
(async()=>{
 const {users}=await (await fetch(api+'/pilot/config')).json();
 const session=await rpc('event_operator_login',{p_password:'a'.repeat(64)});
 const send=()=>rpc('mailbox_operator_send',{p_session:session.token,p_ranking_id:users.alice.rank,p_request_id:randomUUID(),p_subject:'PRIVATE ALERT '+Date.now(),p_body:'Notification test body: never persist this text',p_image_mime:null,p_image_base64:null});
 const first=await send();
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await b.newContext({viewport:{width:1366,height:900}});const p=await context.newPage();const errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const host=new URL(r.request().url()).hostname;if(host&&!['localhost','127.0.0.1'].includes(host)){external.push(host);return r.abort();}return r.continue();});
  const notice=p.getByRole('complementary',{name:'새 쪽지 알림'});
  await p.goto(base+'/demo/event-pilot.html');await p.getByRole('button',{name:'테스트 다저스로 시작'}).click();
  await notice.waitFor();
  assert.ok((await notice.innerText()).includes('테스트 다저스'));
  assert.equal((await rpc('mailbox_operator_read',{p_session:session.token,p_id:first.id})).read_at,null,'notification does not mark read');
  for(const width of [1366,390,320]){
    await p.setViewportSize({width,height:900});const box=await notice.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await p.getByRole('button',{name:'새 쪽지 알림 닫기',exact:true}).click();
  let response=p.waitForResponse('**/rpc/mailbox_list');await p.evaluate(()=>dispatchEvent(new Event('focus')));await response;
  assert.equal(await notice.count(),0,'dismissed notification does not repeat');
  response=p.waitForResponse('**/rpc/mailbox_list');await p.reload();await response;assert.equal(await notice.count(),0,'reload does not repeat');
  const next=await send();response=p.waitForResponse('**/rpc/mailbox_list');await p.evaluate(()=>dispatchEvent(new Event('focus')));await response;await notice.waitFor();
  await p.getByRole('button',{name:'쪽지 확인',exact:true}).click();
  const inbox=p.getByRole('dialog',{name:'받은 쪽지함'});await inbox.waitFor();assert.equal(await notice.count(),0);
  await inbox.locator('.private-message-list button').filter({hasText:next.subject}).click();await inbox.locator('.private-message-body').waitFor();
  assert.ok((await rpc('mailbox_operator_read',{p_session:session.token,p_id:next.id})).read_at);
  assert.equal(await p.evaluate(()=>JSON.stringify(localStorage).includes('PRIVATE ALERT')||JSON.stringify(localStorage).includes('Notification test body')),false);
  await inbox.getByRole('button',{name:'닫기',exact:true}).click();
  // Seed a second owned deck, then switch inside the app with an old request pending.
  await p.evaluate(bob=>{const data=JSON.parse(localStorage.getItem('rivals-decks-v1'));const second={...data.decks[0],id:'second-owned-deck',name:bob.name};data.decks.push(second);localStorage.setItem('rivals-decks-v1',JSON.stringify(data));const links=JSON.parse(localStorage.getItem('rivals-my-ranks-v1'));links[bob.rank]={deckId:second.id,token:bob.token,password:true};localStorage.setItem('rivals-my-ranks-v1',JSON.stringify(links));},users.bob);
  response=p.waitForResponse('**/rpc/mailbox_list');await p.goto(base+'/#lineup');await response;
  await send();let release,finished;const gate=new Promise(r=>release=r),handled=new Promise(r=>finished=r);let intercepted=false;
  await p.route('**/rpc/mailbox_list',async r=>{if(!intercepted&&r.request().postDataJSON().p_ranking_id===users.alice.rank){intercepted=true;const result=await r.fetch();await gate;await r.fulfill({response:result});finished();return;}return r.continue();});
  const pending=p.waitForRequest('**/rpc/mailbox_list');await p.evaluate(()=>dispatchEvent(new Event('focus')));await pending;
  response=p.waitForResponse(r=>r.url().endsWith('/rpc/mailbox_list')&&r.request().postDataJSON().p_ranking_id===users.bob.rank);
  await Promise.all([response,p.locator('.toolbar-main select').selectOption('second-owned-deck')]);
  release();await handled;await p.unroute('**/rpc/mailbox_list');
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await notice.count(),0,'old response cannot expose Alice notification after deck switch');
  // Revoking local ownership also removes polling and notifications.
  await p.evaluate(()=>localStorage.removeItem('rivals-my-ranks-v1'));let calls=0;p.on('request',r=>{if(r.url().endsWith('/rpc/mailbox_list'))calls++});await p.reload();await p.getByRole('button',{name:'쪽지함',exact:true}).waitFor();await p.evaluate(()=>dispatchEvent(new Event('focus')));assert.equal(calls,0);assert.equal(await notice.count(),0);
  assert.deepEqual(errors,[]);assert.ok(!external.some(host=>host.endsWith('supabase.co')));
  console.log('Inbox notifications PASS: real local SQL, own-deck-only popup, unread preservation, dismissal/reload dedupe, new delivery, open inbox, no private content storage, 320/390/1366px and unauthenticated isolation.');
 }finally{await b.close();await rpc('event_operator_logout',{p_session:session.token});}
})().catch(e=>{console.error(e);process.exit(1)});
