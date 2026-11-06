import { useState } from "react";
import type { Chem } from "../lib/engine";
import { LOOKUP } from "../lib/engine";
import { LINEUP } from "../lib/deck";
import { decadeTarget, decadeStatus, type DeckScoreRegion, type DeckScoreSide } from "../lib/deckScoreTargets";
import { DECK_SCORE_OPTIONS } from "../lib/deckScoreOptions";

const CHEM_LABELS: [keyof Chem, string][] = [
  ["commander", "커맨더"],
  ["catcher", "포수리드"],
  ["pitchChem", "투수케미스트리"],
  ["batChem", "타자케미스트리"],
  ["wbcP", "WBC에이스(투수)"],
  ["wbcB", "WBC에이스(타자)"],
  ["comebackFlag", "컴백 플래그(동점·열세)"],
  ["lockdown", "락다운(CP 배치)"],
];

const POS_LABEL: Record<number, string> = Object.fromEntries(LINEUP.map((l) => [l.row, l.pos]));

function rowLabel(row: number): string {
  if (row === 10) return "전체";
  return POS_LABEL[row] ?? `행${row}`;
}

export function ChemPanel({ chem, setChem }: {
  chem: Chem;
  setChem: (c: Chem) => void;
}) {
  return (
    <div className="card">
      <h3>팀 버프 · 케미스트리</h3>
      <div className="row">
        {CHEM_LABELS.map(([k, label]) => (
          <label key={k}>{label}{" "}
            <select aria-label={label} value={chem[k] ?? "X"} onChange={(e) => setChem({ ...chem, [k]: e.target.value })}>
              {(LOOKUP.chem[k] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="muted">스킬의 커맨더·포수리드는 타자 능력치에만 반영, 투수 버프는 여기서 선택한 값으로 자동 반영(원본 로직 동일).</p>
      <p className="muted">컴백 플래그는 동점·열세 조건을 적용할 때 팀 타자의 파워·정확을 S/S1 +3, S2 +4로 평가합니다. 락다운은 CP 배치 효과를 랭킹대전 9이닝 중 7~9회 비중으로 반영하며 중복 적용하지 않습니다.</p>
    </div>
  );
}

export function DeckScorePanel({ flags, toggleFlag, setRowSide, yearInputs, setYearInput,
}: {
  flags: Record<string, boolean>;
  toggleFlag: (key: string) => void;
  setRowSide: (region: DeckScoreRegion, row: number, side: DeckScoreSide) => void;
  yearInputs: Record<number, number | "">;
  setYearInput: (row: number, v: number | "") => void;
}) {
  const [scoreTab, setScoreTab] = useState<"team" | "spec">("team");
  const list = DECK_SCORE_OPTIONS[scoreTab];

  return (
    <div>
      <div className="card">
        <h3>팀덱코 · 스덱코</h3>
        <div className="deckscore-tabs" role="tablist" aria-label="덱스코어 종류">
          {(["team", "spec"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={scoreTab === t}
              className={scoreTab === t ? "on" : ""} onClick={() => setScoreTab(t)}>
              {t === "team" ? "팀 덱 스코어" : "스페셜 덱 스코어"}
            </button>
          ))}
        </div>
        <ul className="tight-list muted">
          <li>행마다 좌·우 중 하나만 선택 (다시 누르면 해제)</li>
          <li>615·645: 타자 또는 투수와 기준 연도를 함께 선택해야 적용됩니다.</li>
          <li>연도 조건: 입력 연도부터 9년 뒤까지 (2020 → 2020~2029)</li>
          <li>팀 덱 스코어: 선택 효과 적용 (일부 카드·타순 조건 필요)</li>
          <li>포지션별 값 차이는 타순·카드·강화Lv·연도 조건 때문</li>
        </ul>
        <div className="deckscore-rows">
          {list.map((g) => {
            const onL = !!flags[`${g.row}-${g.region}-L`];
            const onR = !!flags[`${g.row}-${g.region}-R`];
            const { yearRow, targetRow } = g;
            const target = targetRow === undefined ? null : decadeTarget(flags, targetRow);
            return (
              <div key={`${g.region}-${g.row}`} className={`deckscore-row${targetRow !== undefined ? " deckscore-target-row" : ""}`}>
                <span className="dia dia-th" title={rowLabel(g.row)}>
                  <span>{g.threshold ?? rowLabel(g.row)}</span>
                </span>
                {g.sides.length > 0 && (
                  <span className={`dia-pair${g.sides.length < 2 ? " centered" : ""}`}>
                    {(["L", "R"] as const).map((s) => {
                      if (!g.sides.includes(s)) return null;
                      const on = s === "L" ? onL : onR;
                      return (
                        <button key={s} className={`dia dia-opt${on ? " on" : ""}`}
                          title={`${rowLabel(g.row)} ${s === "L" ? "좌" : "우"}${on ? " (선택됨, 다시 누르면 해제)" : ""}`}
                          aria-pressed={on}
                          aria-label={`${g.region === "team" ? "팀" : "스페셜"} 덱스코어 ${g.threshold ?? g.row} ${s === "L" ? "좌" : "우"}`}
                          onClick={() => {
                            const key = `${g.row}-${g.region}-${s}`;
                            // 한쪽만 있는 행이면 기존 체크 토글, 양쪽 행이면 택1 로직
                            if (g.sides.length < 2) toggleFlag(key);
                            else setRowSide(g.region, g.row, s);
                          }}>
                          <span>{targetRow !== undefined ? s === "L" ? "타자" : "투수" : g.sides.length < 2 ? "선택" : s === "L" ? "좌" : "우"}</span>
                          {on && <b className="dia-check">✓</b>}
                        </button>
                      );
                    })}
                  </span>
                )}
                {yearRow !== undefined && (
                  <label className="deckscore-year">기준 연도
                    <input
                      aria-label={`스페셜 덱스코어 ${g.threshold} 기준 연도`}
                      type="number"
                      value={yearInputs[yearRow] ?? ""}
                      placeholder="예: 2020"
                      onChange={(e) => setYearInput(yearRow, e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </label>
                )}
                {targetRow !== undefined && (
                  <p className="deckscore-target-status" role="status">
                    {decadeStatus(g.threshold!, target, yearInputs[targetRow])}
                  </p>
                )}
                {g.region === "team" && (g.threshold === 330 || g.threshold === 345) && <span className="muted deckscore-no-points">평가 능력치 가산 없음</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
