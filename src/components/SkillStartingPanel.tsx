import {useState} from 'react';
import type {PlayerInput,SkillTables} from '../lib/engine';
import {canLockFirst,LEVELS,skillId,TIERS,type Level,type SimSettings} from '../lib/skillSimulator';
import {lockedPreset,presetFromPlayer,presetSkills,type SkillPreset} from '../lib/simulatorPreset';
export default function SkillStartingPanel({settings,tables,players,disabled,apply}:{settings:SimSettings;tables:SkillTables;players:PlayerInput[];disabled:boolean;apply:(p:SkillPreset)=>void}){
  const [id,setId]=useState(''),[level,setLevel]=useState<Level>('S'),[playerRow,setPlayerRow]=useState(''),[message,setMessage]=useState('');
  const candidates=presetSkills(settings).filter(s=>canLockFirst(settings,{...s,id:skillId(s),level}));
  const chosen=candidates.find(s=>skillId(s)===id);
  const available=players.filter(p=>p.name.trim());
  function start(make:()=>SkillPreset){try{apply(make());setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'불러오기 실패');}}
  return <details className="card sim-starting"><summary>보유 스킬 · 내 덱 선수로 시작</summary><p className="muted">새 실험으로 시작하며 이전 기록은 초기화합니다. 덱의 능력치·스킬은 바뀌지 않습니다.</p>
    <div className="row"><label>첫 번째 보유 스킬 <select aria-label="보유 첫 스킬" disabled={disabled||!candidates.length} value={chosen?id:''} onChange={e=>setId(e.target.value)}><option value="">선택</option>{candidates.map(s=><option key={skillId(s)} value={skillId(s)}>{s.name} · {TIERS[s.tier]}</option>)}</select></label><label>레벨 <select aria-label="보유 스킬 레벨" disabled={disabled} value={level} onChange={e=>setLevel(e.target.value as Level)}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label><button disabled={disabled||!chosen} onClick={()=>start(()=>lockedPreset(settings,id,level))}>이 스킬 잠그고 시작</button></div>
    {!candidates.length&&<p className="muted">이 카드에서는 첫 슬롯 잠금을 사용할 수 없습니다.</p>}
    <div className="row"><label>내 덱 선수 <select aria-label="시뮬레이션 시작 선수" disabled={disabled||!available.length} value={available.some(p=>String(p.excelRow)===playerRow)?playerRow:''} onChange={e=>setPlayerRow(e.target.value)}><option value="">선수 선택</option>{available.map(p=><option key={p.excelRow} value={p.excelRow}>{p.name} · {p.pos} · {p.card}</option>)}</select></label><button disabled={disabled||!available.some(p=>String(p.excelRow)===playerRow)} onClick={()=>start(()=>presetFromPlayer(available.find(p=>String(p.excelRow)===playerRow)!,tables,settings.ticket))}>선수 불러오기</button></div>
    {!available.length&&<p className="muted">라인업에 선수를 등록하면 여기에서 선택할 수 있습니다.</p>}{message&&<p className="sim-error" role="alert">{message}</p>}
  </details>;
}
