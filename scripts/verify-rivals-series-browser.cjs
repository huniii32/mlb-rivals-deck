const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const base=process.env.SERIES_TEST_URL || 'http://127.0.0.1:4180/rivals-series-demo/';
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url())});
  await page.goto(base);
  await page.getByRole('tab',{name:'조합 1',exact:false}).waitFor({timeout:60000});
  const check=async(sp,cp)=>{
   const labels=await page.locator('.player .position').allTextContents();
   assert.equal(labels.length,26);assert.equal(labels.filter(s=>s.startsWith('SP')).length,sp);
   assert.equal(labels.filter(s=>s.startsWith('CP')).length,cp);assert.equal(labels.filter(s=>s.startsWith('RP')).length,12-sp-cp);
   assert.equal(labels.filter(s=>s.startsWith('후보')).length,5);
  };
  await check(5,2);
  await page.getByText('전체 +19 · 타자 +4 · 투수 +5 계산표',{exact:true}).click();
  assert.equal(await page.locator('.recipe tbody tr').count(),6);
  assert.ok((await page.locator('.recipe').innerText()).includes('8개 구단'));
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +18 / 타자 +4 / 투수 +5'));
  await page.getByText('버프 계산 근거',{exact:true}).click();assert.ok(await page.locator('.buff-row.on').count()>0);
  const typeLabel=await page.locator('.card-options select[aria-label$="일반 종류"]').evaluateAll(nodes=>nodes.find(n=>n.value==='live').getAttribute('aria-label'));
  await page.getByLabel(typeLabel,{exact:true}).selectOption('season');
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +16'));
  assert.ok((await page.locator('.pending').innerText()).includes('라이브 20명 조건에 1명 부족'));
  await page.getByRole('tab',{name:'조합 2',exact:false}).click();
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +18'));
  await page.getByRole('tab',{name:'조합 1',exact:false}).click();
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +16'));
  await page.getByLabel(typeLabel,{exact:true}).selectOption('live');
  const before=await page.locator('.roster').innerText();await page.getByRole('tab',{name:'조합 2',exact:false}).click();assert.notEqual(await page.locator('.roster').innerText(),before);
  const search=async(sp,cp)=>{
   await page.getByLabel('선발 인원',{exact:true}).selectOption(String(sp));await page.getByLabel('마무리 인원',{exact:true}).selectOption(String(cp));
   await page.getByRole('button',{name:'새 조합 찾기'}).click();await page.getByRole('button',{name:'새 조합 찾기'}).waitFor({timeout:60000});await check(sp,cp);
  };
  await page.getByLabel('시즌 일반 카드 수',{exact:true}).selectOption('0');
  await search(6,2);
  assert.equal(await page.locator('.summary dl>div').filter({hasText:'Live 카드'}).locator('dd').innerText(),'26명');
  await page.getByLabel('시즌 일반 카드 수',{exact:true}).selectOption('6');
  await search(4,1);
  const buff=await page.locator('.pending').innerText();
  for(let i=1;i<=7;i++)await page.getByLabel(`RP${i} 역할`,{exact:true}).selectOption('롱릴리프');
  assert.equal(await page.locator('.pending').innerText(),buff);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'조합 저장'}).click();const file=await download;
  const data=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(data.formation.pitchers,12);assert.equal(data.formation.benchBatters,5);assert.equal(data.formation.relievers,7);
  assert.equal(Object.keys(data.roles).length,7);assert.ok(Object.values(data.roles).every(r=>r==='롱릴리프'));
  assert.equal(data.buffs.total.pitcher,5);
  assert.equal(data.counts.live,20);
  assert.equal(data.lineup.filter(x=>x.player.requirement&&!x.player.live).length,6);
  assert.ok(data.lineup.every(x=>x.player.pick || x.player.requirement));
  for(const width of [390,768,1366]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Rival Series browser PASS: worker, 18/4/5, breakdown, distinct candidates, SP4..6/CP1..2, five batter reserves, unrestricted relief roles, JSON, responsive UI.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
