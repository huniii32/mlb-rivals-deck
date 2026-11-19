// Start the local SQL pilot first. Only loopback hosts are allowed; no real messages/prizes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.MESSAGES_PILOT_URL||'http://localhost:5194';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const errors=[],external=[];
  const context=await browser.newContext({viewport:{width:1366,height:1000}});
  await context.route('**/*',r=>{const host=new URL(r.request().url()).hostname;if(host && !['localhost','127.0.0.1'].includes(host)){external.push(host);return r.abort();}return r.continue();});
  const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(base+'/demo/event-pilot.html');
  await admin.getByRole('button',{name:'테스트 운영자로 시작'}).click();
  await admin.getByRole('button',{name:'개인 쪽지 보내기'}).click();
  await admin.getByLabel('받는 덱 선택').selectOption({label:'테스트 다저스'});
  const title='이미지 지급 시험 '+Date.now();
  await admin.getByLabel('쪽지 제목',{exact:true}).fill(title);
  await admin.getByLabel('쪽지 내용',{exact:true}).fill('테스트 전용 기프티콘입니다.\n<script>window.bad=true</script>');
  const image=await admin.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=300;const x=c.getContext('2d');x.fillStyle='#edf4ef';x.fillRect(0,0,600,300);x.fillStyle='#20342c';x.font='30px sans-serif';x.fillText('TEST ONLY - NOT A REAL COUPON',20,120);return c.toDataURL('image/png').split(',')[1];});
  await admin.getByLabel('기프티콘 이미지 (선택)').setInputFiles({name:'test-only.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await admin.getByAltText('쪽지에 첨부된 이미지').waitFor();
  await admin.getByRole('button',{name:'전송 내용 확인',exact:true}).click();
  await admin.getByRole('region',{name:'전송 전 확인'}).waitFor();
  let sendCount=0;
  await admin.route('**/rpc/mailbox_operator_send',async r=>{sendCount++;const response=await r.fetch();if(sendCount===1)return r.abort();return r.fulfill({response});});
  await admin.getByRole('button',{name:'이 덱에 쪽지 보내기',exact:true}).click();
  await admin.getByRole('alert').filter({hasText:'동일 요청은 중복 발송되지 않습니다'}).waitFor();
  await admin.getByRole('button',{name:'이 덱에 쪽지 보내기',exact:true}).click();
  await admin.getByRole('status').filter({hasText:'쪽지를 보냈습니다'}).waitFor();
  const sent=admin.locator('.private-message-list button').filter({hasText:title});await sent.waitFor();assert.equal(await sent.count(),1);assert.equal(sendCount,2);
  await sent.click();await admin.locator('.private-message-content img').waitFor();assert.match(await sent.innerText(),/읽지 않음/);
  const recipient=await context.newPage();recipient.on('pageerror',e=>errors.push(e.message));
  await recipient.goto(base+'/demo/event-pilot.html');await recipient.getByRole('button',{name:'테스트 다저스로 시작'}).click();
  await recipient.getByRole('button',{name:'쪽지함',exact:true}).click();
  const inbox=recipient.getByRole('dialog',{name:'받은 쪽지함'});
  await inbox.locator('.private-message-list button').filter({hasText:title}).click();
  await inbox.locator('.private-message-content img').waitFor();
  assert.equal(await recipient.evaluate(()=>window.bad),undefined,'message body is plain text');
  assert.match(await inbox.locator('img').getAttribute('src'),/^blob:/);
  assert.equal(await inbox.locator('img').evaluate(e=>e.naturalWidth),600);
  const [download]=await Promise.all([recipient.waitForEvent('download'),inbox.getByRole('link',{name:'이미지 저장'}).click()]);
  assert.equal(download.suggestedFilename(),'gift-image.png');
  const downloaded=fs.readFileSync(await download.path());assert.deepEqual(downloaded,Buffer.from(image,'base64'));
  assert.equal(await recipient.evaluate(t=>JSON.stringify(localStorage).includes(t),title),false,'message is not persisted in browser storage');
  for(const width of [1366,390,320]) {
    await recipient.setViewportSize({width,height:900});
    assert.equal(await recipient.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await inbox.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  }
  fs.mkdirSync('/workspace/artifacts/private-messages',{recursive:true});
  await recipient.screenshot({path:'/workspace/artifacts/private-messages/inbox-320.png',fullPage:true});
  await inbox.getByRole('button',{name:'닫기',exact:true}).click();await recipient.reload();await recipient.getByRole('button',{name:'쪽지함',exact:true}).click();
  await inbox.locator('.private-message-list button').filter({hasText:title}).waitFor();assert.equal(await inbox.locator('img').count(),0,'images are not restored from storage');
  // Switch to another owned deck while the old image read is pending.
  await inbox.getByRole('button',{name:'닫기',exact:true}).click();
  const config=await recipient.evaluate(async()=>await (await fetch('http://localhost:8794/pilot/config')).json());
  await recipient.evaluate(b=>{const data=JSON.parse(localStorage.getItem('rivals-decks-v1'));const copy={...data.decks[0],id:'test-bob',name:b.name};data.decks.push(copy);localStorage.setItem('rivals-decks-v1',JSON.stringify(data));const links=JSON.parse(localStorage.getItem('rivals-my-ranks-v1'));links[b.rank]={deckId:copy.id,token:b.token,password:true};localStorage.setItem('rivals-my-ranks-v1',JSON.stringify(links));},config.users.bob);
  await recipient.reload();await recipient.getByRole('button',{name:'쪽지함',exact:true}).click();
  let release;const gate=new Promise(r=>release=r);
  await recipient.route('**/rpc/mailbox_read',async r=>{const response=await r.fetch();await gate;await r.fulfill({response});});
  const opened=recipient.waitForRequest('**/rpc/mailbox_read');await inbox.locator('.private-message-list button').filter({hasText:title}).click();await opened;
  await inbox.getByLabel('쪽지를 확인할 덱').selectOption({label:'테스트 양키스'});release();
  await inbox.getByText('받은 쪽지가 없습니다.',{exact:true}).waitFor();assert.equal(await inbox.locator('img').count(),0);assert.equal(await inbox.getByText(title,{exact:true}).count(),0);
  await admin.getByRole('button',{name:'보낸 내역 새로고침',exact:true}).click();await sent.waitFor();assert.match(await sent.innerText(),/읽음/);
  for(const width of [1366,390]){await admin.setViewportSize({width,height:900});assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await admin.screenshot({path:'/workspace/artifacts/private-messages/admin-390.png',fullPage:true});
  await admin.getByRole('button',{name:'로그아웃',exact:true}).click();await admin.getByRole('heading',{name:'관리자 로그인'}).waitFor();assert.equal(await admin.locator('.private-message-content').count(),0);
  assert.deepEqual(errors,[]);
  assert.ok(!external.some(h=>h.endsWith('supabase.co')),'must never contact production');
  console.log('Private inbox browser: operator compose/image confirmation, response-loss retry without duplicate, owner read, original image download, safe text, no message storage, pending-read deck-switch isolation, read receipts, reload, logout and desktop/320/390px layouts passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
