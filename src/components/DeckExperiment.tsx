import { useMemo } from "react";
import { normalizePlayer, type Deck } from "../lib/deck";
import { deckPlayerResults, deckTotals, type PlayerResult, type SkillTables } from "../lib/engine";

const score = (n: number) => n.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const delta = (n: number) => (n > 0 ? "+" : "") + score(n);

export function DeckExperiment({ original, working, results, tables, onApply, onDiscard }: {
  original: Deck; working: Deck; results: PlayerResult[]; tables: SkillTables;
  onApply: () => void; onDiscard: () => void;
}) {
  const previous = useMemo(() => deckPlayerResults(original, tables), [original, tables]);
  const before = deckTotals(original.players, previous).total;
  const after = deckTotals(working.players, results).total;
  const slots = new Set([...original.players, ...working.players].map(p => p.excelRow));
  const changes = [...slots].flatMap(row => {
    const i = original.players.findIndex(p => p.excelRow === row);
    const j = working.players.findIndex(p => p.excelRow === row);
    const old = original.players[i], next = working.players[j];
    const oldName = old?.name.trim(), nextName = next?.name.trim();
    if (!oldName && !nextName) return [];
    const oldScore = oldName ? previous[i].total : 0;
    const newScore = nextName ? results[j].total : 0;
    if (old && next && oldScore === newScore && JSON.stringify(normalizePlayer(old)) === JSON.stringify(normalizePlayer(next))) return [];
    const name = oldName === nextName ? nextName : `${oldName || "빈 슬롯"} → ${nextName || "빈 슬롯"}`;
    return [<li key={row}><span>{(next ?? old).pos} · {name}</span><strong>{delta(newScore - oldScore)}점</strong></li>];
  });
  return <section className="card deck-experiment" aria-label="내 덱으로 실험">
    <h3>{original.name || "이름 없는 덱"} · 실험 중</h3>
    <p>선수나 덱 설정을 바꿔 보세요. ‘내 덱에 적용’을 누르면 변경 사항이 저장됩니다.</p>
    <p className="experiment-score">원본 {score(before)} → 실험 {score(after)} <strong>({delta(after - before)}점)</strong></p>
    <details><summary>변경된 선수 {changes.length}명</summary>
      {changes.length ? <ul>{changes}</ul> : <p>선수 입력이나 점수가 달라지면 여기에 표시됩니다.</p>}
    </details>
    <div className="row"><button onClick={onDiscard}>실험 종료</button>
      <button className="primary" disabled={original === working} onClick={onApply}>내 덱에 적용</button></div>
  </section>;
}
