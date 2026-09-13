import { useState } from "react";
import type { Chem } from "../lib/engine";
import { LOOKUP, allThresholds, referencedFlags } from "../lib/engine";

const CHEM_LABELS: [keyof Chem, string, string][] = [
  ["commander", "커맨더", "commander"],
  ["catcher", "포수리드", "catcher"],
  ["pitchChem", "투수케미스트리", "pitchChem"],
  ["batChem", "타자케미스트리", "batChem"],
  ["wbcP", "WBC에이스(투수)", "wbcP"],
  ["wbcB", "WBC에이스(타자)", "wbcB"],
];

const POS_LABEL: Record<number, string> = {
  11: "C", 12: "1B", 13: "2B", 14: "3B", 15: "SS", 16: "LF", 17: "CF", 18: "RF", 19: "DH",
  22: "SP1", 23: "SP2", 24: "SP3", 25: "SP4", 26: "SP5",
  27: "RP1", 28: "RP2", 29: "RP3", 30: "CP1",
};

function rowLabel(row: number): string {
  if (row === 10) return "전체";
  return POS_LABEL[row] ?? `행${row}`;
}

// 연도 입력행 -> 스덱코 임계값 행 옆에 표시 (규칙: 33→615, 35→645, 37→680)
export const YEAR_ANCHOR: Record<number, number> = { 615: 33, 645: 35, 680: 37 };

export function ChemPanel({ chem, setChem }: {
  chem: Chem;
  setChem: (c: Chem) => void;
}) {
  return (
    <div className="card">
      <h3>케미스트리 (투수·타자·WBC·커맨더·포수리드)</h3>
      <div className="row">
        {CHEM_LABELS.map(([k, label, opt]) => (
          <label key={k}>{label}{" "}
            <select value={chem[k]} onChange={(e) => setChem({ ...chem, [k]: e.target.value })}>
              {(LOOKUP.chem[opt] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="muted">스킬의 커맨더·포수리드는 타자 능력치에만 반영, 투수 버프는 여기서 선택한 값으로 자동 반영(원본 로직 동일).</p>
    </div>
  );
}

export function DeckScorePanel({ flags, toggleFlag, setRowSide, yearInputs, setYearInput,
}: {
  flags: Record<string, boolean>;
  toggleFlag: (key: string) => void;
  setRowSide: (region: string, row: number, side: "L" | "R") => void;
  yearInputs: Record<number, number | "">;
  setYearInput: (row: number, v: number | "") => void;
}) {
  const [scoreTab, setScoreTab] = useState<"team" | "spec">("team");
  const all = referencedFlags();
  // (region, row)별 L/R 묶기. 게임 화면처럼 행마다 좌·우 둘 중 하나만 선택.
  const rows = new Map<string, { region: string; row: number; threshold: number | null; sides: ("L" | "R")[] }>();
  for (const f of all) {
    if (f.region !== "team" && f.region !== "spec") continue;
    const k = `${f.region}-${f.row}`;
    const g = rows.get(k) ?? { region: f.region, row: f.row, threshold: f.threshold, sides: [] };
    if (!g.sides.includes(f.side as "L" | "R")) g.sides.push(f.side as "L" | "R");
    if (g.threshold === null) g.threshold = f.threshold;
    rows.set(k, g);
  }
  const list = [...rows.values()]
    .filter((g) => g.region === scoreTab)
    .sort((a, b) => (a.threshold ?? 9999) - (b.threshold ?? 9999) || a.row - b.row);
  // 규칙 미참조 팀덱코행(330/345): 엑셀에도 O표시만 있고 점수에 안 들어감. 표시·토글은 되게 추가.
  if (scoreTab === "team") {
    const have = new Set(list.map((g) => g.row));
    for (const { row, threshold } of allThresholds("team")) {
      if (!have.has(row)) list.push({ region: "team", row, threshold, sides: ["L", "R"] });
    }
    list.sort((a, b) => (a.threshold ?? 9999) - (b.threshold ?? 9999) || a.row - b.row);
  }
  // 연도 입력행(615/645/680): 스코어 규칙에서 참조하지 않아 목록에 없으므로 표시 전용 행으로 추가
  if (scoreTab === "spec") {
    const have = new Set(list.map((g) => g.threshold));
    for (const [th, yrow] of Object.entries(YEAR_ANCHOR)) {
      const t = Number(th);
      if (!have.has(t)) list.push({ region: "spec", row: yrow, threshold: t, sides: [] });
    }
    list.sort((a, b) => (a.threshold ?? 9999) - (b.threshold ?? 9999) || a.row - b.row);
  }

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
        <p className="muted">행마다 좌·우 중 하나만 선택 (다시 누르면 해제). 게임 덱스코어 화면과 같은 방식. 연도행: 선수 연도가 입력 연도 이후 0~9년 이내면 +1.</p>
        <div className="deckscore-rows">
          {list.map((g) => {
            const onL = !!flags[`${g.row}-${g.region}-L`];
            const onR = !!flags[`${g.row}-${g.region}-R`];
            const yearRow = g.threshold !== null ? YEAR_ANCHOR[g.threshold] : undefined;
            return (
              <div key={`${g.region}-${g.row}`} className="deckscore-row">
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
                          onClick={() => {
                            const key = `${g.row}-${g.region}-${s}`;
                            // 한쪽만 있는 행이면 기존 체크 토글, 양쪽 행이면 택1 로직
                            if (g.sides.length < 2) toggleFlag(key);
                            else setRowSide(g.region, g.row, s);
                          }}>
                          <span>{g.sides.length < 2 ? "선택" : s === "L" ? "좌" : "우"}</span>
                          {on && <b className="dia-check">✓</b>}
                        </button>
                      );
                    })}
                  </span>
                )}
                {yearRow !== undefined && (
                  <label className="deckscore-year">행{yearRow} 연도
                    <input
                      type="number"
                      value={yearInputs[yearRow] ?? ""}
                      placeholder="예: 2020"
                      onChange={(e) => setYearInput(yearRow, e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
