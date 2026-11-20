import {useState} from 'react';
import {pageNames,type UsagePage} from '../lib/siteUsage';

export type Counts={views:number;visitors:number;seconds:number};
export type Daily=Counts & {day:string};
export type PageStats=Counts & {page:UsagePage};
type Metric=keyof Counts;
const metrics={views:'조회 수',visitors:'방문 브라우저',seconds:'열람 시간'};
export const number=(n:number)=>n.toLocaleString('ko-KR');
export function duration(seconds:number) {
  const n=Math.round(seconds);
  if(n>=3600) return Math.floor(n/3600)+'시간 '+Math.floor(n%3600/60)+'분';
  return n<60 ? n+'초' : Math.floor(n/60)+'분 '+n%60+'초';
}
function value(n:number,metric:Metric) {
  return metric==='seconds'?duration(n):number(n)+(metric==='views'?'회':'개');
}
const kstDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
function periodDays(asOf:string,days:number) {
  const end=Date.parse(kstDay.format(new Date(asOf))+'T00:00:00Z');
  return Array.from({length:days},(_,i)=>new Date(end-(days-1-i)*86400000).toISOString().slice(0,10));
}
function MetricPicker({metric,change,label}:{metric:Metric;change:(m:Metric)=>void;label:string}) {
  return <select aria-label={label} value={metric} onChange={e=>change(e.target.value as Metric)}>
    {Object.entries(metrics).map(([k,v])=><option key={k} value={k}>{v}</option>)}
  </select>;
}

export function DailyChart({rows,days,asOf}:{rows:Daily[];days:number;asOf:string}) {
  const [metric,setMetric]=useState<Metric>('views');
  const [chosen,setChosen]=useState('');
  const dates=periodDays(asOf,days);
  const byDay=new Map(rows.map(r=>[r.day,r]));
  const day=dates.includes(chosen)?chosen:dates[dates.length-1];
  const detail=byDay.get(day);
  const max=Math.max(1,...rows.map(r=>r[metric]));
  const step=10**Math.floor(Math.log10(max));
  const ceiling=Math.ceil(max/step)*step;
  const axis=[ceiling,...(ceiling%2===0?[ceiling/2]:[]),0];
  return <section className="usage-card usage-trend">
    <header><h2>날짜별 이용 추이</h2><MetricPicker label="추이 지표" metric={metric} change={setMetric}/></header>
    <div className="usage-plot">
      <div className="usage-axis" aria-hidden="true">{axis.map(n=><span key={n}>{value(n,metric)}</span>)}</div>
      <div className="usage-bars" role="group" aria-label="날짜별 그래프">
        {dates.map((date,i)=>{
          const row=byDay.get(date);
          return <button key={date} type="button" aria-pressed={date===day}
            aria-label={date+' '+(row?value(row[metric],metric):'기록 없음')}
            onPointerEnter={e=>{if(e.pointerType==='mouse')setChosen(date);}}
            onFocus={()=>setChosen(date)} onClick={()=>setChosen(date)}
            onKeyDown={e=>{
              if(e.key!=='ArrowRight' && e.key!=='ArrowLeft')return;
              e.preventDefault();
              const next=e.key==='ArrowRight'?e.currentTarget.nextElementSibling:e.currentTarget.previousElementSibling;
              if(next instanceof HTMLButtonElement)next.focus();
            }}>
            <span className="usage-bar-fill" style={{height:((row?.[metric]??0)/ceiling*100)+'%'}}/>
            {(i===0 || i===dates.length-1 || (days===7 && i===3) || (days===30 && i%7===0 && i<25)) &&
              <small>{date.slice(5).replace('-','/')}</small>}
          </button>;
        })}
      </div>
    </div>
    <div className="usage-day-readout"><strong>{day.slice(5).replace('-','월 ')}일</strong>
      <span>{detail?`조회 ${number(detail.views)}회 · 브라우저 ${number(detail.visitors)}개 · 열람 ${duration(detail.seconds)}`:'기록 없음'}</span>
      {days>1 && <div className="usage-step"><button aria-label="이전 날짜" disabled={day===dates[0]} onClick={()=>setChosen(dates[dates.indexOf(day)-1])}>‹</button>
        <button aria-label="다음 날짜" disabled={day===dates[dates.length-1]} onClick={()=>setChosen(dates[dates.indexOf(day)+1])}>›</button></div>}
    </div>
  </section>;
}

export function PageChart({rows}:{rows:PageStats[]}) {
  const [metric,setMetric]=useState<Metric>('views');
  const sorted=[...rows].sort((a,b)=>b[metric]-a[metric] || b.views-a.views || a.page.localeCompare(b.page));
  const peak=sorted[0]?.[metric] || 1;
  return <section className="usage-card usage-ranking">
    <header><h2>화면별 이용 순위</h2><MetricPicker label="순위 지표" metric={metric} change={setMetric}/></header>
    {sorted.length?<ol>{sorted.slice(0,5).map(row=><li key={row.page}>
      <div><span>{pageNames[row.page]}</span><strong>{value(row[metric],metric)}</strong></div>
      <div className="usage-track" aria-hidden="true"><i style={{width:row[metric]/peak*100+'%'}}/></div>
    </li>)}</ol>:<p className="usage-empty">이 기간에 기록된 조회가 없습니다.</p>}
    {sorted.length>0&&<details><summary>전체 화면 상세 ({sorted.length})</summary>
      <table><thead><tr><th>화면</th><th>조회</th><th>브라우저</th><th>평균 열람</th></tr></thead><tbody>
        {sorted.map(r=><tr key={r.page}><th>{pageNames[r.page]}</th><td>{number(r.views)}</td><td>{number(r.visitors)}</td><td>{duration(r.seconds/r.views)}</td></tr>)}
      </tbody></table></details>}
  </section>;
}
