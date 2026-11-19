/** Local-only iPhone 16/iPad viewport checks. All backend traffic is mocked.
 * MOBILE_LAYOUT_URL=http://localhost:5201 MOBILE_LAYOUT_ENGINE=webkit node scripts/verify-mobile-layout-browser.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const base=process.env.MOBILE_LAYOUT_URL||'http://localhost:5201';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.MOBILE_LAYOUT_ENGINE||'chromium';
(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const dir=`/workspace/artifacts/mobile-layout/${engine}`;fs.mkdirSync(dir,{recursive:true});
 try {
  for(const device of [{name:'iphone16',width:393,height:852},{name:'ipad-air',width:820,height:1180}]){
   const context=await browser.newContext({viewport:device,isMobile:true,hasTouch:true,deviceScaleFactor:device.name==='iphone16'?3:2});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.includes('/rest/v1/')){
     assert.equal(route.request().method(),'GET','layout test must not write backend data');
     const rows=[{id:'test-rank-1',deck_name:'오탄희와함께라면',total:4779.5,named:18,created_at:'2026-11-19T00:00:00Z',deck_json:null},
      {id:'test-rank-2',deck_name:'아주 긴 이름으로 등록된 테스트 덱 라인업',total:10000.5,named:21,created_at:'2026-11-19T00:00:00Z',deck_json:null}];
     return route.fulfill({json:url.pathname.endsWith('/rankings')?rows:[]});
    }
    if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();
    return route.continue();
   });
   await context.routeWebSocket('**/realtime/**',socket=>socket.close());
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);
   const nav=name=>page.getByRole('navigation',{name:'주 메뉴'}).getByRole('button',{name,exact:true}).click();
   for(const theme of ['dark','light']){
    if(theme==='light')await page.getByRole('button',{name:'라이트 모드로 전환',exact:true}).click();
    for(const orientation of ['portrait','landscape']){
     const width=orientation==='portrait'?device.width:device.height,height=orientation==='portrait'?device.height:device.width;
     await page.setViewportSize({width,height});
     await nav('내 라인업');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'lineup viewport overflow');
     if(width<=760){
      const b=await page.locator('.topbar > span').boundingBox();
      const buttons=await page.locator('.topbar button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,height:r.height,right:r.right,scroll:n.scrollWidth,width:n.clientWidth}}));
      assert.ok(b.height<25,'breadcrumb wraps');
      assert.ok(buttons.every(r=>Math.abs(r.y-buttons[0].y)<1&&r.height>=44&&r.right<=width&&r.scroll<=r.width),'header actions must share a row and fit');
     }
     await page.locator('.topbar').screenshot({path:`${dir}/${device.name}-${orientation}-${theme}-header.png`});
     await nav('덱랭킹');
     await page.getByLabel('덱 이름 검색',{exact:true}).fill('오탄');
     await page.getByRole('button',{name:'오탄희와함께라면 덱 메뉴',exact:true}).click();
     const table=page.locator('.ranking-table');
     await page.waitForFunction(n=>document.querySelector('.ranking-expanded td')?.colSpan===n,width<=640?3:4);
     const geometry=await table.evaluate(t=>{
      const row=t.querySelector('.ranking-selected'),cells=[...row.cells],rect=t.getBoundingClientRect();
      return {count:cells.length,right:cells.at(-1).getBoundingClientRect().right,tableRight:rect.right,span:t.querySelector('.ranking-expanded td').colSpan,expandedWidth:t.querySelector('.ranking-expanded td').getBoundingClientRect().width,width:rect.width};
     });
     assert.equal(geometry.count,width<=640?3:4);
     assert.equal(geometry.span,geometry.count);
     assert.ok(Math.abs(geometry.right-geometry.tableRight)<=1,'phantom date column after expansion');
     assert.ok(Math.abs(geometry.expandedWidth-geometry.width)<=1,'expanded action width');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ranking viewport overflow');
     await page.getByRole('button',{name:'비밀번호로 가져오기',exact:true}).click();
     const dialog=page.getByRole('dialog',{name:'랭킹 덱 가져오기'});await dialog.waitFor();
     const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'restore dialog clipped horizontally');
     await dialog.getByRole('button',{name:'취소',exact:true}).click();
     await table.screenshot({path:`${dir}/${device.name}-${orientation}-${theme}-ranking.png`});
     // Resize while expanded: the table and action span must update together.
     await page.setViewportSize({width:width<=640?820:393,height:852});
     await page.waitForFunction(n=>document.querySelector('.ranking-expanded td')?.colSpan===n,width<=640?4:3);
     await page.setViewportSize({width,height});
     await page.waitForFunction(n=>document.querySelector('.ranking-expanded td')?.colSpan===n,width<=640?3:4);
     await page.getByLabel('덱 이름 검색',{exact:true}).fill('no matching deck');
     await page.getByText('검색 결과가 없습니다.',{exact:true}).waitFor();
     assert.equal(await table.locator('tbody td').getAttribute('colspan'),String(width<=640?3:4));
    }
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(`${engine}: iPhone 16 393x852 and iPad Air 820x1180, portrait/landscape, light/dark; header alignment, full-width ranking, resize while expanded, restore dialog and empty search PASS.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
