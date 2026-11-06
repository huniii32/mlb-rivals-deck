import {useEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {analyzeTrials,type AnalysisResult} from '../lib/simulatorAnalysis';
export default function SimulationAnalysis({makeTrial,label,close}:{makeTrial:()=>()=>boolean;label:string;close:()=>void}){
  const [runs,setRuns]=useState('100'),[cap,setCap]=useState('1000');
  const [result,setResult]=useState<AnalysisResult|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  async function run(){if(controller.current)return;const abort=new AbortController();controller.current=abort;setBusy(true);setResult(null);
    try{const r=await analyzeTrials(makeTrial,Number(runs),Number(cap),abort.signal,(n,tries)=>{if(mounted.current)setMessage(`${n}개 실험 완료 · ${tries.toLocaleString()}회 추첨`);});if(mounted.current)setResult(r);}
    catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'분석 실패');}
    finally{controller.current=null;if(mounted.current)setBusy(false);}
  }
  return <Modal title="목표 달성 소모량 분석" close={close} width="680px"><p>{label}</p><p className="muted">같은 조건으로 처음부터 독립 실험합니다. 현재 변경권 사용량과 결과는 바뀌지 않습니다.</p>
    <div className="row sim-analysis-controls"><label>실험 수 <select aria-label="분석 실험 수" value={runs} disabled={busy} onChange={e=>setRuns(e.target.value)}><option>100</option><option>500</option><option>1000</option></select></label><label>실험당 최대 <input aria-label="분석 최대 횟수" type="number" min="100" max="10000" value={cap} disabled={busy} onChange={e=>setCap(e.target.value)}/> 회</label><button disabled={busy} onClick={()=>void run()}>분석 시작</button>{busy&&<button onClick={()=>controller.current?.abort()}>분석 중지</button>}</div>
    <p role="status">{message}</p>{result&&<><table><tbody><tr><th>완료한 실험</th><td>{result.completed} / {result.requested}{result.stopped?' · 중지됨':''}</td></tr><tr><th>{result.cap}회 안에 성공</th><td>{result.successes}회 · {result.completed?(result.successes/result.completed*100).toFixed(1):'—'}%</td></tr><tr><th>100회 이내 성공률</th><td>{result.completed?(result.within100/result.completed*100).toFixed(1):'—'}%</td></tr><tr><th>성공한 실험의 평균 소모량</th><td>{result.mean?.toFixed(1)??'—'}회</td></tr><tr><th>성공한 실험의 중앙값</th><td>{result.median??'—'}회</td></tr><tr><th>상한까지 미달성</th><td>{result.completed-result.successes}회</td></tr></tbody></table><p className="muted">평균·중앙값은 상한 안에 성공한 실험만 계산합니다. 미달성 실험을 포함한 전체 평균은 아닙니다. 중지한 미완료 실험은 성공률에서 제외합니다. 시뮬레이션 추정값이며 실제 획득을 보장하지 않습니다.</p></>}
  </Modal>;
}
