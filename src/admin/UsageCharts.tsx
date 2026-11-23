import {useState} from 'react';
import {pageNames,type UsagePage} from '../lib/siteUsage';

export type Counts={views:number;visitors:number;seconds:number};
export type Daily=Counts & {day:string};
export type Hourly=Counts & {hour:number};
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

export function TrendChart({daily,hourly,days,asOf,byHour,onMode}:{
  daily:Daily[]; hourly?:Hourly[]; days:number; asOf:string;
  byHour:boolean; onMode:(hourly:boolean)=>void;
}) {
  const [metric,setMetric]=useState<Metric>('views');
  const [chosen,setChosen]=useState('');
  const dates=periodDays(asOf,days);
  const dayMap=new Map(daily.map(r=>[r.day,r]));
  const hourMap=new Map(hourly?.map(r=>[r.hour,r]));
  const buckets:{key:string;label:string;caption:string;row:Counts|undefined;tick:boolean}[]=byHour ? Array.from({length:24},(_,hour)=>{
    const label=String(hour).padStart(2,'0');
    return {key:label,label:label+'시',caption:label+':00–'+label+':59',row:hourMap.get(hour),
      tick:hour%6===0 || hour===23};
  }) : dates.map((date,i)=>({key:date,label:date.slice(5).replace('-','/'),
    caption:date.slice(5).replace('-','월 ')+'일',row:dayMap.get(date),
    tick:i===0 || i===dates.length-1 || (days===7 && i===3) || (days===30 && i%7===0 && i<25)}));
  const peak=Math.max(0,...buckets.map(b=>b.row?.[metric]??0));
  const peaks=buckets.filter(b=>peak>0 && b.row?.[metric]===peak);
  const selected=buckets.find(b=>b.key===chosen) ?? (byHour ? peaks[0] || buckets[0] : buckets[buckets.length-1]);
  const index=buckets.indexOf(selected);
  const detail=selected.row;
  const step=10**Math.floor(Math.log10(Math.max(1,peak)));
  const ceiling=Math.max(1,Math.ceil(peak/step)*step);
  const axis=[ceiling,...(ceiling%2===0?[ceiling/2]:[]),0];
  const unit=byHour?'시간대':'날짜';
  return <section className="usage-card usage-trend">
    <header><h2>{byHour?'시간대별 이용 분포':'날짜별 이용 추이'}</h2><MetricPicker label="추이 지표" metric={metric} change={setMetric}/></header>
    <div className="usage-mode" role="group" aria-label="집계 단위">
      <button aria-pressed={!byHour} onClick={()=>onMode(false)}>날짜별</button>
      <button aria-pressed={byHour} onClick={()=>onMode(true)}>시간대별</button>
    </div>
    {byHour && !hourly ? <p className="usage-empty">시간대별 집계 SQL을 적용하면 기존 방문 기록을 확인할 수 있습니다.</p> : <>
    {byHour && <p className="usage-footnote">{peaks.length ?
      `최다 ${metrics[metric]} · ${peaks[0].label}${peaks.length>1?' 외 '+(peaks.length-1)+'개 시간대':''} · ${value(peak,metric)}` :
      (hourly?.length?'선택한 지표의 합계가 0입니다.':'이 기간에 기록된 조회가 없습니다.')}</p>}
    <div className="usage-plot">
      <div className="usage-axis" aria-hidden="true">{axis.map(n=><span key={n}>{value(n,metric)}</span>)}</div>
      <div className="usage-bars" role="group" aria-label={unit+'별 그래프'}>
        {buckets.map(b=><button key={b.key} type="button" aria-pressed={b===selected}
            aria-label={(byHour?b.caption:b.key)+' '+(b.row?value(b.row[metric],metric):'기록 없음')}
            onPointerEnter={e=>{if(e.pointerType==='mouse')setChosen(b.key);}}
            onFocus={()=>setChosen(b.key)} onClick={()=>setChosen(b.key)}
            onKeyDown={e=>{
              if(e.key!=='ArrowRight' && e.key!=='ArrowLeft')return;
              e.preventDefault();
              const next=e.key==='ArrowRight'?e.currentTarget.nextElementSibling:e.currentTarget.previousElementSibling;
              if(next instanceof HTMLButtonElement)next.focus();
            }}>
            <span className="usage-bar-fill" style={{height:((b.row?.[metric]??0)/ceiling*100)+'%'}}/>
            {b.tick && <small>{b.label}</small>}
          </button>)}
      </div>
    </div>
    <div className="usage-day-readout"><strong>{selected.caption}</strong>
      <span>{detail?`조회 ${number(detail.views)}회 · 브라우저 ${number(detail.visitors)}개 · 열람 ${duration(detail.seconds)}`:'기록 없음'}</span>
      {byHour && !!detail?.views && <span>조회당 {duration(detail.seconds/detail.views)}</span>}
      {buckets.length>1 && <div className="usage-step"><button aria-label={'이전 '+unit} disabled={index===0} onClick={()=>setChosen(buckets[index-1].key)}>‹</button>
        <button aria-label={'다음 '+unit} disabled={index===buckets.length-1} onClick={()=>setChosen(buckets[index+1].key)}>›</button></div>}
    </div>
    {byHour && <p className="usage-footnote">한국시간 기준으로 선택 기간의 같은 시간대를 합산합니다. 열람 시간은 조회를 시작한 시간대에 포함되며, 같은 시간대의 브라우저는 한 번만 셉니다.</p>}
    </>}
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
