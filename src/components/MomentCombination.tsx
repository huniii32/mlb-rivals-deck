import { useEffect, useMemo, useRef, useState } from "react";
import { browserRandom } from "../lib/skillSimulator";
import { shuffleCandidates, pickCombination } from "../lib/momentCombination";
import { TEAMS, LEAGUES, DIVISIONS, PROTECTED_RATES, ROSTER_METADATA, createProtectedCombination, rosterForScope, scopeLabel, themeLabel, teamLabel, type CombinationPlayer, type CombinationScope, type Team, type Division, type League } from "../lib/combinationRoster";
const nf = new Intl.NumberFormat("ko-KR");
const gradeLabel=(grade:CombinationPlayer['grade'])=>grade==='supreme'?'슈프림 모먼트':'모먼트';
interface History { number:number; chosen:CombinationPlayer; candidates:CombinationPlayer[] }
interface Stats { total:number; supreme:number; first:number|null; candidatesWithSupreme:number; recent:History[] }
const empty = ():Stats => ({total:0,supreme:0,first:null,candidatesWithSupreme:0,recent:[]});
export default function MomentCombination() {
  const [scope,setScope]=useState<CombinationScope>({type:'all'});
  const [stats,setStats]=useState<Stats>(empty);
  const [candidates,setCandidates]=useState<CombinationPlayer[]>([]);
  const [phase,setPhase]=useState<'idle'|'preview'|'pick'|'result'>('idle');
  const [selected,setSelected]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [limit,setLimit]=useState('1000');
  const [message,setMessage]=useState('');
  const [listGrade,setListGrade]=useState<'supreme'|'moment'>('supreme');
  const [query,setQuery]=useState('');
  const [listLimit,setListLimit]=useState(50);
  const controller=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  const pool=useMemo(()=>rosterForScope(scope),[scope]);
  const supremeCount=pool.filter(p=>p.grade==='supreme').length;
  const displayed=pool.filter(p=>p.grade===listGrade&&`${p.name} ${p.enName} ${p.theme} ${themeLabel(p.theme)} ${p.team} ${teamLabel(p.team)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selecting=phase==='preview'||phase==='pick';
  const count=Number(limit),valid=limit.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=100000;
  function reset(){setStats(empty());setCandidates([]);setPhase('idle');setSelected(null);setMessage('');}
  function changeScope(next:CombinationScope){setScope(next);setListLimit(50);reset();}
  function record(next:Stats, board:CombinationPlayer[], chosen:CombinationPlayer){
    next.total++;
    if(chosen.grade==='supreme'){next.supreme++;next.first??=next.total;}
    if(board.some(p=>p.grade==='supreme'))next.candidatesWithSupreme++;
    next.recent=[{number:next.total,chosen,candidates:board},...next.recent].slice(0,8);
  }
  function finish(slot:number){
    const chosen=candidates[slot];
    const next={...stats,recent:[...stats.recent]};record(next,candidates,chosen);setStats(next);setSelected(slot);setPhase('result');
    setMessage(`${gradeLabel(chosen.grade)} · ${chosen.name} (${chosen.team} · ${themeLabel(chosen.theme)}) 획득`);
  }
  function start(){
    setCandidates(createProtectedCombination(scope)());setSelected(null);setPhase('preview');setMessage('선수와 테마를 확인한 뒤 섞고 1장을 선택하세요.');
  }
  async function batch(n:number){
    if(controller.current||selecting||!Number.isInteger(n)||n<1||n>100000)return;
    const abort=new AbortController();controller.current=abort;setBusy(true);setMessage('');
    const next={...stats,recent:[...stats.recent]};let done=0,found=false;
    try {
      const random=browserRandom(),draw=createProtectedCombination(scope,random);
      while(done<n&&!abort.signal.aborted&&!found){
        const chunk=Math.min(200,n-done);
        for(let i=0;i<chunk;i++){
          const board=draw(),pick=pickCombination(board,random);
          record(next,board,pick.chosen);done++;found=pick.chosen.grade==='supreme';
          if(mounted.current){setCandidates(board);setSelected(pick.slot);setPhase('result');}
          if(found)break;
        }
        if(mounted.current)setStats({...next,recent:[...next.recent]});
        if(done<n&&!found)await new Promise<void>(r=>setTimeout(r,0));
      }
      if(mounted.current)setMessage(`${found?'슈프림 모먼트 획득! ':''}이번 실행 ${nf.format(done)}회 · 재료 ${nf.format(done*3)}장 · 등급 보호권 ${nf.format(done)}장${scope.type==='all'?'':` · ${scope.type==='team'?'구단':scope.type==='division'?'지구':'리그'} 확정권 ${nf.format(done)}장`}${abort.signal.aborted?' · 중지됨':''}`);
    } catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'조합을 실행하지 못했습니다.');}
    finally {controller.current=null;if(mounted.current)setBusy(false);}
  }
  return <section className="moment-combination" aria-label="슈프림 모먼트 조합 시뮬레이터">
    <div className="card sim-setup">
      <div className="sim-heading"><h2>슈프림 모먼트 조합</h2><small className="muted">등급 보호권 사용 기준</small></div>
      <p className="combo-premise">모먼트 재료 1장 + 나머지 재료 2장 · 등급 보호권 1장 필수</p>
      <div className="sim-settings">
        <label>확정권<select aria-label="조합 확정권" disabled={busy||selecting} value={scope.type} onChange={e=>changeScope(e.target.value==='all'?{type:'all'}:e.target.value==='team'?{type:'team',value:'NYY'}:e.target.value==='division'?{type:'division',value:'ALE'}:{type:'league',value:'AL'})}><option value="all">사용 안 함 · 전체 구단</option><option value="team">구단 확정권</option><option value="division">지구 확정권</option><option value="league">리그 확정권</option></select></label>
        {scope.type==='team'&&<label>구단<select aria-label="조합 구단" disabled={busy||selecting} value={scope.value} onChange={e=>changeScope({type:'team',value:e.target.value as Team})}>{TEAMS.map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label>}
        {scope.type==='division'&&<label>지구<select aria-label="조합 지구" disabled={busy||selecting} value={scope.value} onChange={e=>changeScope({type:'division',value:e.target.value as Division})}>{Object.entries(DIVISIONS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
        {scope.type==='league'&&<label>리그<select aria-label="조합 리그" disabled={busy||selecting} value={scope.value} onChange={e=>changeScope({type:'league',value:e.target.value as League})}>{Object.entries(LEAGUES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
      </div>
      <div className="combo-rates"><span>슈프림 모먼트 <b>{PROTECTED_RATES.supreme}%</b></span><span>모먼트 <b>{PROTECTED_RATES.moment}%</b></span><span>{scopeLabel(scope)} · 슈프림 {nf.format(supremeCount)} / 모먼트 {nf.format(pool.length-supremeCount)} 카드</span></div>
    </div>
    <div className="sim-stats" aria-label="조합 통계">
      <div><span>조합 횟수</span><strong>{nf.format(stats.total)}<small>회</small></strong></div>
      <div><span>사용 재료</span><strong>{nf.format(stats.total*3)}<small>장</small></strong></div>
      <div><span>슈프림 획득</span><strong>{nf.format(stats.supreme)}<small>장</small></strong></div>
      <div><span>첫 슈프림 획득</span><strong>{stats.first??'—'}<small>회째</small></strong></div>
    </div>
    <div className="card sim-play">
      <div className="combo-candidates" aria-label="조합 후보 5장">{Array.from({length:5},(_,i)=>{
        const hidden=phase==='pick',player=candidates[i];
        return <button key={i} className={`combo-card ${hidden?'is-hidden':player?.grade==='supreme'?'is-supreme':''} ${selected===i?'is-selected':''}`} disabled={phase!=='pick'||busy} aria-label={hidden?`${i+1}번 후보 선택`:`${i+1}번 후보 ${player?`${gradeLabel(player.grade)} ${player.name} ${player.team} ${themeLabel(player.theme)}`:'대기'}`} onClick={()=>finish(i)}>
          <span>{i+1}{!hidden&&player?` · ${player.team}`:''}</span>
          <strong>{hidden?'?':player?player.name:'대기'}</strong>
          {!hidden&&player&&<><span className="combo-player-theme">{themeLabel(player.theme)}</span><small>{gradeLabel(player.grade)}</small></>}
          <small>{selected===i?'획득':hidden?'선택하기':phase==='preview'?'후보':''}</small>
        </button>;
      })}</div>
      <div className="sim-actions">
        {phase==='preview'?<button className="primary" onClick={()=>{setCandidates(shuffleCandidates(candidates));setPhase('pick');setMessage('카드를 섞었습니다. 뒤집힌 5장 중 1장을 선택하세요.');}}>섞고 선택하기</button>:phase==='pick'?<p className="muted">뒤집힌 카드 1장을 선택하세요.</p>:<>
          <div className="row sim-run-buttons"><button className="primary" disabled={busy} onClick={start}>1회 조합</button><button disabled={busy} onClick={()=>void batch(10)}>10회</button><button disabled={busy} onClick={()=>void batch(100)}>100회</button><button disabled={busy||!stats.total} onClick={reset}>기록 초기화</button>{busy&&<button className="sim-stop" onClick={()=>controller.current?.abort()}>중지</button>}</div>
          <div className="sim-bulk row"><label>최대 <input aria-label="조합 최대 횟수" type="number" min="1" max="100000" disabled={busy} value={limit} onChange={e=>setLimit(e.target.value)}/> 회</label><button disabled={busy||!valid} onClick={()=>void batch(count)}>슈프림 나올 때까지</button></div>
          {!valid&&<p className="sim-error">횟수는 1~100,000의 정수로 입력하세요.</p>}
        </>}
        <p className="sim-small muted">일괄 실행은 5장 중 무작위로 1장을 선택하며, 슈프림 획득 시 중단합니다.</p>
        <div className="sim-message" role="status">{busy?`${nf.format(stats.total)}회 진행 중…`:message||'확정권 범위를 고른 뒤 조합을 시작하세요.'}</div>
      </div>
    </div>
    <details className="card combo-roster"><summary>선수 명단 · {scopeLabel(scope)}</summary>
      <div className="sim-target-row"><label>등급<select aria-label="조합 선수 명단 등급" value={listGrade} onChange={e=>{setListGrade(e.target.value as typeof listGrade);setListLimit(50);}}><option value="supreme">슈프림 모먼트</option><option value="moment">모먼트</option></select></label><input aria-label="조합 선수 검색" placeholder="선수·테마·구단 검색" value={query} onChange={e=>{setQuery(e.target.value);setListLimit(50);}}/></div>
      <p className="muted">공식 명단 {ROSTER_METADATA.asOf} 기준 · {nf.format(displayed.length)}개 카드 항목</p>
      <div className="combo-roster-list">{displayed.slice(0,listLimit).map(p=><div key={p.id}><b>{p.name}</b><span>{p.team} · {themeLabel(p.theme)}</span></div>)}</div>
      {!displayed.length&&<p className="muted">해당 조건의 선수가 없습니다.</p>}
      {displayed.length>listLimit&&<button onClick={()=>setListLimit(n=>n+50)}>50개 더 보기</button>}
    </details>
    <details className="card"><summary>조합 기록 · 상세 통계</summary>
      <p className="muted">등급 보호권 {nf.format(stats.total)}장{scope.type!=='all'?` · ${scopeLabel(scope)} 확정권 ${nf.format(stats.total)}장`:''} · 후보에 슈프림 포함 {stats.candidatesWithSupreme}회 · 실제 획득 {stats.supreme}회</p>
      {stats.recent.map(r=><div className="sim-history" key={r.number}><b>{r.number}회 · {gradeLabel(r.chosen.grade)}</b><span>{r.chosen.name} · {r.chosen.team} · {themeLabel(r.chosen.theme)}</span></div>)}
    </details>
    <details className="card sim-sources"><summary>명단 출처 · 시뮬레이션 기준</summary>
      <p>모먼트 1장 + 나머지 재료 2장 + 등급 보호권 사용을 전제로 합니다. 보호권 사용 시 슈프림 15%·모먼트 85%는 사용자의 게임 확인값입니다. 확정권은 카드의 구단·지구·리그 범위를 제한하며 등급 확률은 유지합니다.</p>
      <p>후보 5장은 독립 추첨합니다. 후보에 슈프림이 한 장 이상 나올 확률은 55.63%, 뒤집힌 후보 중 고른 1장이 슈프림일 확률은 15%입니다. 같은 카드가 후보에 여러 번 나올 수 있습니다.</p>
      <p>공식 현재 조합 명단과 구단·테마별 명단을 대조했습니다. 과거 슈프림 명단 중 현재 조합 대상에서 빠진 6개 항목은 제외했습니다. 이름과 테마는 공식 명단 표기를 사용하며, 일반 모먼트 테마는 영문 엠블럼명으로 표시합니다. 같은 선수라도 구단·테마가 다르면 별도 카드입니다.</p>
      <p>등급을 뽑은 뒤 선택 범위 안의 해당 등급 카드 항목을 균등 추첨합니다. 개별 카드의 결합 확률은 공식 조합 표에 없어 이 부분은 시뮬레이션 가정입니다. 매회 새 재료·보호권·선택한 확정권을 사용하며 결과 카드를 재사용하지 않습니다. 월간 무료 기회는 반영하지 않습니다.</p>
      <div className="row">{ROSTER_METADATA.sources.map(s=><a key={s.key} href={s.url} target="_blank" rel="noreferrer">{s.key==='combination'?'현재 조합 대상':s.key==='moment-team-theme'?'모먼트 구단·테마':`슈프림 ${s.key}`}</a>)}</div>
      <p><a href="https://community.withhive.com/MLB9IRIVALS/ko/board/9/16627" target="_blank" rel="noreferrer">조합·확정권 공식 안내</a></p>
    </details>
  </section>;
}
