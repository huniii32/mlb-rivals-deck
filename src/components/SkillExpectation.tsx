import { useState } from "react";
import { fmtScore, skillScore, type Kind, type SkillTables } from "../lib/engine";
import { expectedScore, trialProbability, SKILL_SOURCES } from "../lib/skillUpdates";
import { SkillSlot } from "./SkillInput";

export function SkillExpectation({ tables }: { tables: SkillTables }) {
  const [kind, setKind] = useState<Kind>("pitcher");
  const [off, setOff] = useState("");
  const [on, setOn] = useState("");
  const [chance, setChance] = useState("50");
  const [rate, setRate] = useState("");
  const [count, setCount] = useState("100");
  const a = skillScore(kind, off, tables), b = skillScore(kind, on, tables);
  const result = a !== null && b !== null && chance.trim() ? expectedScore(a, b, Number(chance)) : NaN;
  const prob = rate.trim() && count.trim() ? trialProbability(Number(rate), Number(count)) : null;
  return <details className="card">
    <summary><b>스킬 기대값 · 획득 확률 계산</b></summary>
    <p className="muted">공식 효과를 기존 덱 점수 가중치로 환산합니다. 조건 충족률과 1회 획득률은 직접 입력하는 가정이며, 게임 승률이 아닙니다.</p>
    <label>선수 종류 <select value={kind} onChange={e => { setKind(e.target.value as Kind); setOff(""); setOn(""); }}>
      <option value="pitcher">투수</option><option value="batter">타자</option>
    </select></label>
    <div className="ed-skills">
      <SkillSlot label="조건 미충족 " n={1} kind={kind} value={off} tables={tables} onChange={setOff} />
      <SkillSlot label="조건 충족 " n={2} kind={kind} value={on} tables={tables} onChange={setOn} />
    </div>
    <label>조건 충족률 (%) <input type="number" min="0" max="100" step="any" value={chance} onChange={e => setChance(e.target.value)} /></label>
    <p aria-live="polite">기대 점수: <b>{Number.isFinite(result) ? fmtScore(result) : "두 조건의 스킬과 0~100%를 입력하세요"}</b></p>
    <p className="muted">미충족 점수 × (1 − 확률) + 충족 점수 × 확률. 같은 스킬의 서로 배타적인 두 조건을 선택하세요. 기존에 평균으로 산정된 스킬을 다시 확률로 가중하면 중복 계산됩니다.</p>
    <h4>반복 시도 시 한 번 이상 획득</h4>
    <div className="row">
      <label>1회 획득률 (%) <input type="number" min="0" max="100" step="any" placeholder="공식 확률표 확인 후 입력" value={rate} onChange={e => setRate(e.target.value)} /></label>
      <label>시도 횟수 <input type="number" min="0" step="1" value={count} onChange={e => setCount(e.target.value)} /></label>
    </div>
    <p aria-live="polite">{prob ? `한 번 이상 ${(prob.atLeastOne * 100).toFixed(2)}% · 평균 ${Number.isFinite(prob.meanTrials) ? fmtScore(prob.meanTrials) + "회" : "획득 불가"}` : "획득률과 정수 횟수를 입력하세요."}</p>
    <p className="muted">1 − (1 − p)ⁿ, 평균 1/p. 매 시도 확률이 같고 독립인 경우에만 적용됩니다. 확정 지급·보호·중복 제한·다중 슬롯은 포함하지 않습니다.</p>
    <p><a href={SKILL_SOURCES.september} target="_blank" rel="noreferrer">9월 공식 효과</a> · <a href={SKILL_SOURCES.october} target="_blank" rel="noreferrer">10월 공식 효과</a></p>
  </details>;
}
