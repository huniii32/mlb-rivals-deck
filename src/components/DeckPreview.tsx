import { cardDisplayName } from "../lib/cardNames";
import { useMemo, useState } from "react";
import type { PlayerResult, SkillTables } from "../lib/engine";
import { deckPlayerResults, fmtScore, skillScore } from "../lib/engine";
import { LineupView } from "./LineupView";
import type { Deck } from "../lib/deck";
import { DECK_SCORE_OPTIONS } from "../lib/deckScoreOptions";
import type { DeckScoreRegion } from "../lib/deckScoreTargets";

// 엑셀 덱코표식 읽기 전용 표: 임계값 + 좌/우 O
function ScoreTable({ region, title, flags, yearInputs }: {
  region: DeckScoreRegion; title: string;
  flags: Record<string, boolean>; yearInputs: Record<number, number | "">;
}) {
  const groups = DECK_SCORE_OPTIONS[region];
  return (
    <div className="card">
      <h3>{title}</h3>
      <table>
        <thead><tr><th></th><th>좌</th><th>우</th><th>연도</th></tr></thead>
        <tbody>
          {groups.map((g) => {
            const yr = g.yearRow;
            return (
              <tr key={g.row}>
                <td><b>{g.threshold}</b></td>
                <td style={{ textAlign: "center" }}>{g.sides.includes("L") ? (flags[`${g.row}-${region}-L`] ? "O" : "") : "-"}</td>
                <td style={{ textAlign: "center" }}>{g.sides.includes("R") ? (flags[`${g.row}-${region}-R`] ? "O" : "") : "-"}</td>
                <td className="muted">{yr !== undefined ? (yearInputs[yr] === "" ? "" : yearInputs[yr]) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerSummary({ p, res, tables }: {
  p: Deck["players"][number]; res: PlayerResult; tables: SkillTables;
}) {
  const stats = p.kind === "batter" ? ["파워", "정확", "선구"] : ["변화", "구위"];
  const num = (v: number | "") => (v === "" ? "-" : v);
  return (
    <div className="card">
      <h3>{p.name} <span className="muted">{p.pos} · {cardDisplayName(p.card)} {p.year && `· ${p.year}`}</span></h3>
      <table className="ed-stats">
        <thead><tr><th>스탯</th><th>기본</th><th>훈련</th><th>특훈</th><th>포지션</th><th>시너지</th><th>라커룸</th><th>초월</th><th>강화</th><th>포훈</th><th>덱코</th><th>전술</th><th>자동</th><th>최종</th></tr></thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s} className={res.manual[i] ? "manual" : ""}>
              <td><b>{s}</b></td>
              <td>{num(p.base[i])}</td><td>{num(p.train[i])}</td><td>{num(p.spec[i])}</td>
              <td>{num(p.extra[i])}</td><td>{num(p.synergy[i])}</td><td>{num(p.locker[i])}</td>
              <td className="calc">+{res.trans[i] ?? 0}</td>
              <td className="calc">+{res.enh[i] ?? 0}</td>
              <td className="calc">+{res.poh[i] ?? 0}</td>
              <td className="calc">+{res.deck[i]}</td>
              <td className="calc">+{res.tactics[i]}</td>
              <td className="calc"><b>{res.auto[i]}</b></td>
              <td><b>{res.final[i]}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ed-stats" style={{ marginTop: 8 }}>
        <thead><tr><th>슬롯</th><th>스킬</th><th>점수</th></tr></thead>
        <tbody>
          {p.skills.map((s, i) => {
            const sc = s.trim() ? skillScore(p.kind, s, tables) : 0;
            return (
              <tr key={i}>
                <td>스킬{i + 1}</td>
                <td>{s.trim() || "-"}</td>
                <td>{s.trim() === "" ? "-" : sc === null ? <b className="pill bad-pill">표없음</b> : <b>+{fmtScore(sc)}</b>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ed-result">
        {res.team !== 0 && <div><span>추가 팀 버프</span><b>+{res.team.toFixed(1)}</b></div>}
        <div><span>능력치</span><b>{res.ability.toFixed(1)}</b></div>
        <div><span>스킬점</span><b>{res.skill === null ? "표없음" : res.skill.toFixed(1)}</b></div>
        <div><span>최종점</span><b>{res.total.toFixed(1)}</b></div>
      </div>
      {res.warnings.length > 0 && (
        <div className="warn">{res.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
      )}
    </div>
  );
}

/** 덱 미리보기 팝업: 라인업(클릭하면 선수 정보) + 엑셀식 덱코표. 읽기 전용. */
export function DeckPreviewModal({ deck, tables, close }: {
  deck: Deck; tables: SkillTables; close: () => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const { flags, chem } = deck;
  const results = useMemo(
    () => deckPlayerResults(deck, tables),
    [deck, tables],
  );

  const selPlayer = sel === null ? null : deck.players.find((p) => p.excelRow === sel) ?? null;
  const selRes = selPlayer ? results[deck.players.indexOf(selPlayer)] : null;

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" style={{ width: "min(1100px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{deck.name} 미리보기</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          <p className="muted">
            커맨더 {chem.commander} · 포수리드 {chem.catcher} · 투수케미 {chem.pitchChem} ·
            타자케미 {chem.batChem} · WBC투 {chem.wbcP} · WBC타 {chem.wbcB} (읽기 전용)
          </p>
        </div>
        <LineupView players={deck.players} results={results} onSelect={setSel} />
        {selPlayer && selRes && <PlayerSummary p={selPlayer} res={selRes} tables={tables} />}
        <div className="grid" style={{ alignItems: "start" }}>
          <ScoreTable region="team" title="팀덱코" flags={flags} yearInputs={deck.yearInputs} />
          <ScoreTable region="spec" title="스덱코" flags={flags} yearInputs={deck.yearInputs} />
        </div>
      </div>
    </div>
  );
}
