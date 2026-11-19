// Local pilot only; fake recipients, no messages sent.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.WINNER_TEST_WEB||'http://localhost:5196';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const decks=Array.from({length:123},(_,i)=>({id:`deck-${i}`,deck_name:`테스트 덱 ${String(i).padStart(3,'0')}`}));
  const calls=[];
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname&&!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();
   if(url.pathname.endsWith('/mailbox_operator_recipients')){
    const args=route.request().postDataJSON();calls.push(args);
    const matches=decks.filter(d=>d.deck_name.includes(args.p_query));
    return route.fulfill({json:matches.slice(args.p_offset,args.p_offset+50)});
   }
   if(url.pathname.endsWith('/mailbox_operator_list'))return route.fulfill({json:[]});
   if(url.pathname.endsWith('/mailbox_operator_send'))throw Error('No messages may be sent');
   return route.continue();
  });
  await page.goto(base+'/event-control/#messages');
  await page.getByLabel('관리자 비밀번호',{exact:true}).fill('a'.repeat(64));
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByText('전체 등록 덱 123개',{exact:true}).waitFor();
  const select=page.getByLabel('받는 덱 선택',{exact:true});
  assert.equal(await select.locator('option').count(),124);
  assert.ok(calls.some(c=>c.p_offset===100));
  await select.selectOption('deck-122');
  await page.getByRole('heading',{name:'받는 덱: 테스트 덱 122',exact:true}).waitFor();
  await page.getByLabel('받는 덱 검색',{exact:true}).fill('테스트 덱 0');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await page.getByText('‘테스트 덱 0’ 검색 결과 100개',{exact:true}).waitFor();
  assert.equal(await select.locator('option').count(),102); // 100 matches + current selection + placeholder
  assert.equal(await select.inputValue(),'deck-122');
  await page.getByRole('button',{name:'전체 덱 보기',exact:true}).click();
  await page.getByText('전체 등록 덱 123개',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('받는 덱 검색',{exact:true}).inputValue(),'');
  await page.getByLabel('받는 덱 검색',{exact:true}).fill('없음');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await page.getByText('‘없음’ 검색 결과 0개',{exact:true}).waitFor();
  await page.getByRole('button',{name:'전체 덱 보기',exact:true}).click();
  await page.getByText('전체 등록 덱 123개',{exact:true}).waitFor();
  for(const width of [1366,390,320]){
   await page.setViewportSize({width,height:1000});
   const input=await page.getByLabel('받는 덱 검색',{exact:true}).boundingBox();
   const button=await page.getByRole('button',{name:'검색',exact:true}).boundingBox();
   assert.ok(Math.abs(input.y-button.y)<1);
   assert.ok(Math.abs(input.height-button.height)<1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:1366,height:1000});
  await page.locator('.message-recipient-search').screenshot({path:'/tmp/recipient-search-desktop.png'});
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await page.getByRole('heading',{name:'관리자 로그인',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Recipient list PASS: 123 decks, multi-page search, preserved selection, reset, empty search and aligned controls at 1366/390/320px.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
