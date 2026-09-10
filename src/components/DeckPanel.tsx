import type { Chem } from "../lib/engine";
import { LOOKUP, referencedFlags } from "../lib/engine";

const CHEM_LABELS: [keyof Chem, string, string][] = [
  ["commander", "커맨더", "commander"],
  ["catcher", "포수리드", "catcher"],
  ["pitchChem", "투케(투수케미)", "pitchChem"],
  ["batChem", "타케(타자케미)", "batChem"],
  ["wbcP", "WBC에이스(투수)", "wbcP"],
  ["wbcB", "WBC에이스(타자)", "wbcB"],
];

const POS_LABEL: Record<number, string> = {
  11: "C", 12: "1B", 13: "2B", 14: "3B", 15: "SS", 16: "LF", 17: "CF", 18: "RF", 19: "DH",
  22: "SP1", 23: "SP2", 24: "SP3", 25: "SP4", 26: "SP5",
  27: "RP1", 28: "RP2", 29: "RP3", 30: "CP1",
};

export function DeckPanel({  chem, setChem, flags, toggleFlag, yearInputs, setYearInput,
}: {
  chem: Chem;
  setChem: (c: Chem) => void;
  flags: Record<string, boolean>;
  toggleFlag: (key: string) => void;
  yearInputs: Record<number, number | "">;
  setYearInput: (row: number, v: number | "") => void;
}) {
  const all = referencedFlags();
  const team = all.filter((f) => f.region === "team");
  const spec = all.filter((f) => f.region === "spec");
  const renderGroup = (list: typeof all, title: string) => (
    <div className="card">
      <h4>{title}</h4>
      <div className="grid">
        {(["L", "R"] as const).map((side) => (
          <div key={side}>
            <div className="muted">{side === "L" ? "좌" : "우"}</div>
            <div className="deck-check">
            {list.filter((f) => f.side === side).map((f) => {
              const key = `${f.row}-${f.region}-${f.side}`;
              const label = POS_LABEL[f.row] ?? (f.row === 10 ? "전체(헤더)" : `행${f.row}`);
              return (
                <label key={key}>
                  <input type="checkbox" checked={!!flags[key]} onChange={() => toggleFlag(key)} /> {label}
                </label>
              );
            })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <div className="card">
        <h3>케미스트리 (투케·타케·WBC·커맨더·포수리드)</h3>
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
      {renderGroup(team, "팀덱코 달성 체크")}
      {renderGroup(spec, "스덱코 달성 체크")}
      <div className="card">
        <h4>연도 조건 (스덱코)</h4>
        <div className="row">
          {[33, 35, 37].map((r) => (
            <label key={r}>행{r} 연도{" "}
              <input
                type="number"
                style={{ width: 80 }}
                value={yearInputs[r] ?? ""}
                placeholder="예: 2020"
                onChange={(e) => setYearInput(r, e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <p className="muted">선수 연도가 입력 연도 이후 0~9년 이내면 +1 (원본: 연도-입력연도가 0~9).</p>
      </div>
    </div>
  );
}
