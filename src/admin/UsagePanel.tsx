import {useEffect,useRef,useState} from 'react';
import {errMessage,isMissingRpc,supabase} from '../lib/supabase';
import {TrendChart,PageChart,duration,number,type Counts,type Daily,type Hourly,type PageStats} from './UsageCharts';
import './usage.css';

const sites={service:'실제 서비스',demo:'개발 데모',admin:'관리자 사이트'} as const;
type Site=keyof typeof sites;
interface Report {
  as_of:string;
  sites:(Counts & {site:Site;online:number;returning_browsers?:number})[];
  pages:(PageStats & {site:Site})[];
  hourly?:(Hourly & {site:Site})[];
  daily:(Daily & {site:Site})[];
}
export default function UsagePanel({session,onExpired}:{session:string;onExpired:()=>void}) {
  const expired=useRef(onExpired); expired.current=onExpired;
  const refreshNow=useRef<()=>void>(()=>{});
  const [site,setSite]=useState<Site>('service');
  const [byHour,setByHour]=useState(false);
  const [days,setDays]=useState(7);
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let current=true,loading=false;
    setReport(null); setError('');
    async function refresh() {
      if(loading || !current || document.hidden) return;
      loading=true; setBusy(true);
      try {
        if(!supabase) throw Error('unconfigured');
        const {data,error}=await supabase.rpc('event_operator_usage',{p_session:session,p_days:days});
        if(error) throw error;
        if(current){ setReport(data as Report); setError(''); }
      } catch(e) {
        if(current) {
          if(errMessage(e).includes("session_expired")) { expired.current(); return; }
          setError(isMissingRpc(e)?'이용 통계 SQL을 적용하면 집계 결과가 표시됩니다.':'최신 통계를 불러오지 못했습니다. 연결 상태를 확인하고 다시 갱신해 주세요.');
        }
      } finally {loading=false;if(current)setBusy(false);}
    }
    refreshNow.current=refresh;
    void refresh();
    const id=setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{current=false;clearInterval(id);document.removeEventListener('visibilitychange',refresh);};
  },[session,days]);
  const totals=report?.sites.find(row=>row.site===site);
  const daily=report?.daily.filter(row=>row.site===site) || [];
  return <section className="usage-panel">
    <header className="usage-heading"><h1>사이트 이용 통계</h1>
      <div className="usage-sync"><span>{report && new Date(report.as_of).toLocaleTimeString('ko-KR',{hour12:false,timeZone:'Asia/Seoul'})+' · '}30초마다 갱신</span>
        <button disabled={busy} onClick={()=>refreshNow.current()}>{busy?'갱신 중…':'↻ 새로고침'}</button></div></header>
    <div className="usage-toolbar"><nav aria-label="집계 사이트">{(Object.keys(sites) as Site[]).map(key=>
      <button key={key} aria-pressed={site===key} aria-label={sites[key]} onClick={()=>setSite(key)}>{sites[key]}
        {report && <span className="usage-site-count" title="현재 접속 브라우저">{report.sites.find(s=>s.site===key)?.online ?? 0}</span>}</button>)}</nav>
      <label>조회 기간 <select value={days} onChange={e=>setDays(Number(e.target.value))}>
        <option value={1}>오늘</option><option value={7}>최근 7일</option><option value={30}>최근 30일</option>
      </select></label></div>
    {error && <p role="alert">{error}</p>}
    {report && totals ? <>
      <div className="usage-kpis" aria-label={sites[site]+' 주요 지표'}>
        <div className="usage-online"><span><i/>현재 접속</span><strong>{number(totals.online)}<small>개</small></strong><p>최근 90초 활성 브라우저</p></div>
        <div><span>순방문 브라우저</span><strong>{number(totals.visitors)}<small>개</small></strong><p>선택 기간 중 중복 제외</p>
          {days>1 && totals.returning_browsers!==undefined && <p title="선택 기간 중 서로 다른 날짜에 2일 이상 방문한 브라우저">2일 이상 재방문 {number(totals.returning_browsers)}개{totals.visitors>0 && ` (${Math.round(100*totals.returning_browsers/totals.visitors)}%)`}</p>}</div>
        <div><span>페이지 조회</span><strong>{number(totals.views)}<small>회</small></strong><p>{totals.visitors ? '브라우저당 '+(totals.views/totals.visitors).toLocaleString('ko-KR',{maximumFractionDigits:1})+'회' : '화면을 열어 본 횟수'}</p></div>
        <div><span>조회당 평균 열람</span><strong>{totals.views?duration(totals.seconds/totals.views):'—'}</strong><p>총 열람 {duration(totals.seconds)}</p></div>
      </div>
      <div className="usage-charts">
        <TrendChart key={site+'-'+days} daily={daily} hourly={report.hourly?.filter(row=>row.site===site)} days={days} asOf={report.as_of} byHour={byHour} onMode={setByHour}/>
        <PageChart rows={report.pages.filter(row=>row.site===site)}/>
      </div>
      <details className="usage-card usage-table"><summary>날짜별 상세 기록</summary>
        {daily.length?<table><thead><tr><th>날짜</th><th>조회</th><th>브라우저</th><th>총 열람</th></tr></thead><tbody>
          {daily.map(r=><tr key={r.day}><th>{r.day}</th><td>{number(r.views)}</td><td>{number(r.visitors)}</td><td>{duration(r.seconds)}</td></tr>)}</tbody></table>:<p>이 기간에 기록된 조회가 없습니다.</p>}
      </details>
      <p className="usage-footnote">한국시간 · 조회 시작일 기준 · 열람 시간은 화면에 표시된 탭에 포커스가 있는 동안 집계합니다.</p>
    </>:!error && <p role="status">통계를 불러오는 중…</p>}
  </section>;
}
