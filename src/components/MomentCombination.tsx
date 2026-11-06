import { useEffect, useRef, useState } from "react";
import { browserRandom } from "../lib/skillSimulator";
import { MATERIALS, RESULTS, GRADE_ORDER, COMBINATION_SOURCE, combinationRates, drawCombinationCandidates, shuffleCandidates, pickCombination, hasSpecialCandidate, type Material, type CombinationGrade } from "../lib/momentCombination";
const nf = new Intl.NumberFormat("ko-KR");
interface History { number:number; chosen:CombinationGrade; candidates:CombinationGrade[] }
interface Stats { total:number; supreme:number; first:number|null; candidatesWithSupreme:number; recent:History[]; grades:Partial<Record<CombinationGrade,number>> }
const empty = ():Stats => ({total:0,supreme:0,first:null,candidatesWithSupreme:0,recent:[],grades:{}});
export default function MomentCombination() {
  const [materials,setMaterials]=useState<Material[]>(['moment','moment','moment']);
  const [stats,setStats]=useState<Stats>(empty);
  const [candidates,setCandidates]=useState<CombinationGrade[]>([]);
  const [phase,setPhase]=useState<'idle'|'preview'|'pick'|'result'>('idle');
  const [selected,setSelected]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [limit,setLimit]=useState('1000');
  const [message,setMessage]=useState('');
  const controller=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  const rates=combinationRates(materials);
  const selecting=phase==='preview'||phase==='pick';
  const count=Number(limit),valid=limit.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=100000;
  function reset(){setStats(empty());setCandidates([]);setPhase('idle');setSelected(null);setMessage('');}
  function record(next:Stats, board:CombinationGrade[], chosen:CombinationGrade){
    next.total++;
    if(chosen==='supreme'){next.supreme++;next.first??=next.total;}
    if(board.includes('supreme'))next.candidatesWithSupreme++;
    next.grades[chosen]=(next.grades[chosen]??0)+1;
    next.recent=[{number:next.total,chosen,candidates:board},...next.recent].slice(0,8);
  }
  function finish(slot:number, board=candidates){
    const next={...stats,grades:{...stats.grades},recent:[...stats.recent]};record(next,board,board[slot]);setStats(next);setSelected(slot);setPhase('result');
    setMessage(`${RESULTS[board[slot]]} 획득 · 이번 조합 재료 3장 사용`);
  }
  function start(){
    const random=browserRandom();const board=drawCombinationCandidates(materials,random);setCandidates(board);setSelected(null);
    if(hasSpecialCandidate(board)){setPhase('preview');setMessage('후보를 확인한 뒤 섞고 1장을 선택하세요.');}
    else {finish(pickCombination(board,random).slot,board);}
  }
  async function batch(n:number){
    if(controller.current||selecting||!Number.isInteger(n)||n<1||n>100000)return;
    const abort=new AbortController();controller.current=abort;setBusy(true);setMessage('');
    const next={...stats,grades:{...stats.grades},recent:[...stats.recent]};let done=0,found=false;
    try {
      const random=browserRandom();
      while(done<n&&!abort.signal.aborted&&!found){
        const chunk=Math.min(200,n-done);
        for(let i=0;i<chunk;){
          // Each round draws five candidates and blindly selects one, never the best grade.
          const board=drawCombinationCandidates(materials,random),pick=pickCombination(board,random);
          record(next,board,pick.chosen);done++;i++;found=pick.chosen==='supreme';
          if(mounted.current){setCandidates(board);setSelected(pick.slot);setPhase('result');}
          if(found)break;
        }
        if(mounted.current)setStats({...next,grades:{...next.grades},recent:[...next.recent]});
        if(done<n&&!found)await new Promise<void>(r=>setTimeout(r,0));
      }
      if(mounted.current)setMessage(`${found?'슈프림 모먼트 획득! ':''}이번 실행 ${nf.format(done)}회 · 재료 ${nf.format(done*3)}장 사용${abort.signal.aborted?' · 중지됨':''}`);
    } finally {controller.current=null;if(mounted.current)setBusy(false);}
  }
  return <section className="moment-combination" aria-label="슈프림 모먼트 조합 시뮬레이터">
    <div className="card sim-setup">
      <div className="sim-heading"><h2>슈프림 모먼트 조합</h2><small className="muted">재료 3장 → 카드 1장</small></div>
      <div className="sim-settings">{materials.map((m,i)=><label key={i}>재료 {i+1}<select aria-label={`조합 재료 ${i+1}`} value={m} disabled={busy||selecting} onChange={e=>{setMaterials(previous=>previous.map((v,j)=>j===i?e.target.value as Material:v));reset();}}>{Object.entries(MATERIALS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>)}</div>
      <div className="combo-rates">{GRADE_ORDER.filter(g=>rates[g]>0).map(g=><span key={g}>{RESULTS[g]} <b>{rates[g]}%</b></span>)}</div>
    </div>
    <div className="sim-stats" aria-label="조합 통계">
      <div><span>조합 횟수</span><strong>{nf.format(stats.total)}<small>회</small></strong></div>
      <div><span>사용 재료</span><strong>{nf.format(stats.total*3)}<small>장</small></strong></div>
      <div><span>슈프림 획득</span><strong>{nf.format(stats.supreme)}<small>장</small></strong></div>
      <div><span>첫 슈프림 획득</span><strong>{stats.first??'—'}<small>회째</small></strong></div>
    </div>
    <div className="card sim-play">
      <div className="combo-candidates" aria-label="조합 후보 5장">{Array.from({length:5},(_,i)=>{
        const hidden=phase==='pick',grade=candidates[i];
        return <button key={i} className={`combo-card ${hidden?'is-hidden':grade==='supreme'?'is-supreme':''} ${selected===i?'is-selected':''}`} disabled={phase!=='pick'||busy} aria-label={hidden?`${i+1}번 후보 선택`:`${i+1}번 후보 ${grade?RESULTS[grade]:'대기'}`} onClick={()=>finish(i)}><span>{i+1}</span><strong>{hidden?'?':grade?RESULTS[grade]:'대기'}</strong><small>{selected===i?'획득':hidden?'선택하기':phase==='preview'?'후보':''}</small></button>;
      })}</div>
      <div className="sim-actions">
        {phase==='preview'?<button className="primary" onClick={()=>{setCandidates(shuffleCandidates(candidates));setPhase('pick');setMessage('카드를 섞었습니다. 뒤집힌 5장 중 1장을 선택하세요.');}}>섞고 선택하기</button>:phase==='pick'?<p className="muted">뒤집힌 카드 1장을 선택하세요.</p>:<>
          <div className="row sim-run-buttons"><button className="primary" disabled={busy} onClick={start}>1회 조합</button><button disabled={busy} onClick={()=>void batch(10)}>10회</button><button disabled={busy} onClick={()=>void batch(100)}>100회</button><button disabled={busy||!stats.total} onClick={reset}>기록 초기화</button>{busy&&<button className="sim-stop" onClick={()=>controller.current?.abort()}>중지</button>}</div>
          <div className="sim-bulk row"><label>최대 <input aria-label="조합 최대 횟수" type="number" min="1" max="100000" disabled={busy} value={limit} onChange={e=>setLimit(e.target.value)}/> 회</label><button disabled={busy||!valid||rates.supreme===0} onClick={()=>void batch(count)}>슈프림 나올 때까지</button></div>
        </>}
        {rates.supreme===0&&<p className="muted">슈프림을 획득하려면 모먼트 재료가 1장 이상 필요합니다.</p>}
        <p className="sim-small muted">일괄 실행은 5장 중 무작위로 1장을 선택하며, 슈프림 획득 시 중단합니다.</p>
        <div className="sim-message" role="status">{busy?`${nf.format(stats.total)}회 진행 중…`:message||'재료를 고른 뒤 조합을 시작하세요.'}</div>
      </div>
    </div>
    <details className="card"><summary>조합 기록 · 상세 통계</summary><p className="muted">후보에 슈프림 포함 {stats.candidatesWithSupreme}회 · 실제 획득 {stats.supreme}회 · 관측 획득 비율 {stats.total?(stats.supreme/stats.total*100).toFixed(2):'—'}%</p>{stats.recent.map(r=><div className="sim-history" key={r.number}><b>{r.number}회 · {RESULTS[r.chosen]} 획득</b><span className="muted">후보: {r.candidates.map(g=>RESULTS[g]).join(' / ')}</span></div>)}</details>
    <details className="card sim-sources"><summary>공식 확률 · 조합 기준</summary>
      <p>{GRADE_ORDER.filter(g=>rates[g]>0).map(g=>`${RESULTS[g]} ${rates[g]}%`).join(' · ')}</p>
      <p>재료별 확률을 더한 뒤 높은 등급부터 100%까지 배정합니다. 5장은 독립 추첨하며, 섞은 뒤 1장을 고릅니다. 후보에 슈프림이 한 장 이상 나올 확률은 {(100*(1-(1-rates.supreme/100)**5)).toFixed(2)}%, 실제 선택 카드의 슈프림 확률은 {rates.supreme}%입니다.</p>
      <p>등급만 시뮬레이션합니다. 개별 선수·구단 확정권·모먼트 등급 보호권은 적용하지 않습니다. 재료는 매회 새로 투입하며 결과 카드를 자동 재사용하지 않습니다. 모먼트 이상 후보가 없으면 무작위 1장을 바로 획득합니다.</p>
      <p><a href={COMBINATION_SOURCE} target="_blank" rel="noreferrer">현재 공식 확률표 · 6. 조합</a> · <a href="https://community.withhive.com/MLB9IRIVALS/ko/board/9/16627" target="_blank" rel="noreferrer">카드 3장·후보 5장 조합 규칙</a></p>
    </details>
  </section>;
}
