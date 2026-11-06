import { lazy, Suspense, useState } from "react";
import type { SkillTables, PlayerInput } from "../lib/engine";
const SkillSimulator=lazy(()=>import('./SkillSimulator'));
const MomentCombination=lazy(()=>import('./MomentCombination'));
const HofRecruitment=lazy(()=>import('./HofRecruitment'));
const EventDemo=lazy(()=>import('../demo/events'));
export default function Simulator({tables,players}:{tables:SkillTables;players:PlayerInput[]}){
  const [screen,setScreen]=useState<'home'|'skills'|'combination'|'hof'|'event'>('home');
  return <div className="simulator-hub">
    {screen==='home'?<>
      <div className="sim-hub-heading"><h2>시뮬레이터</h2><p className="muted">원하는 시뮬레이션을 선택하세요. 설정과 기록은 이 브라우저에 자동 저장됩니다.</p></div>
      <div className="sim-hub-options">
        <button className="card sim-hub-option" onClick={()=>setScreen('skills')}><span className="sim-hub-icon">S</span><strong>스킬 시뮬레이션</strong><span className="muted">변경권별 스킬 추첨 · 첫 줄 잠금 · 점수 목표</span><span className="sim-hub-enter">시작하기 →</span></button>
        <button className="card sim-hub-option combo-option" onClick={()=>setScreen('combination')}><span className="sim-hub-icon">M</span><strong>슈프림 모먼트 조합</strong><span className="muted">구단·지구·리그 선택 · 선수·테마 · 후보 5장</span><span className="sim-hub-enter">시작하기 →</span></button>
        <button className="card sim-hub-option hof-option" onClick={()=>setScreen('hof')}><span className="sim-hub-icon">HOF</span><strong>일반 명예의 전당 영입</strong><span className="muted">공식 선수 명단·확률 · 희망 선수 등장까지 · 획득 통계</span><span className="sim-hub-enter">시작하기 →</span></button>
        <button className="card sim-hub-option event-option" onClick={()=>setScreen('event')}><span className="sim-hub-icon">EVENT</span><strong>이벤트 <small>데모</small></strong><span className="muted">5회 스킬 점수 대회 · 참여 응모권 · 행운 추첨</span><span className="sim-hub-enter">이벤트 페이지 →</span></button>
      </div>
    </>:<>
      <button className="sim-back" onClick={()=>setScreen('home')}>← 시뮬레이터 선택</button>
      <Suspense fallback={<div className="card" role="status">시뮬레이터를 불러오는 중…</div>}>{screen==='skills'?<SkillSimulator tables={tables} players={players}/>:screen==='combination'?<MomentCombination/>:screen==='hof'?<HofRecruitment/>:<EventDemo/>}</Suspense>
    </>}
  </div>;
}
