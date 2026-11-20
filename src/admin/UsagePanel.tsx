import {useEffect,useRef,useState} from 'react';
import {errMessage,isMissingRpc,supabase} from '../lib/supabase';
import {pageNames,type UsagePage} from '../lib/siteUsage';

const sites={service:'실제 서비스',demo:'개발 데모',admin:'관리자 사이트'} as const;
type Site=keyof typeof sites;
type Counts={site:Site;views:number;visitors:number;seconds:number};
interface Report {
  as_of:string;
  sites:(Counts & {online:number})[];
  pages:(Counts & {page:UsagePage})[];
  daily:(Counts & {day:string})[];
}
function duration(seconds:number) {
  const whole=Math.round(seconds);
  return whole<60 ? whole+'초' : Math.floor(whole/60)+'분 '+whole%60+'초';
}

export default function UsagePanel({session,onExpired}:{session:string;onExpired:()=>void}) {
  const expired=useRef(onExpired); expired.current=onExpired;
  const [site,setSite]=useState<Site>('service');
  const [days,setDays]=useState(7);
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let current=true,loading=false;
    setReport(null); setError('');
    async function refresh() {
      if(loading || !current || document.hidden) return;
      loading=true;
      try {
        if(!supabase) throw Error('unconfigured');
        const {data,error}=await supabase.rpc('event_operator_usage',{p_session:session,p_days:days});
        if(error) throw error;
        if(current){ setReport(data as Report); setError(''); }
      } catch(e) {
        if(current) {
          if(errMessage(e).includes("session_expired")) { expired.current(); return; }
          setReport(null);
          setError(isMissingRpc(e)?'이용 통계 SQL을 적용하면 집계 결과가 표시됩니다.':'통계를 불러오지 못했습니다. 관리자 로그인과 연결 상태를 확인해 주세요.');
        }
      } finally {loading=false;}
    }
    void refresh();
    const id=setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{current=false;clearInterval(id);document.removeEventListener('visibilitychange',refresh);};
  },[session,days]);
  const totals=report?.sites.find(row=>row.site===site);
  const pages=report?.pages.filter(row=>row.site===site) || [];
  const daily=report?.daily.filter(row=>row.site===site) || [];
  return <section className="usage-panel event-panel">
    <h1>사이트 이용 통계</h1>
    <nav aria-label="집계 사이트">{(Object.keys(sites) as Site[]).map(key=>
      <button key={key} aria-pressed={site===key} onClick={()=>setSite(key)}>{sites[key]}{report && ' · '+(report.sites.find(s=>s.site===key)?.online ?? 0)+'명 접속'}</button>)}</nav>
    <div className="usage-period"><h2>{sites[site]}</h2><label>조회 기간 <select value={days} onChange={e=>setDays(Number(e.target.value))}>
      <option value={1}>오늘</option><option value={7}>최근 7일</option><option value={30}>최근 30일</option>
    </select></label></div>
    {error?<p role="alert">{error}</p>:!totals?<p role="status">통계를 불러오는 중…</p>:<>
      <dl>{[['현재 접속',totals.online+'명'],['순방문 브라우저',totals.visitors+'개'],['페이지 조회',totals.views+'회'],['조회당 평균 열람',totals.views?duration(totals.seconds/totals.views):'—']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p>현재 접속은 최근 90초 안에 화면을 보고 있던 브라우저 수입니다. 열람 시간은 해당 탭이 화면에 표시되고 포커스가 있을 때 누적됩니다.</p>
      <h3>많이 본 화면</h3>
      {pages.length?<table><thead><tr><th>화면</th><th>조회</th><th>브라우저</th><th>평균 열람</th></tr></thead>
        <tbody>{pages.map(r=><tr key={r.page}><th>{pageNames[r.page]}</th><td>{r.views}</td><td>{r.visitors}</td><td>{duration(r.seconds/r.views)}</td></tr>)}</tbody></table>:<p>이 기간에 기록된 조회가 없습니다.</p>}
      {daily.length>0 && <><h3>날짜별 이용</h3><table><thead><tr><th>날짜</th><th>조회</th><th>브라우저</th><th>총 열람</th></tr></thead><tbody>
        {daily.map(r=><tr key={r.day}><th>{r.day}</th><td>{r.views}</td><td>{r.visitors}</td><td>{duration(r.seconds)}</td></tr>)}</tbody></table></>}
      <small>조회 시작일 기준 · 한국시간 · 마지막 집계 {new Date(report!.as_of).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})}</small>
    </>}
  </section>;
}
