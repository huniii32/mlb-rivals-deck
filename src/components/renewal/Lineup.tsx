import { useState } from "react";
import type { Deck } from "../../lib/deck";
import { deckTotals, type PlayerResult } from "../../lib/engine";
import { ROLE_LABELS, bullpenRole, tacticStatus } from "../../lib/bullpen";
import { cardDisplayName } from "../../lib/cardNames";
import { Stadium } from "./Stadium";

export type RosterPlayer = {
  name: string;
  pos: string;
  artPos: string;
  card: string;
  team: string;
  photoUrl: string;
  score: number;
  skill: number | null;
  stats: number[];
  excelRow: number;
  enhLv: number | "";
};
export type Setting = "덱스코어" | "팀 버프" | "투수 전술";
const format = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function RenewalLineup({
  deck,
  results,
  onSelect,
  openSettings,
  openGuide,
}: {
  deck: Deck;
  results: PlayerResult[];
  onSelect: (row: number) => void;
  openSettings: (setting: Setting) => void;
  openGuide: () => void;
}) {
  const [view, setView] = useState<"art" | "table">("art");
  const [group, setGroup] = useState("타자");
  const counts: Record<string, number> = {};
  const roster: RosterPlayer[] = deck.players.map((p, i) => {
    const role = bullpenRole(p);
    const ordinal = role ? (counts[role] = (counts[role] ?? 0) + 1) : 0;
    return {
      ...p,
      artPos: p.pos,
      pos: role ? `${ROLE_LABELS[role]}${ordinal}` : p.pos,
      score: results[i].total,
      skill: results[i].skill,
      stats: results[i].final,
    };
  });
  const groups = [roster.slice(0, 9), roster.slice(9, 14), roster.slice(14)];
  const filled = groups.map((g) => g.filter((p) => p.name.trim()).length);
  const totalFilled = filled.reduce((a, b) => a + b, 0);
  const shown = groups[["타자", "선발", "불펜"].indexOf(group)];
  const totals = deckTotals(deck.players, results);
  const tactics = tacticStatus(deck.players, deck.bullpenTactics);
  const scores = [totals.bt, totals.sp, totals.rp];
  const settings: [Setting, string, string][] = [
    [
      "덱스코어",
      "▤",
      `선택 ${Object.values(deck.flags).filter(Boolean).length}개`,
    ],
    [
      "팀 버프",
      "✦",
      `적용 ${Object.values(deck.chem).filter((v) => v && v !== "X").length}개`,
    ],
    [
      "투수 전술",
      "⇄",
      `승리조 +${tactics.winningBonus} · 추격조 +${tactics.chasingBonus}`,
    ],
  ];
  return (
    <>
      <section className="overview" aria-label="덱 점수">
        <div className="score-main">
          <div className="eyebrow">TOTAL DECK SCORE</div>
          <strong data-testid="deck-total">
            {format(totals.total)}
            <span>점</span>
          </strong>
          <p>
            랭킹대전 공격 기준 <span>·</span> 변경 즉시 계산
          </p>
          <div className="score-decoration" aria-hidden="true">
            R
          </div>
        </div>
        <div className="overview-breakdown">
          {["타자", "선발", "불펜"].map((s, i) => (
            <div key={s}>
              <span>
                {s} 점수 <small>{[50, 40, 10][i]}%</small>
              </span>
              <strong>{format(scores[i])}</strong>
              <small>등록 {filled[i]}명 기준</small>
            </div>
          ))}
        </div>
        <button className="score-guide-link" onClick={openGuide}>
          점수는 어떻게 계산되나요? <span>↗</span>
        </button>
      </section>
      <div className="lineup-layout">
        <section className="panel roster-panel">
          <div className="panel-heading">
            <div>
              <h2>
                우리 팀 라인업 <span className="count">{totalFilled} / 21</span>
              </h2>
              <p>선수를 선택해 능력치와 스킬을 편집하세요.</p>
            </div>
            <div className="segmented" role="group" aria-label="라인업 보기">
              {(["art", "table"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  className={view === v ? "selected" : ""}
                  onClick={() => setView(v)}
                >
                  {v === "art" ? "▦ 일러스트" : "☷ 표 보기"}
                </button>
              ))}
            </div>
          </div>
          <div className="roster-tabs">
            {["타자", "선발", "불펜"].map((g, i) => (
              <button
                key={g}
                className={group === g ? "selected" : ""}
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
              >
                {g}
                <span>{filled[i]}</span>
              </button>
            ))}
            <small>
              {group === "불펜" ? "최대 7명까지 구성" : "선수별 최종 점수"}
            </small>
          </div>
          {view === "art" ? (
            <Stadium
              players={shown}
              group={group}
              onSelect={(p) => onSelect(p.excelRow)}
              onAdd={() => openSettings("투수 전술")}
            />
          ) : (
            <div className="table-scroll">
              <table
                className={group === "타자" ? "batter-table" : "pitcher-table"}
                aria-label={`${group} 라인업`}
              >
                <colgroup>
                  <col className="col-position" />
                  <col className="col-player" />
                  <col className="col-stat" />
                  <col className="col-stat" />
                  {group === "타자" && <col className="col-stat" />}
                  <col className="col-skill" />
                  <col className="col-total" />
                </colgroup>
                <thead>
                  <tr>
                    <th>위치</th>
                    <th>선수</th>
                    <th>{group === "타자" ? "파워" : "변화"}</th>
                    <th>{group === "타자" ? "정확" : "구위"}</th>
                    {group === "타자" && <th>선구</th>}
                    <th>스킬</th>
                    <th>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.excelRow}>
                      <td>
                        <span className="pos-badge" title={p.pos}>
                          {p.pos
                            .replace("승리조", "승리")
                            .replace("추격조", "추격")
                            .replace("롱릴리프", "롱릴")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="player-name"
                          onClick={() => onSelect(p.excelRow)}
                        >
                          {p.name || "+ 선수 등록"}
                          <small>{cardDisplayName(p.card)}</small>
                        </button>
                      </td>
                      {p.stats
                        .slice(0, group === "타자" ? 3 : 2)
                        .map((s, i) => (
                          <td key={i}>{p.name ? s : "—"}</td>
                        ))}
                      <td className="skill-number">
                        {p.name ? (p.skill?.toFixed(2) ?? "표 없음") : "—"}
                      </td>
                      <td className="total-number">
                        {p.name ? p.score.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-note">
                선수 이름을 선택하면 편집 화면이 열립니다.
              </p>
            </div>
          )}
        </section>
        <aside className="right-column">
          <section className="panel status-panel">
            <div className="eyebrow">CLUB STATUS</div>
            <h2>덱 구성 현황</h2>
            <div className="completion-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="50" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  strokeDasharray={`${(totalFilled / 21) * 314} 314`}
                />
              </svg>
              <strong>
                {totalFilled}
                <span>/ 21명</span>
              </strong>
            </div>
            {["타자", "선발 투수", "불펜 투수"].map((g, i) => (
              <div className="status-line" key={g}>
                <span>{g}</span>
                <b>
                  {filled[i]} / {[9, 5, 7][i]}{" "}
                  {filled[i] === [9, 5, 7][i] && <i>완료</i>}
                </b>
              </div>
            ))}
            <button
              className="full-button"
              onClick={() => {
                setGroup("불펜");
                openSettings("투수 전술");
              }}
            >
              불펜 구성하기 <span>→</span>
            </button>
          </section>
          <section className="panel quick-settings">
            <h2>덱 설정</h2>
            {settings.map(([title, icon, subtitle]) => (
              <button key={title} onClick={() => openSettings(title)}>
                <span className="setting-icon">{icon}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
                <b>›</b>
              </button>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
