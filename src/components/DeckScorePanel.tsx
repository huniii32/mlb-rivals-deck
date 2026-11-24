import { useState } from "react";
import { TEAMS } from "../lib/mlbTeams";
import type { PlayerInput } from "../lib/engine";
import { BATTER_STATS, PITCHER_STATS, DECK_SCORE_OPTIONS, selectedEffect, rowPlayers } from "../lib/deckScoreOptions";
import { decadeStatus, decadeTarget, type DeckScoreRegion, type DeckScoreSide } from "../lib/deckScoreTargets";
import "./renewal/styles/deck-score.css";

type ScoreRow = typeof DECK_SCORE_OPTIONS.team[number];
function statLabel(effect: ScoreRow["left"], kind?: PlayerInput["kind"]) {
  const groups = new Map<number, string[]>();
  for (const [stat, value] of Object.entries(effect.bonuses)) {
    if (kind && (kind === "pitcher" ? BATTER_STATS : PITCHER_STATS).some(s => s === stat)) continue;
    if (stat === "전체") return `모든 능력치 +${value}`;
    groups.set(value, [...(groups.get(value) ?? []), stat]);
  }
  return [...groups].map(([value, stats]) => `${stats.join("·")} +${value}`).join(" / ") || "평가 능력치 가산 없음";
}

function AppliedPlayers({ rule, choice, players, yearInputs, preferredTeam }: {
  rule: ScoreRow; choice: ScoreRow["left"]; players: PlayerInput[];
  yearInputs: Record<number, number | "">; preferredTeam: string;
}) {
  const rows = rowPlayers(rule, choice, players, yearInputs, preferredTeam);
  const applied = rows.filter(r => r.state === "applied");
  return <details className="score-applied">
    <summary>적용 선수 {applied.length}명</summary>
    {!rows.length && <p>라인업에 선수를 입력하면 이 구간의 효과를 확인할 수 있습니다.</p>}
    {(["applied", "unknown", "excluded"] as const).map(state => {
      const group = state === "applied" ? applied : rows.filter(r => r.state === state);
      if (!group.length) return null;
      return <div key={state}><strong>{{ applied: "이 구간의 효과", unknown: "확인 필요", excluded: "조건 미충족" }[state]}</strong>
        <ul>{group.map(({ player, reason }) => <li key={player.excelRow}>
          <span>{player.pos} · {player.name}</span><span>{reason || statLabel(choice, player.kind)}</span>
        </li>)}</ul></div>;
    })}
  </details>;
}

export function DeckScorePanel({ players, preferredTeam, setPreferredTeam, flags, toggleFlag, setRowSide, yearInputs, setYearInput,
}: {
  players: PlayerInput[];
  preferredTeam: string;
  setPreferredTeam: (team: string) => void;
  flags: Record<string, boolean>;
  toggleFlag: (key: string) => void;
  setRowSide: (region: DeckScoreRegion, row: number, side: DeckScoreSide) => void;
  yearInputs: Record<number, number | "">;
  setYearInput: (row: number, v: number | "") => void;
}) {
  const [scoreTab, setScoreTab] = useState<DeckScoreRegion>("team");
  const [range, setRange] = useState("");
  const list = DECK_SCORE_OPTIONS[scoreTab];
  const ranges = [...new Set(list.map(g => Math.floor(g.threshold / 100) * 100))];
  const configured = list.filter(g => {
    const hasYear = g.yearRow === undefined || typeof yearInputs[g.yearRow] === "number";
    const selections = g.sides.filter(side => flags[`${g.row}-${g.region}-${side}`]).length;
    return hasYear && (!g.sides.length || selections === 1);
  }).length;

  return <section className="score-picker" aria-label="덱스코어 설정">
    <div className="score-switch" role="tablist" aria-label="덱스코어 종류">
      {(["team", "spec"] as const).map(t => <button key={t} type="button" role="tab" aria-selected={scoreTab === t}
        onClick={() => { setScoreTab(t); setRange(""); }}>
        {t === "team" ? "팀 덱 스코어" : "스페셜 덱 스코어"}
      </button>)}
    </div>
    <div className="score-summary">
      <div><span>설정한 구간</span>
        <div className="score-count"><strong>{configured}</strong><span>/ {list.length}</span></div>
        <progress aria-label="설정한 구간" max={list.length} value={configured}/>
      </div>
      <label>선호 구단<select aria-label="선호 구단" value={preferredTeam} onChange={e => setPreferredTeam(e.target.value)}>
        <option value="">구단 선택</option>
        {TEAMS.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
      </select></label>
    </div>
    <div className="score-list-head"><h3>구간별 효과</h3>
      <select aria-label="점수 구간" value={range} onChange={e => setRange(e.target.value)}>
        <option value="">전체 구간</option>{ranges.map(n => <option key={n} value={n}>{n}점대</option>)}
      </select>
    </div>
    <p className="score-help">한 구간에 효과 하나를 선택하세요. 선택한 효과를 다시 누르면 해제됩니다.</p>
    {list.filter(g => !range || Math.floor(g.threshold / 100) * 100 === Number(range)).map(g => {
      const { yearRow, targetRow } = g;
      const choice = selectedEffect(g, flags);
      return <section key={g.region + g.row} aria-label={`${g.threshold}점 구간`} className="score-line">
        <h4>{g.threshold}</h4>
        <div className="score-line-body">
          <div className="score-effects">
            {g.sides.map(side => {
              const key = `${g.row}-${g.region}-${side}`;
              const effect = side === "L" ? g.left : g.right!;
              return <button type="button" key={key} className="score-effect" aria-pressed={!!flags[key]}
                aria-label={`${g.region === "team" ? "팀" : "스페셜"} 덱스코어 ${g.threshold} ${side === "L" ? "좌" : "우"}`}
                aria-describedby={`effect-${key}`}
                onClick={() => g.sides.length === 1 ? toggleFlag(key) : setRowSide(g.region, g.row, side)}>
                <span className="score-marker" aria-hidden="true">{flags[key] ? "✓" : ""}</span>
                <span id={`effect-${key}`}><strong>{effect.target}</strong><span>{statLabel(effect)}</span></span>
              </button>;
            })}
            {!g.sides.length && <div className="score-year-effect"><strong>{g.left.target}</strong> · {statLabel(g.left)}</div>}
          </div>
          {yearRow !== undefined && <div className="score-year">
            <label>기준 연도<input aria-label={`스페셜 덱스코어 ${g.threshold} 기준 연도`} type="number"
              placeholder="예: 2020" value={yearInputs[yearRow] ?? ""}
              onChange={e => setYearInput(yearRow, e.target.value === "" ? "" : Number(e.target.value))}/></label>
            <p className="deckscore-target-status" role="status">{targetRow !== undefined
              ? decadeStatus(g.threshold, decadeTarget(flags, targetRow), yearInputs[yearRow])
              : typeof yearInputs[yearRow] === "number" ? `${yearInputs[yearRow]}~${Number(yearInputs[yearRow]) + 9}년` : "연도를 입력하면 적용됩니다."}</p>
          </div>}
          {choice && (g.sides.length > 0 || typeof yearInputs[yearRow!] === "number") &&
            <AppliedPlayers rule={g} choice={choice} players={players} yearInputs={yearInputs} preferredTeam={preferredTeam}/>}
        </div>
      </section>;
    })}
    <details className="score-notes"><summary>카드·연대 적용 기준</summary>
      <p>선호 구단 효과는 선수의 팀이 일치할 때 적용됩니다. FA·WBC·명예의 전당 카드는 모든 구단에서 선호 구단 효과를 받습니다.</p>
      <p>스페셜 440점은 선수 편집에 입력한 OVR이 80 이상일 때 적용됩니다. 연대 효과는 입력한 연도부터 10년간의 카드에 적용되며, 명예의 전당·모먼트 계열은 제외됩니다.</p>
    </details>
  </section>;
}
