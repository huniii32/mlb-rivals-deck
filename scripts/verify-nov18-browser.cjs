/** Requires VITE_DEVELOPMENT_SANDBOX=1 Vite server on 5177. No production writes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nov18-browser-'));
require('esbuild').buildSync({stdin:{contents:'export * from "./src/lib/deck";',resolveDir:process.cwd(),loader:'ts'},outfile:path.join(temp,'model.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {LINEUP,blankPlayer,normalizeDeck,DEFAULT_CHEM}=require(path.join(temp,'model.cjs'));
const fixture=normalizeDeck({id:'nov18',name:'11월18일 시험 덱',updatedAt:1,chem:{...DEFAULT_CHEM},flags:{},yearInputs:{},players:LINEUP.map(l=>({...blankPlayer(l.row,l.kind,l.pos,l.order),name:`시험${l.row}`,card:'시그니처',pohLv:20,finalOv:[180,180,180]}))});
Object.assign(fixture.players[0],{name:'국가검증',card:'WBC 시그니처',wbcCountry:'KOR',skills:['[S0] WBC 하모니 (동일 국가 4명 이상)','','','']});
Object.assign(fixture.players[9],{name:'투수국가',card:'WBC 시그니처',wbcCountry:'USA'});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900}}),requests=[],errors=[];
  await context.route('**/rest/v1/**',async route=>{requests.push(route.request().url());await route.abort();});
  await context.addInitScript(({deck})=>{
   if(!localStorage.getItem('nov18-seeded')){
    localStorage.setItem('rivals-decks-v1',JSON.stringify({decks:[deck],activeId:deck.id}));
    localStorage.setItem('rivals-my-ranks-v1',JSON.stringify({test:{deckId:deck.id,password:true,token:'test-only-token',sig:'stale'}}));
    localStorage.setItem('nov18-seeded','1');
   }
  },{deck:fixture});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.NOV18_URL||'http://localhost:5177');
  await p.getByText(/공개 랭킹·이벤트 서버와 연결하지 않습니다/).waitFor();
  const nav=name=>p.getByRole('navigation',{name:'주 메뉴'}).getByRole('button',{name,exact:true}).click();
  const local=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('rivals-decks-v1')).decks[0]);
  const editor=()=>p.getByRole('dialog',{name:'선수 편집'});
  await p.getByRole('button',{name:'C 국가검증',exact:true}).click();
  assert.equal(await editor().getByLabel('WBC 카드 국가',{exact:true}).inputValue(),'KOR');
  assert.match(await editor().locator('.editor-skill-grid .pill').first().innerText(),/14\.1/);
  await editor().getByLabel('포지션훈련 Lv',{exact:true}).fill('26');
  await editor().getByRole('alert').filter({hasText:'20레벨까지만'}).waitFor();
  assert.deepEqual((await local()).players[0].finalOv,[180,180,180]);
  await editor().getByRole('button',{name:'닫기',exact:true}).click();
  await p.getByRole('button',{name:/^선발\s*5$/}).click();
  await p.getByRole('button',{name:'SP1 투수국가',exact:true}).click();
  await editor().getByLabel('WBC 카드 국가',{exact:true}).selectOption('KOR');
  await editor().getByRole('button',{name:'닫기',exact:true}).click();
  await p.getByRole('button',{name:/^타자\s*9$/}).click();
  await p.getByRole('button',{name:'C 국가검증',exact:true}).click();
  assert.match(await editor().locator('.editor-skill-grid .pill').first().innerText(),/26\.1/);
  await editor().getByLabel('WBC 카드 국가',{exact:true}).selectOption('');
  await editor().locator('.editor-skill-grid').getByText(/하모니 조건 미확인:/).waitFor();
  await editor().getByLabel('WBC 카드 국가',{exact:true}).selectOption('KOR');
  await editor().getByRole('button',{name:'닫기',exact:true}).click();
  await p.reload();
  assert.equal((await local()).players[9].wbcCountry,'KOR');
  await p.getByRole('button',{name:'C 국가검증',exact:true}).click();
  assert.match(await editor().locator('.editor-skill-grid .pill').first().innerText(),/26\.1/);
  await editor().getByRole('button',{name:'닫기',exact:true}).click();
  await p.getByRole('button',{name:/투수 전술 승리조/}).click();
  await p.getByLabel('승리조 전술',{exact:true}).selectOption('aggressive');
  assert.match(await p.getByLabel('승리조 전술',{exact:true}).locator('option:checked').innerText(),/1명 이상/);
  await p.getByRole('button',{name:'설정 완료',exact:true}).click();
  await nav('스킬 비교');
  await p.getByLabel('스킬 포지션').selectOption('pitcher');
  const search=p.getByRole('combobox',{name:'현재 조합 스킬 1',exact:true});
  await search.fill('파워 피쳐');
  await p.getByRole('option',{name:'파워 피쳐',exact:true}).click();
  const conditions=p.getByLabel('현재 스킬 1 조건');
  const labels=await conditions.locator('option').allTextContents();
  assert.ok(labels.includes('구속>인내 · O')&&labels.includes('구속>인내 · X'));
  await conditions.selectOption({label:'구속>인내 · O'});
  assert.match(await p.locator('.skill-slot').first().innerText(),/47\.50/);
  await conditions.selectOption({label:'구속>인내 · X'});
  assert.match(await p.locator('.skill-slot').first().innerText(),/23\.50/);
  await p.getByLabel('스킬 포지션').selectOption('batter');
  await search.fill('WBC 하모니');
  await p.getByRole('option',{name:'WBC 하모니',exact:true}).click();
  await conditions.selectOption({label:'동일 국가 4명 이상'});
  await p.getByLabel('현재 스킬 1 레벨').selectOption('S2');
  assert.match(await p.locator('.skill-slot').first().innerText(),/47\.60/);
  fs.mkdirSync('/workspace/artifacts/nov18-development',{recursive:true});
  for(const width of [1366,390]){
   await p.setViewportSize({width,height:900});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.screenshot({path:`/workspace/artifacts/nov18-development/skill-comparison-${width}.png`,fullPage:true});
  }
  assert.deepEqual(requests,[],'sandbox must not contact production backend even with a saved rank link');
  assert.deepEqual(errors,[]);
  console.log('Nov 18 browser: country editing/reload, cross-group harmony counts, unknown conditions, training fallback, one-person tactic, Power Pitcher O/X, WBC S2, desktop/mobile and production isolation passed.');
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
