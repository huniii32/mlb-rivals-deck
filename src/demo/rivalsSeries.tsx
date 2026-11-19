import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {findCandidates, players, teams, seriesData, summarize, type Selection} from '../lib/rivalsSeries';
import './rivalsSeries.css';

function App() {
  const [team,setTeam] = useState(''); const [allow,setAllow] = useState(false);
  const [results,setResults] = useState<Selection[][]>(() => findCandidates({preferredTeam:'',allowCloserInRelief:false,seed:19}));
  const [active,setActive] = useState(0); const [query,setQuery] = useState('');
  const [run,setRun] = useState({team:'',allow:false,seed:19}); const [busy,setBusy] = useState(false);
  const lineup = results[active] || []; const counts = summarize(lineup);
  const dirty = team !== run.team || allow !== run.allow;
  const picks = players.filter(p => p.pick && `${p.noticeName} ${p.team} ${p.positions.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  function search() {
    setBusy(true);
    // Allow the busy state to paint before the bounded, browser-only search.
    setTimeout(() => {const next={team,allow,seed:run.seed+1}; setResults(findCandidates({preferredTeam:team,allowCloserInRelief:allow,seed:next.seed}));setRun(next);setActive(0);setBusy(false);},30);
  }
  function download() {
    const file=new Blob([JSON.stringify({version:seriesData.version,verification:'unverified-buff-rules',formation:'demo-26',options:run,counts,lineup},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(file); const a=document.createElement('a');a.href=url;a.download=`rivals-series-${seriesData.version}-candidate-${active+1}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main>
    <header><a href="/">R<span>·</span> RIVALS DECK</a><span className="pill">개발 데모 · 실제 덱 변경 없음</span></header>
    <section className="hero"><div><p className="eyebrow">RIVAL SERIES / NOVEMBER 2026</p><h1>이번 달의 조합을<br/>한눈에 찾아보세요.</h1><p>11월 19일 11시 적용 · 2026 시즌 18차 Live 업데이트</p><a href={seriesData.sources[0].url} target="_blank" rel="noreferrer">공식 업데이트 공지 ↗</a></div><div className="target"><span>목표 OVR 버프</span><div><strong>19<small>전체</small></strong><b>/</b><strong>4<small>타자</small></strong><b>/</b><strong>5<small>투수</small></strong></div><p>달성 판정 준비 중</p></div></section>
    <aside className="notice"><strong>공식 선수 명단으로 구성하는 검토용 후보입니다.</strong><p>현행 버프 조건표가 확인되지 않아 19/4/5 달성 여부는 아직 계산하지 않습니다. 이번 데모는 타자 9명·보관 타자 5명·선발 5명·중계 6명·마무리 1명의 26인 구성을 가정합니다. 실제 편성 및 보관 슬롯 규칙 확인이 필요합니다.</p></aside>
    <section className="panel controls"><div><h2>조합 탐색</h2><p>구단별 3명 이상인 묶음, Pick 인원, S등급 인원을 우선해 후보 3개를 찾습니다.</p></div><div className="inputs"><label>포함할 구단<select value={team} onChange={e=>setTeam(e.target.value)}><option value="">전체 구단에서 탐색</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label><label className="check"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/>마무리(CP)의 중계 배치 허용<small>게임 내 허용 여부 미확인 · 실험 옵션</small></label><button onClick={search} disabled={busy}>{busy?'조합 찾는 중…':'새 조합 찾기'}</button></div>{dirty&&<p role="status">조건이 바뀌었습니다. ‘새 조합 찾기’를 눌러 반영하세요.</p>}</section>
    <div className="workspace"><section className="panel result"><div className="title"><div><p className="eyebrow">LINEUP CANDIDATES</p><h2>추천 구성 살펴보기</h2></div><button className="secondary" onClick={download} disabled={!lineup.length}>조합 저장</button></div><div className="tabs" role="tablist" aria-label="조합 후보">{results.map((r,i)=><button key={i} role="tab" aria-selected={active===i} onClick={()=>setActive(i)}>조합 {i+1}<small>Pick {summarize(r).pick} · S {summarize(r).s}</small></button>)}</div>{!lineup.length?<p role="status">이번 탐색 범위에서 완성된 후보를 찾지 못했습니다. 조건을 바꿔 다시 탐색하세요. 전체 조합의 불가능을 의미하지 않습니다.</p>:<><p className="caption">{run.team?`${run.team} 포함 · `:''}{run.allow?'CP 중계 배치를 허용한 실험 구성':'공식 포지션에 맞춘 구성'} · 버프 달성 미검증</p><div className="roster">{['주전 타자','선발 투수','불펜','보관 타자'].map((group,index)=><div className="group" key={group}><h3>{group}</h3>{lineup.filter(x=>index===0?!/^(SP|RP|CP|보관)/.test(x.slot):index===1?x.slot.startsWith('SP'):index===2?/^(RP|CP)/.test(x.slot):x.slot.startsWith('보관')).map(({slot,player:p})=><div className="player" key={slot}><span className="position">{slot}</span><div><strong>{p.noticeName || p.name}</strong><small>{p.team} · {p.grade?`${p.grade}등급`:'등급 미확인'} · {p.positions.join('/')}{slot.startsWith('RP')&&p.positions.includes('CP')?' → RP 실험 배치':''}</small></div><span className={p.pick?'pick':'live'}>{p.pick?'PICK':'LIVE'}</span></div>)}</div>)}</div></>}</section>
    <aside className="panel summary"><p className="eyebrow">COMPOSITION</p><h2>구성 조건 확인</h2><dl><div><dt>등록 선수</dt><dd>{lineup.length} / 26</dd></div><div><dt>Live 카드</dt><dd>{counts.live}명</dd></div><div><dt>Rival Pick</dt><dd>{counts.pick}명</dd></div><div><dt>S등급 / A등급</dt><dd>{counts.s} / {counts.a}명</dd></div><div><dt>등급 미확인</dt><dd>{counts.unknownGrade}명</dd></div><div><dt>3명 이상 구단</dt><dd>{counts.teamsOfThree}개</dd></div></dl><h3>구단별 인원</h3>{Object.entries(counts.byTeam).sort(([a],[b])=>a.localeCompare(b)).map(([t,n])=><div className="teamrow" key={t}><span>{t}</span><div><i style={{width:`${Math.min(100,n/6*100)}%`}}/></div><b>{n}명</b></div>)}<div className="pending"><strong>전체 — / 타자 — / 투수 —</strong><p>구단·Live·Pick·등급의 최신 누적 규칙 확인 후 버프 합계를 연결합니다.</p></div></aside></div>
    <section className="panel"><div className="title"><div><p className="eyebrow">OFFICIAL RIVAL PICKS</p><h2>이번 업데이트의 Pick 60명</h2><p>공지 OVR은 Pick 효과가 이미 포함된 값입니다. 육성 후 최종 능력치가 아닙니다.</p></div><label>선수·구단·포지션 검색<input placeholder="예: LAD, 투수는 CP 또는 RP" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><p className="caption">검색 결과 {picks.length}명</p><div className="pickgrid">{picks.map(p=><article key={p.id}><small>{p.team} · {p.positions.join('/')} · {p.grade || '등급 미확인'}</small><strong>{p.noticeName}</strong><span>OVR <b>{p.ovr}</b></span></article>)}</div></section>
    <details className="panel"><summary>출처와 데모 범위</summary><p>공식 확률표 Live 카드 {players.length}개 중 축약 이름으로 포지션을 식별하지 못한 {seriesData.excludedFromSearch.length}개는 탐색에서 제외했습니다. S / A는 해당 날짜 팩 목록에서 확인한 등급이며 미확인 등급은 추정하지 않습니다.</p><p>160번의 제한된 후보 탐색입니다. 최적 조합이나 19/4/5 달성을 보장하지 않습니다. 시즌 카드·보유 카드·현재 덱과 교체 비교·고정 선수·최종 OVR 순위는 아직 지원하지 않습니다.</p><p>현재 서버 저장 및 운영 DB 연결은 없습니다. ‘조합 저장’은 이 기기에 JSON 파일을 내려받습니다.</p><ul>{seriesData.sources.map(s=><li key={s.file}><a href={s.url} target="_blank" rel="noreferrer">{s.file==='notice-18460.html'?'공식 Live 업데이트':s.file} ↗</a></li>)}</ul><a href="https://community.withhive.com/MLB9IRIVALS/ko/board/23/6480" target="_blank" rel="noreferrer">라이벌 시리즈 공식 가이드 (2024년 자료 · 현행 조건 확인 필요) ↗</a></details>
    <footer>RIVALS DECK · 월별 라인업 연구실 · 2026.11.19 개발 데모</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
