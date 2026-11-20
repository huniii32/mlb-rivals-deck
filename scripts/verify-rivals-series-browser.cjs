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
   for(const [group,prefix,count] of [['starters','SP',sp],['bullpen','RP',12-sp-cp],['closers','CP',cp]]) {
    const slots=await page.locator(`.${group} .position`).allTextContents();
    assert.equal(slots.length,count);assert.ok(slots.every(slot=>slot.startsWith(prefix)));
   }
  };
  await check(5,2);
  assert.deepEqual(await page.locator('.group-title h3').allTextContents(),['주전 타자','후보 타자','선발투수','불펜','마무리']);
  const boxes=await page.locator('.roster>.group').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y}}));
  assert.ok(boxes[1].y>boxes[0].y && Math.abs(boxes[0].x-boxes[1].x)<1);
  for(let i=2;i<boxes.length;i++)assert.ok(boxes[i].y>boxes[i-1].y && Math.abs(boxes[i].x-boxes[i-1].x)<1);
  const catalog=page.locator('.pick-catalog');
  assert.equal(await catalog.getAttribute('open'),null);assert.equal(await page.locator('.pickgrid').isVisible(),false);
  await catalog.locator('summary').first().click();assert.equal(await page.locator('.pickgrid article').count(),60);
  await page.getByPlaceholder('예: LAD, 투수는 CP 또는 RP').fill('LAD');assert.equal(await page.locator('.pickgrid article').count(),2);
  await catalog.locator('summary').first().click();assert.equal(await page.locator('.pickgrid').isVisible(),false);
  const forecast=page.locator('#next-picks');
  const lineupBefore=await page.locator('.roster').innerText();
  assert.equal(await forecast.getAttribute('open'),null);
  await forecast.locator('summary').click();
  assert.equal(await forecast.locator('tbody tr').count(),30);
  assert.equal(await forecast.getByText(/차순위 · 직전 픽/).count(),7);
  assert.equal(await forecast.getByText(/규정 162이닝 미달/).count(),4);
  await forecast.getByLabel('구단 선택').selectOption('ARI');
  assert.equal(await forecast.locator('tbody tr').count(),1);
  assert.match(await forecast.innerText(),/공동 1위 · 각 147안타/);
  await forecast.getByLabel('구단 선택').selectOption('LAD');
  assert.match(await forecast.innerText(),/야마모토 요시노부/);
  for(const width of [320,393,768,1366]){
    await page.setViewportSize({width,height:900});
    assert.ok(await forecast.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  await forecast.locator('summary').click();
  assert.equal(await page.locator('.roster').innerText(),lineupBefore);
  const openCard=async label=>{
    const input=page.getByLabel(label,{exact:true});
    const popup=input.locator('xpath=ancestor::*[@popover][1]');
    if(await popup.count()) {
      if(!await popup.isVisible()) await page.getByRole('button',{name:label.replace(/ 일반 .+$/,' 카드 조건 변경'),exact:true}).click();
    } else {
      const details=input.locator('xpath=ancestor::details[1]');if(await details.getAttribute('open')===null)await details.locator('summary').click();
    }
  };

  assert.equal(await page.locator('.calculation').getAttribute('open'),null);
  const flow=await page.locator('.controls,.workspace>.summary,.workspace>.result,.pick-catalog,.calculation').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  assert.ok(flow.every((top,i)=>i===0||top>flow[i-1]));
  await page.locator('.calculation>summary').click();
  await page.getByText('전체 +19 · 타자 +4 · 투수 +5 계산표',{exact:true}).click();
  assert.equal(await page.locator('.recipe tbody tr').count(),6);
  assert.ok((await page.locator('.recipe').innerText()).includes('8개 구단'));
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +18 / 타자 +4 / 투수 +5'));
  await page.getByText('버프 계산 근거',{exact:true}).click();assert.ok(await page.locator('.buff-row.on').count()>0);
  const typeLabel=await page.locator('.card-options select[aria-label$="일반 종류"]').evaluateAll(nodes=>nodes.find(n=>n.value==='live').getAttribute('aria-label'));
  await openCard(typeLabel);
  await page.getByLabel(typeLabel,{exact:true}).selectOption('season');
  await page.keyboard.press('Escape');
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +16'));
  assert.ok((await page.locator('.pending').innerText()).includes('라이브 20명 조건에 1명 부족'));
  await page.getByRole('tab',{name:'조합 2',exact:false}).click();
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +18'));
  await page.getByRole('tab',{name:'조합 1',exact:false}).click();
  assert.ok((await page.locator('.pending').innerText()).includes('전체 +16'));
  await openCard(typeLabel);
  await page.getByLabel(typeLabel,{exact:true}).selectOption('live');
  await page.keyboard.press('Escape');
  const before=await page.locator('.roster').innerText();await page.getByRole('tab',{name:'조합 2',exact:false}).click();assert.notEqual(await page.locator('.roster').innerText(),before);
  const search=async(sp,cp)=>{
   await page.getByLabel('선발 인원',{exact:true}).selectOption(String(sp));await page.getByLabel('마무리 인원',{exact:true}).selectOption(String(cp));
   await page.getByRole('button',{name:'새 조합 찾기'}).click();await page.getByRole('button',{name:'새 조합 찾기'}).waitFor({timeout:60000});await check(sp,cp);
  };
  await page.getByLabel('시즌 일반 카드 수',{exact:true}).selectOption('0');
  await search(6,2);
  assert.equal(await page.locator('.starters .lineup-card').evaluateAll(cards=>new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top))).size),1);
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
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
   const geometry=await page.locator('.batters .lineup-cards').evaluate(field=>{
     const f=field.getBoundingClientRect();const cards=[...field.querySelectorAll('.lineup-card')].map(n=>{const r=n.getBoundingClientRect();return {slot:n.dataset.slot,left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
     const overlaps=[];for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i],b=cards[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([a.slot,b.slot]);}
     return {count:cards.length,overlaps,overflow:cards.filter(c=>c.left<f.left-1||c.right>f.right+1||c.top<f.top-1||c.bottom>f.bottom+1).map(c=>c.slot)};
   });
   const pitching=await page.locator('.starters .lineup-cards,.bullpen .lineup-cards,.closers .lineup-cards').evaluateAll(groups=>groups.map(group=>{
     const bounds=group.getBoundingClientRect(),cards=[...group.children].map(card=>card.getBoundingClientRect());
     const scrolling=group.scrollWidth>group.clientWidth+1;
     return {rows:new Set(cards.map(r=>Math.round(r.top))).size,center:Math.abs((cards[0].left+cards.at(-1).right)/2-(bounds.left+bounds.right)/2),scrolling,firstVisible:cards[0].left>=bounds.left-1};
   }));
   for(const group of pitching){assert.equal(group.rows,1,`one pitching row at ${width}`);assert.ok(group.scrolling?group.firstVisible:group.center<2,`pitching row accessible/centered at ${width}`);}
   assert.equal(geometry.count,9);assert.deepEqual(geometry.overlaps,[],`overlap ${width}`);assert.deepEqual(geometry.overflow,[],`field overflow ${width}`);

  }
  if(process.env.SERIES_SCREENSHOT) {
    await page.setViewportSize({width:1366,height:1000});
    await page.locator('.batters').screenshot({path:process.env.SERIES_SCREENSHOT});
    await page.setViewportSize({width:390,height:900});await page.locator('.batters').screenshot({path:process.env.SERIES_SCREENSHOT.replace('.png','-mobile.png')});
  }
  await page.locator('.team-selector>summary').click();
  const club=team=>page.getByRole('checkbox',{name:team,exact:true});
  await club('LAD').check();await club('NYY').check();
  await page.getByRole('button',{name:'새 조합 찾기'}).click();
  await page.getByRole('button',{name:'새 조합 찾기'}).waitFor({timeout:60000});
  for(let i=1;i<=await page.getByRole('tab').count();i++) {
    await page.getByRole('tab',{name:`조합 ${i}`,exact:false}).click();
    assert.equal(await page.locator('.required-teams span[data-met="true"]').count(),2);
    const clubs=await page.locator('.roster .club-mark').allTextContents();
    for(const team of ['LAD','NYY'])assert.ok(clubs.filter(t=>t===team).length>=3);
  }
  const multiDownload=page.waitForEvent('download');await page.getByRole('button',{name:'조합 저장'}).click();
  const saved=JSON.parse(fs.readFileSync(await (await multiDownload).path(),'utf8'));
  assert.deepEqual(saved.options.teams,['LAD','NYY']);
  const clubInput=await page.locator('.card-options select[aria-label$="일반 구단"]').evaluateAll(nodes=>nodes.find(n=>n.value==='LAD')?.getAttribute('aria-label'));
  assert.ok(clubInput);
  while(await page.locator('.required-teams span').filter({hasText:'LAD'}).getAttribute('data-met')==='true') {
    const label=await page.locator('.card-options select[aria-label$="일반 구단"]').evaluateAll(nodes=>nodes.find(n=>n.value==='LAD')?.getAttribute('aria-label'));
    if(!label)break;
    await openCard(label);await page.getByLabel(label,{exact:true}).selectOption('NYY');await page.keyboard.press('Escape');
  }
  assert.ok((await page.locator('.required-teams').innerText()).includes('미달'));
  const unchecked=await page.locator('.team-selector input:not(:checked)').evaluateAll(nodes=>nodes.slice(0,6).map(n=>n.parentElement.textContent));
  for(const team of unchecked)await club(team).check();
  assert.equal(await page.locator('.team-selector input:checked').count(),8);
  assert.equal(await page.locator('.team-selector input:disabled').count(),22);
  await page.getByRole('button',{name:'선택 초기화'}).click();
  assert.equal(await page.locator('.team-selector input:checked').count(),0);
  assert.equal(await page.locator('.team-selector input:disabled').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Rival Series browser PASS: worker, 18/4/5, breakdown, distinct candidates, SP4..6/CP1..2, five batter reserves, unrestricted relief roles, JSON, responsive UI.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
