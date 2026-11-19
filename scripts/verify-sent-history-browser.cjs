// Fake mailbox responses on a local pilot; no live recipients or gift messages.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.SENT_HISTORY_WEB||'http://localhost:5197';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1366,height:1000}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let count=0,missing=false;
 const messages=Array.from({length:53},(_,i)=>({id:`sent-${i}`,recipient_id:`recipient-${i%2}`,recipient_name:i%2?'테스트 양키스':'테스트 다저스',subject:`발송 내역 ${i}`,created_at:i<2?'2026-11-18T15:00:00Z':'2026-11-18T14:59:59Z',read_at:i===0?'2026-11-19T01:00:00Z':null,has_image:i===0}));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();
  if(url.pathname.endsWith('/mailbox_operator_sent')){count++;if(missing)return route.fulfill({status:404,json:{code:'PGRST202',message:'function not found'}});const args=route.request().postDataJSON();return route.fulfill({json:messages.slice(args.p_offset,args.p_offset+50)})}
  if(url.pathname.endsWith('/mailbox_operator_read')){const m=messages.find(m=>m.id===route.request().postDataJSON().p_id);return route.fulfill({json:{...m,body:'가상 발송 본문'}})}
  if(url.pathname.endsWith('/mailbox_operator_send'))return route.fulfill({json:{id:'mock-sent'}});
  return route.continue();
 });
 await page.goto(base+'/event-control/#messages');await page.getByLabel('관리자 비밀번호',{exact:true}).fill('a'.repeat(64));await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'운영자 개인 쪽지',exact:true}).waitFor();assert.equal(count,0);
 await page.getByText('전체 보낸 쪽지 내역 · 날짜별 보기',{exact:true}).click();
 const history=page.getByRole('region',{name:'전체 보낸 쪽지 내역',exact:true});
 await history.getByRole('heading',{name:'2026년 11월 19일',exact:true}).waitFor();
 assert.equal(await history.getByRole('region',{name:'2026년 11월 19일',exact:true}).locator('li').count(),2);
 assert.equal(await history.getByRole('region',{name:'2026년 11월 18일',exact:true}).locator('li').count(),48);
 assert.ok((await history.locator('li').first().innerText()).includes('이미지 첨부'));
 assert.ok((await history.locator('li').first().innerText()).includes('읽음'));
 await history.locator('li button').first().click();await history.getByText('가상 발송 본문',{exact:true}).waitFor();
 await history.getByRole('button',{name:'다음 발송 내역',exact:true}).click();await history.getByText('발송 내역 52',{exact:true}).waitFor();assert.equal(await history.locator('li').count(),3);assert.equal(await history.getByRole('region',{name:'보낸 쪽지 상세'}).count(),0);
 await history.getByRole('button',{name:'이전 발송 내역',exact:true}).click();await history.getByText('발송 내역 0',{exact:true}).waitFor();
 for(const width of [393,820,1366]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 // Completing a local fake send refreshes the expanded history without changing recipient selection.
 const select=page.getByLabel('받는 덱 선택',{exact:true});await select.selectOption({index:1});await page.getByLabel('쪽지 제목',{exact:true}).fill('로컬 발송 갱신 검증');await page.getByLabel('쪽지 내용',{exact:true}).fill('운영 쪽지는 발송하지 않습니다.');
 const previous=count;await page.getByRole('button',{name:'전송 내용 확인',exact:true}).click();await page.getByRole('button',{name:'이 덱에 쪽지 보내기',exact:true}).click();await page.getByText('쪽지를 보냈습니다.',{exact:false}).waitFor();await history.getByText('발송 내역 0',{exact:true}).waitFor();assert.ok(count>previous);
 missing=true;await history.getByRole('button',{name:'발송 내역 새로고침',exact:true}).click();await history.getByRole('alert').filter({hasText:'admin-mailbox-update.sql'}).waitFor();assert.equal(await history.locator('li').count(),0);
 missing=false;await history.getByRole('button',{name:'발송 내역 새로고침',exact:true}).click();await history.getByText('발송 내역 0',{exact:true}).waitFor();
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('heading',{name:'관리자 로그인',exact:true}).waitFor();assert.equal(await history.count(),0);assert.deepEqual(errors,[]);
 console.log('Sent history browser PASS: KST midnight grouping, recipients/subjects/read receipts, detail, 53-message pagination, responsive layout, send refresh, missing SQL notice and logout.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
