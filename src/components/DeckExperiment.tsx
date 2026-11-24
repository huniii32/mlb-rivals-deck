import { useMemo, useState } from "react";
import type { Deck } from "../lib/deck";
import { DECK_WEIGHTS, deckPlayerResults, deckTotals, type PlayerResult, type SkillTables } from "../lib/engine";
import { formatPoints, playerChanges, settingChanges, type Change } from "../lib/experimentComparison";
import type { Setting } from "./renewal/Lineup";

const changeLabel = (v: number) => Math.abs(v) < .005 ? "변동 없음" : (v > 0 ? "+" : "−") + formatPoints(Math.abs(v)) + "점";
function Changes({ items }: { items: Change[] }) {
  return <dl className="experiment-changes">{items.map(c => <div key={c.label}>
    <dt>{c.label}</dt><dd><span>{c.before}</span> → <b>{c.after}</b></dd>
  </div>)}</dl>;
}

export function DeckExperiment({ original, working, results, tables, onPlayer, onSetting, onApply, onDiscard }: {
  original: Deck; working: Deck; results: PlayerResult[]; tables: SkillTables;
  onPlayer: (row: number) => void; onSetting: (s: Setting) => void; onApply: () => void; onDiscard: () => void;
}) {
  const [all, setAll] = useState(false);
  const previous = useMemo(() => deckPlayerResults(original, tables), [original, tables]);
  const before = deckTotals(original.players, previous), after = deckTotals(working.players, results);
  const players = playerChanges(original, working, previous, results);
  const settings = settingChanges(original, working);
  return <section className="card deck-experiment" aria-label="내 덱으로 실험">
    <h3>{original.name || "이름 없는 덱"} · 실험 중</h3>
    <div className="experiment-tools">
      <select aria-label="실험할 선수 선택" value="" onChange={e => onPlayer(Number(e.target.value))}>
        <option value="" disabled>선수 선택 · 편집</option>
        {working.players.map(p => <option key={p.excelRow} value={p.excelRow}>{p.pos} · {p.name || "빈 슬롯"}</option>)}
      </select>
      {(["덱스코어", "팀 버프", "투수 전술"] as const).map(s => <button key={s} onClick={() => onSetting(s)}>{s}</button>)}
    </div>
    <div className="experiment-scores">{([["total","덱 총점"],["bt","타자"],["sp","선발"],["rp","불펜"]] as const).map(([key,label]) =>
      <div key={key}><span>{label}{key !== "total" && <small> · 비중 {DECK_WEIGHTS[key] * 100}%</small>}</span>
        <b className={after[key] < before[key] ? "experiment-loss" : after[key] > before[key] ? "experiment-gain" : undefined}>{changeLabel(after[key] - before[key])}</b>
        <small>원본 {formatPoints(before[key])} → 실험 {formatPoints(after[key])}</small></div>)}</div>
    {!!settings.length && <><h4>바꾼 덱 설정</h4><Changes items={settings}/></>}
    {!!players.length && <><h4>변경된 선수 {players.length}명</h4>
      {(all ? players : players.slice(0,3)).map(p => <article className="experiment-player" key={p.row}>
        <header><strong>{p.pos} · {p.title}</strong><span>{p.before == null ? "—" : formatPoints(p.before)} → {p.after == null ? "—" : formatPoints(p.after)}점 · {changeLabel(p.diff)}</span></header>
        <Changes items={p.changes}/>
      </article>)}
      {players.length > 3 && <button onClick={() => setAll(!all)}>{all ? "3명만 보기" : `나머지 ${players.length - 3}명 보기`}</button>}
    </>}
    {settings.length > 0 && !players.length && <p>이 설정 변경으로 능력치나 점수가 달라진 등록 선수가 없습니다.</p>}
    <p>‘내 덱에 적용’을 누르면 실험 내용을 저장합니다.</p>
    <div className="row"><button onClick={onDiscard}>실험 종료</button>
      <button className="primary" disabled={original === working} onClick={onApply}>내 덱에 적용</button></div>
  </section>;
}
