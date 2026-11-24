import { useState } from "react";
import type { Deck } from "../lib/deck";
import { DECK_WEIGHTS } from "../lib/engine";
import { formatPoints, type LineupComparison, type Change } from "../lib/experimentComparison";
import type { Setting } from "./renewal/Lineup";

export const changeLabel = (v: number) => Math.abs(v) < .005 ? "변동 없음" : (v > 0 ? "+" : "−") + formatPoints(Math.abs(v)) + "점";
function Changes({ items }: { items: Change[] }) {
  return <dl className="experiment-changes">{items.map(c => <div key={c.label}>
    <dt>{c.label}</dt><dd><span>{c.before}</span> → <b>{c.after}</b></dd>
  </div>)}</dl>;
}

type ExperimentControls = {
  deck: Deck; onPlayer: (row: number) => void; onSetting: (s: Setting) => void; onApply: () => void; onDiscard: () => void;
};

export function LineupChanges({ report, experiment }: { report?: LineupComparison; experiment?: ExperimentControls }) {
  const [all, setAll] = useState(false);
  const heading = experiment ? (experiment.deck.name || "이름 없는 덱") + " · 실험 중" : "최근 라인업 변경";
  if (!report) return <section className="card deck-experiment" aria-label={heading}><h3>{heading}</h3>
    <p>선수나 덱 설정을 수정하면 변경 전후 수치와 점수 차이가 표시됩니다.</p></section>;
  const { before, after, players, settings } = report;
  const idle = !experiment && !players.length && !settings.length;
  return <section className="card deck-experiment" aria-label={experiment ? "내 덱으로 실험" : heading}>
    <h3>{heading}</h3>
    {experiment && <div className="experiment-tools">
      <select aria-label="실험할 선수 선택" value="" onChange={e => experiment.onPlayer(Number(e.target.value))}>
        <option value="" disabled>선수 선택 · 편집</option>
        {experiment.deck.players.map(p => <option key={p.excelRow} value={p.excelRow}>{p.pos} · {p.name || "빈 슬롯"}</option>)}
      </select>
      {(["덱스코어", "팀 버프", "투수 전술"] as const).map(s => <button key={s} onClick={() => experiment.onSetting(s)}>{s}</button>)}
    </div>}
    <div className="experiment-scores">{([["total","덱 총점"],["bt","타자"],["sp","선발"],["rp","불펜"]] as const).map(([key,label]) =>
      <div key={key}><span>{label}{key !== "total" && <small> · 비중 {DECK_WEIGHTS[key] * 100}%</small>}</span>
        {idle ? <b>{formatPoints(after[key])}점</b> : <><b className={after[key] < before[key] ? "experiment-loss" : after[key] > before[key] ? "experiment-gain" : undefined}>{changeLabel(after[key] - before[key])}</b>
        <small>{experiment ? "원본" : "변경 전"} {formatPoints(before[key])} → {experiment ? "실험" : "변경 후"} {formatPoints(after[key])}</small></>}</div>)}</div>
    {idle && <p>선수나 덱 설정을 수정하면 편집을 열기 전과 비교합니다.</p>}
    {!!settings.length && <><h4>바꾼 덱 설정</h4><Changes items={settings}/></>}
    {!!players.length && <><h4>변경된 선수 {players.length}명</h4>
      {(all ? players : players.slice(0,3)).map(p => <article className="experiment-player" key={p.row}>
        <header><strong>{p.pos} · {p.title}</strong><span>{p.before == null && p.after == null ? "선수 이름 입력 후 점수 반영" : <>{p.before == null ? "—" : formatPoints(p.before)} → {p.after == null ? "—" : formatPoints(p.after)}점 · {changeLabel(p.diff)}</>}</span></header>
        <Changes items={p.changes}/>
      </article>)}
      {players.length > 3 && <button onClick={() => setAll(!all)}>{all ? "3명만 보기" : `나머지 ${players.length - 3}명 보기`}</button>}
    </>}
    {settings.length > 0 && !players.length && <p>이 설정 변경으로 능력치나 점수가 달라진 등록 선수가 없습니다.</p>}
    {experiment && <><p>‘내 덱에 적용’을 누르면 실험 내용을 저장합니다.</p>
    <div className="row"><button onClick={experiment.onDiscard}>실험 종료</button>
      <button className="primary" disabled={!report.edited} onClick={experiment.onApply}>내 덱에 적용</button></div></>}
  </section>;
}
