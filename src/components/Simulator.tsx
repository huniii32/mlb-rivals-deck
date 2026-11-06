import { lazy, Suspense, useState } from "react";
import type { SkillTables, PlayerInput } from "../lib/engine";
const SkillSimulator=lazy(()=>import('./SkillSimulator'));
const MomentCombination=lazy(()=>import('./MomentCombination'));
export default function Simulator({tables,players}:{tables:SkillTables;players:PlayerInput[]}){
  const [screen,setScreen]=useState<'home'|'skills'|'combination'>('home');
  return <div className="simulator-hub">
    {screen==='home'?<>
      <div className="sim-hub-heading"><h2>시뮬레이터</h2><p className="muted">원하는 시뮬레이션을 선택하세요. 설정과 기록은 이 브라우저에 자동 저장됩니다.</p></div>
      <div className="sim-hub-options">
        <button className="card sim-hub-option" onClick={()=>setScreen('skills')}><span className="sim-hub-icon">S</span><strong>스킬 시뮬레이션</strong><span className="muted">변경권별 스킬 추첨 · 첫 줄 잠금 · 점수 목표</span><span className="sim-hub-enter">시작하기 →</span></button>
        <button className="card sim-hub-option combo-option" onClick={()=>setScreen('combination')}><span className="sim-hub-icon">M</span><strong>슈프림 모먼트 조합</strong><span className="muted">구단·지구·리그 선택 · 선수·테마 · 후보 5장</span><span className="sim-hub-enter">시작하기 →</span></button>
      </div>
    </>:<>
      <button className="sim-back" onClick={()=>setScreen('home')}>← 시뮬레이터 선택</button>
      <Suspense fallback={<div className="card" role="status">시뮬레이터를 불러오는 중…</div>}>{screen==='skills'?<SkillSimulator tables={tables} players={players}/>:<MomentCombination/>}</Suspense>
    </>}
  </div>;
}
