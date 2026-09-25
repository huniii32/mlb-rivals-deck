import type { PlayerInput, PlayerResult } from "../lib/engine";
import { DECK_WEIGHTS, deckTotals } from "../lib/engine";

/** 덱랭킹 탭 하단: 현재 덱 점수 + 내 선수 랭킹 (스킬 1:1 비교는 스킬비교 탭) */
export function ResultPanel({ players, results }: { players: PlayerInput[]; results: PlayerResult[] }) {
  const { sp: dSP, rp: dRP, bt: dBT, total } = deckTotals(players, results);

  const ranking = players
    .map((p, i) => ({ name: p.name || p.pos, pos: p.pos, score: results[i].total }))
    .filter((r) => r.name).sort((a, b) => b.score - a.score);

  // 엑셀 BB/BD 덱코 합계 대응: 좌/우 선택에 따라 바뀌는 스탯별 합계
  const deckRows = players
    .map((p, i) => ({ pos: p.pos, name: p.name || p.pos, deck: results[i].deck, named: !!p.name.trim() }))
    .filter((r) => r.named);
  const deckSum = [0, 1, 2].map((s) => deckRows.reduce((a, r) => a + (r.deck[s] ?? 0), 0));

  return (
    <div>
      <div className="card">
        <h3>덱 점수 (랭대 공격 기준)</h3>
        <div className="score">{total.toFixed(1)}</div>
        <div className="muted">
          선발 {dSP.toFixed(1)} × {DECK_WEIGHTS.sp} + 계투 {dRP.toFixed(1)} × {DECK_WEIGHTS.rp} + 타자 {dBT.toFixed(1)} × {DECK_WEIGHTS.bt}
          {" "}(이름 있는 선수만 평균)
        </div>
      </div>
      <div className="card">
        <h3>선수 랭킹 (내 덱)</h3>
        <table>
          <thead><tr><th>#</th><th>포지션</th><th>선수</th><th>최종점수</th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.pos}</td><td>{r.name}</td><td><b>{r.score.toFixed(1)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>덱코 합계 (좌/우 선택 연동)</h3>
        <table>
          <thead><tr><th>포지션</th><th>선수</th><th>스탯1</th><th>스탯2</th><th>스탯3</th><th>합</th></tr></thead>
          <tbody>
            {deckRows.map((r, i) => {
              const d = [r.deck[0] ?? 0, r.deck[1] ?? 0, r.deck[2] ?? 0];
              return (
                <tr key={i}><td>{r.pos}</td><td>{r.name}</td>
                  <td>{d[0]}</td><td>{d[1]}</td><td>{d[2]}</td><td><b>{d[0] + d[1] + d[2]}</b></td></tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={2}><b>합계</b></td>
            <td><b>{deckSum[0]}</b></td><td><b>{deckSum[1]}</b></td><td><b>{deckSum[2]}</b></td>
            <td><b>{deckSum[0] + deckSum[1] + deckSum[2]}</b></td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
