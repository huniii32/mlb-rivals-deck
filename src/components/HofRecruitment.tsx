import {useEffect,useMemo,useRef,useState} from 'react';
import {HOF_DATA,HOF_PLAYERS,emptyHofStats,hofGoalProbability,hofGoalStats,runHofChunk,validHofSession,type HofSession,type HofStats} from '../lib/hofRecruitment';
import {browserRandom} from '../lib/skillSimulator';
import {readSession,saveSession} from '../lib/simulatorSession';
const nf=new Intl.NumberFormat('ko-KR');
const byId=new Map(HOF_PLAYERS.map(p=>[p.id,p]));
const snapshot=(s:HofStats):HofStats=>({...s,counts:{...s.counts},first:{...s.first},recent:[...s.recent]});
export default function HofRecruitment(){
  const [saved]=useState(()=>readSession<HofSession>('hof-recruitment',validHofSession));
  const [stats,setStats]=useState<HofStats>(saved?.stats??emptyHofStats);
  const [targets,setTargets]=useState<string[]>(saved?.targets??[]);
  const [limit,setLimit]=useState(saved?.limit??'1000');
  const [query,setQuery]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState(false);
  const controller=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{setSaveError(!saveSession('hof-recruitment',{source:HOF_DATA.source.sha256,targets,limit,stats}));},[targets,limit,stats]);
  const selected=useMemo(()=>new Set(targets),[targets]);
  const probability=hofGoalProbability(targets),goal=hofGoalStats(stats,targets);
  const last=stats.recent[0]?byId.get(stats.recent[0].id):null;
  const search=query.replace(/\s+/g,'').toLocaleLowerCase();
  const shown=HOF_PLAYERS.filter(p=>`${p.name}${p.enName}`.replace(/\s+/g,'').toLocaleLowerCase().includes(search));
  const maximum=Number(limit),valid=limit.trim()!==''&&Number.isInteger(maximum)&&maximum>=1&&maximum<=100000;
  function toggle(id:string){if(controller.current)return;setTargets(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);setMessage('');}
  function reset(){if(controller.current)return;setStats(emptyHofStats());setMessage('추첨 기록을 초기화했습니다. 희망 선수 설정은 유지됩니다.');}
  async function draw(count:number){
    if(controller.current||!Number.isInteger(count)||count<1||count>100000)return;
    const abort=new AbortController();controller.current=abort;setBusy(true);setMessage('');
    const next=snapshot(stats);let done=0,hit=false;
    try{
      const random=browserRandom();
      while(done<count&&!abort.signal.aborted&&!hit){
        const result=runHofChunk(next,Math.min(200,count-done),targets,random);done+=result.done;hit=result.hit;
        if(mounted.current)setStats(snapshot(next));
        if(done<count&&!hit)await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      if(mounted.current)setMessage(`${hit?'희망 선수 등장! ':''}이번 실행 ${nf.format(done)}회 · 누적 ${nf.format(next.total)}회${abort.signal.aborted?' · 중지됨':''}`);
    }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'추첨을 실행하지 못했습니다.');}
    finally{controller.current=null;if(mounted.current)setBusy(false);}
  }
  return <section className="hof-recruitment" aria-label="일반 명예의 전당 영입 시뮬레이터">
    {saveError&&<p className="sim-error" role="alert">이 브라우저에 영입 기록을 저장하지 못했습니다.</p>}
    <div className="card sim-setup">
      <div className="sim-heading"><div><h2>일반 명예의 전당 영입</h2><p className="muted">공식 일반 영입 명단 {HOF_PLAYERS.length}명 · HOF 선수 1명 획득</p></div><span className="hof-badge">HALL OF FAME</span></div>
      <p className="sim-small muted">재료 등록을 마쳤다고 가정한 선수 추첨입니다. 반복 실행은 확률 실험이며 실제 게임의 월간 제한·재료 소모는 적용하지 않습니다.</p>
      <div className="hof-goal-info"><b>희망 선수 {targets.length}명</b><span>{targets.length?`1회 등장 확률 ${(probability*100).toFixed(6)}%`:'아래 명단에서 희망 선수를 선택하면 등장한 회차에서 멈춥니다.'}</span></div>
      {targets.length>0&&<div className="hof-wishes">{HOF_PLAYERS.filter(p=>selected.has(p.id)).map(p=><button key={p.id} disabled={busy} onClick={()=>toggle(p.id)} aria-label={`${p.name} 희망 해제`}>{p.name} ×</button>)}<button disabled={busy} onClick={()=>setTargets([])}>선택 해제</button></div>}
    </div>
    <div className="card sim-stats hof-stats">
      <div><span>총 영입</span><strong>{nf.format(stats.total)}<small>회</small></strong></div>
      <div><span>획득한 선수</span><strong>{Object.keys(stats.counts).length}<small> / {HOF_PLAYERS.length}명</small></strong></div>
      <div><span>희망 선수 획득</span><strong>{targets.length?nf.format(goal.hits):'—'}<small>{targets.length?'회':''}</small></strong></div>
      <div><span>첫 희망 선수</span><strong>{goal.first===null?'—':nf.format(goal.first)}<small>{goal.first===null?'':'회차'}</small></strong></div>
    </div>
    <div className="card hof-play">
      <div className={`hof-result${last&&selected.has(last.id)?' is-goal':''}`} aria-live="polite">
        <span className="hof-result-seal">HOF</span>
        <span className="muted">{last?`${nf.format(stats.total)}회차 영입 결과`:'다음 명예의 전당 선수는?'}</span>
        <strong>{last?.name??'영입을 시작해 보세요'}</strong>
        <span>{last?.enName??'일반 영입 대상 선수 중 1명이 등장합니다.'}</span>
        {last&&<small>{selected.has(last.id)?'희망 선수 획득 · ':''}누적 {nf.format(stats.counts[last.id])}회 획득</small>}
      </div>
      <div className="hof-actions">
        <div className="row"><button className="primary" disabled={busy} onClick={()=>void draw(1)}>1회 영입</button><button disabled={busy} onClick={()=>void draw(10)}>10회</button><button disabled={busy} onClick={()=>void draw(100)}>100회</button>{busy&&<button onClick={()=>controller.current?.abort()}>중지</button>}</div>
        <div className="sim-target-row"><label>최대 <input aria-label="HOF 최대 영입 횟수" type="number" min="1" max="100000" value={limit} disabled={busy} onChange={e=>setLimit(e.target.value)}/> 회</label><button disabled={busy||!valid||!targets.length} onClick={()=>void draw(maximum)}>희망 선수 나올 때까지</button></div>
        {!valid&&<p className="sim-error">횟수는 1~100,000의 정수로 입력하세요.</p>}
        <p className="sim-small muted">희망 선수를 고르면 10회·100회 실행도 처음 등장한 회차에 멈춥니다. 선택하지 않으면 요청한 횟수만큼 진행합니다.</p>
        <div className="sim-message" role="status">{busy?`${nf.format(stats.total)}회까지 진행 중…`:message||'희망 선수를 고르거나 바로 1회 영입을 눌러 보세요.'}</div>
      </div>
    </div>
    <div className="card hof-roster">
      <div className="sim-heading"><h3>선수 명단 · 희망 선수 선택</h3><input aria-label="HOF 선수 검색" placeholder="선수 이름 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <p className="sim-small muted">명단 검색은 표시만 바꿉니다. 전체 {HOF_PLAYERS.length}명의 추첨 확률은 유지됩니다.</p>
      <div className="hof-roster-grid">{shown.map(p=><button key={p.id} className={`hof-roster-player${selected.has(p.id)?' selected':''}`} aria-pressed={selected.has(p.id)} aria-label={`${p.name} 희망 선수`} disabled={busy} onClick={()=>toggle(p.id)}><strong>{p.name}</strong><span>{p.enName}</span><small>{p.rate}% · 획득 {stats.counts[p.id]??0}회</small><b>{selected.has(p.id)?'✓ 희망 선수':'＋ 희망 추가'}</b></button>)}</div>
      {!shown.length&&<p className="muted">검색 결과가 없습니다.</p>}
    </div>
    <details className="card"><summary>최근 영입 기록 · 상세 통계</summary>
      <p className="muted">희망 선수 통계는 선택한 선수의 전체 영입 기록을 기준으로 계산합니다. 같은 선수가 여러 번 나올 수 있습니다.</p>
      {probability>0&&<p className="sim-small">희망 선수 첫 등장까지 이론상 평균 {(1/probability).toFixed(2)}회 · 10회 안에 등장할 확률 {((1-(1-probability)**10)*100).toFixed(2)}% · 100회 안에 {((1-(1-probability)**100)*100).toFixed(2)}%</p>}
      {stats.recent.map(r=><div className="sim-history" key={r.number}><b>{nf.format(r.number)}회차</b><span>{byId.get(r.id)!.name} · {byId.get(r.id)!.enName}</span></div>)}
      {!stats.total&&<p className="muted">아직 영입 기록이 없습니다.</p>}
      <button disabled={busy||!stats.total} onClick={reset}>영입 기록 초기화</button>
    </details>
    <details className="card sim-sources"><summary>공식 확률 · 시뮬레이션 기준</summary>
      <p>{HOF_DATA.asOf} 개별 확률표 기준, {HOF_DATA.checkedAt} 확인. 일반 영입 전용 표의 {HOF_PLAYERS.length}명만 사용합니다. 특별 영입 및 다른 HOF팩은 포함하지 않습니다.</p>
      <p>개요 표는 선수별 동일 확률(1/n)을 안내합니다. 시뮬레이터는 개별 표에 표시된 소수점 6자리 확률을 그대로 사용합니다. 합계는 100%이며 마지막 선수의 표시값에는 합계 보정이 포함돼 있습니다.</p>
      <p>공식 안내의 일반 영입은 월 1회이며 계정 한정 영입은 별도입니다. 여기서는 같은 명단으로 독립 추첨을 반복하고, 재료 등록·재료 조건 재설정·계정 한정 비용·월별 경과를 재현하지 않습니다. 반복 횟수는 실제 이용 가능한 영입 횟수가 아닙니다.</p>
      <div className="row"><a href={HOF_DATA.source.url} target="_blank" rel="noreferrer">일반 영입 선수별 확률표</a><a href={HOF_DATA.overview} target="_blank" rel="noreferrer">공식 확률 안내</a><a href={HOF_DATA.guide} target="_blank" rel="noreferrer">HOF 영입 방식 안내</a></div>
    </details>
  </section>;
}
