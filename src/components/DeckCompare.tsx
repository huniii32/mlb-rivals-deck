import { useState } from "react";
import type { Deck } from "../lib/deck";
import type { SkillTables } from "../lib/engine";
import { calcDeckTotal, deckPlayerResults } from "../lib/engine";
import { LineupView } from "./LineupView";
import { PlayerSummary } from "./DeckPreview";
import { BULLPEN_ROLES, ROLE_LABELS, bullpenRole } from "../lib/bullpen";
import type { PlayerResult } from "../lib/engine";

function comparisonSlots(deck: Deck, results: PlayerResult[]) {
  const counts = Object.fromEntries(BULLPEN_ROLES.map((r) => [r, 0]));
  return deck.players.map((p, i) => {
    const role = bullpenRole(p);
    const n = role ? ++counts[role] : 0;
    return { key: role ? `${role}:${n}` : `row:${p.excelRow}`, label: role ? `${ROLE_LABELS[role]} ${n}` : p.pos, p, res: results[i] };
  });
}

const diffStyle = (d: number) => (d === 0 ? undefined : { color: d > 0 ? "var(--good)" : "var(--danger)" });
const fmtDiff = (d: number) => `${d > 0 ? "+" : ""}${d.toFixed(1)}`;

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
  const mySlots = comparisonSlots(myDeck, mine);
  const otherSlots = comparisonSlots(otherDeck, other);
  const keys = [...new Set([...mySlots, ...otherSlots].map((s) => s.key))];
  const rows = keys.map((key) => {
    const m = mySlots.find((s) => s.key === key);
    const o = otherSlots.find((s) => s.key === key);
    const mt = m?.res.total ?? 0, ot = o?.res.total ?? 0;
    return { pos: (m ?? o)!.label, my: m, other: o, myName: m?.p.name || "-", myTotal: mt, otherName: o?.p.name || "-", otherTotal: ot, diff: mt - ot };
  });
  const selectByExcelRow = (side: "my" | "other", excelRow: number) => {
    const idx = rows.findIndex((r) => r[side]?.p.excelRow === excelRow);
    setSelIdx(idx >= 0 ? idx : null);
  };

  // 서로 다른 불펜 인원도 역할·역할 내 순번 기준으로 비교한다.
  const myDiff: Record<number, number> = {};
  const otherDiff: Record<number, number> = {};
  rows.forEach((r) => {
    if (r.my) myDiff[r.my.p.excelRow] = r.diff;
    if (r.other) otherDiff[r.other.p.excelRow] = -r.diff;
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
            <LineupView players={myDeck.players} results={mine} onSelect={(row) => selectByExcelRow("my", row)} diff={myDiff} />
          </div>
          <div>
            <h4 style={{ margin: "0 0 8px" }}>{otherName}</h4>
            <LineupView players={otherDeck.players} results={other} onSelect={(row) => selectByExcelRow("other", row)} diff={otherDiff} />
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

      {selIdx !== null && rows[selIdx] && (
        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setSelIdx(null); }}>
          <div className="modal-box" style={{ width: "min(1000px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card" style={{ paddingBottom: 4 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h4 style={{ margin: 0 }}>{rows[selIdx].pos} 상세 비교 — 스탯별로 뭐가 부족한지 확인</h4>
                <button onClick={() => setSelIdx(null)}>닫기 ✕</button>
              </div>
            </div>
            <div className="compare-cols">
              {rows[selIdx].my ? <PlayerSummary p={rows[selIdx].my!.p} res={rows[selIdx].my!.res} tables={tables} /> : <p>해당 역할의 선수가 없습니다.</p>}
              {rows[selIdx].other ? <PlayerSummary p={rows[selIdx].other!.p} res={rows[selIdx].other!.res} tables={tables} /> : <p>해당 역할의 선수가 없습니다.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
