import { useState } from "react";
import type { Deck } from "../App";
import type { SkillTables } from "../lib/engine";
import { calcDeckTotal, deckPlayerResults } from "../lib/engine";
import { LineupView } from "./LineupView";
import { PlayerSummary } from "./DeckPreview";

const diffStyle = (d: number) => (d === 0 ? undefined : { color: d > 0 ? "var(--good)" : "var(--danger)" });
const fmtDiff = (d: number) => `${d > 0 ? "+" : ""}${d.toFixed(1)}`;

const artOf = (d: Deck): Record<number, string> => {
  const out: Record<number, string> = {};
  for (const p of d.players) if (p.photoUrl.trim()) out[p.excelRow] = p.photoUrl.trim();
  return out;
};

/** 내 덱 vs 남 덱(공개 랭킹·내 다른 덱) 1:1 비교 팝업: 라인업 두 개를 좌우로 보여줌
 *  (좁은 화면에선 .compare-cols가 세로로 쌓이도록 styles.css에서 처리) */
export function DeckCompareModal({
  myName, myDeck, otherName, otherDeck, tables, close,
}: {
  myName: string; myDeck: Deck; otherName: string; otherDeck: Deck;
  tables: SkillTables; close: () => void;
}) {
  const mine = deckPlayerResults(myDeck, tables);
  const other = deckPlayerResults(otherDeck, tables);
  const mySum = calcDeckTotal(myDeck, tables);
  const otherSum = calcDeckTotal(otherDeck, tables);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const selectByExcelRow = (excelRow: number) => {
    const idx = myDeck.players.findIndex((p) => p.excelRow === excelRow);
    setSelIdx(idx >= 0 ? idx : null);
  };

  // 포지션(excelRow) 기준 차이 맵 — 카드에 뱃지로 표시
  const myDiff: Record<number, number> = {};
  const otherDiff: Record<number, number> = {};
  myDeck.players.forEach((p, i) => {
    const op = otherDeck.players[i];
    const d = (mine[i]?.total ?? 0) - (other[i]?.total ?? 0);
    myDiff[p.excelRow] = d;
    otherDiff[op.excelRow] = -d;
  });

  const rows = myDeck.players.map((p, i) => {
    const op = otherDeck.players[i];
    const mt = mine[i]?.total ?? 0;
    const ot = other[i]?.total ?? 0;
    return { pos: p.pos, myName: p.name || "-", myTotal: mt, otherName: op?.name || "-", otherTotal: ot, diff: mt - ot };
  });
  const totalDiff = mySum.total - otherSum.total;

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" style={{ width: "min(1400px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>덱 비교: {myName} vs {otherName}</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th></th><th>{myName}</th><th>{otherName}</th><th>차이</th></tr></thead>
            <tbody>
              <tr><td>총점</td><td><b>{mySum.total.toFixed(1)}</b></td><td><b>{otherSum.total.toFixed(1)}</b></td>
                <td style={diffStyle(totalDiff)}><b>{fmtDiff(totalDiff)}</b></td></tr>
              <tr><td>선발</td><td>{mySum.sp.toFixed(1)}</td><td>{otherSum.sp.toFixed(1)}</td>
                <td style={diffStyle(mySum.sp - otherSum.sp)}>{fmtDiff(mySum.sp - otherSum.sp)}</td></tr>
              <tr><td>계투</td><td>{mySum.rp.toFixed(1)}</td><td>{otherSum.rp.toFixed(1)}</td>
                <td style={diffStyle(mySum.rp - otherSum.rp)}>{fmtDiff(mySum.rp - otherSum.rp)}</td></tr>
              <tr><td>타자</td><td>{mySum.bt.toFixed(1)}</td><td>{otherSum.bt.toFixed(1)}</td>
                <td style={diffStyle(mySum.bt - otherSum.bt)}>{fmtDiff(mySum.bt - otherSum.bt)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="compare-cols">
          <div>
            <h4 style={{ margin: "0 0 8px" }}>{myName}</h4>
            <LineupView
              batters={myDeck.players.slice(0, 9)} pitchers={myDeck.players.slice(9)}
              bRes={mine.slice(0, 9)} pRes={mine.slice(9)}
              onSelect={selectByExcelRow} art={artOf(myDeck)} diff={myDiff}
            />
          </div>
          <div>
            <h4 style={{ margin: "0 0 8px" }}>{otherName}</h4>
            <LineupView
              batters={otherDeck.players.slice(0, 9)} pitchers={otherDeck.players.slice(9)}
              bRes={other.slice(0, 9)} pRes={other.slice(9)}
              onSelect={selectByExcelRow} art={artOf(otherDeck)} diff={otherDiff}
            />
          </div>
        </div>

        <div className="card">
          <h3>포지션별 상세</h3>
          <p className="muted">행을 클릭하면 스탯별 비교 팝업이 뜹니다.</p>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>포지션</th><th>{myName}</th><th>{otherName}</th><th>차이</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="clickable-row" onClick={() => setSelIdx(i)}>
                  <td>{r.pos}</td>
                  <td>{r.myName} <b>{r.myTotal.toFixed(1)}</b></td>
                  <td>{r.otherName} <b>{r.otherTotal.toFixed(1)}</b></td>
                  <td style={diffStyle(r.diff)}><b>{fmtDiff(r.diff)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selIdx !== null && (
        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setSelIdx(null); }}>
          <div className="modal-box" style={{ width: "min(1000px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card" style={{ paddingBottom: 4 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h4 style={{ margin: 0 }}>{myDeck.players[selIdx].pos} 상세 비교 — 스탯별로 뭐가 부족한지 확인</h4>
                <button onClick={() => setSelIdx(null)}>닫기 ✕</button>
              </div>
            </div>
            <div className="compare-cols">
              <PlayerSummary p={myDeck.players[selIdx]} res={mine[selIdx]} tables={tables} />
              <PlayerSummary p={otherDeck.players[selIdx]} res={other[selIdx]} tables={tables} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
