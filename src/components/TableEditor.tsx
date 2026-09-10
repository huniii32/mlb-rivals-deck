import { useState } from "react";
import type { SkillTables, TableKind } from "../lib/engine";
import { TABLE_LABEL, TABLE_LEVELS, getTable } from "../lib/engine";
import { Num } from "./inputs";

/** 초월·강화·포훈 표 편집 (원본 엑셀 미계산 구멍·오류 직접 수정용) */
export function TableEditor({
  tables, setTables,
}: {
  tables: SkillTables;
  setTables: (t: SkillTables) => void;
}) {
  const [kind, setKind] = useState<TableKind>("enhance");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const merged = getTable(kind, tables);
  const keys = Object.keys(merged).sort().filter((k) => !q || k.includes(q));
  const levels = TABLE_LEVELS[kind];
  const cur: number[] = sel
    ? [...(merged[sel] ?? [])]
    : [];
  while (cur.length < levels) cur.push(0);

  const saveCell = (idx: number, v: number | "") => {
    const arr = [...cur];
    arr[idx] = v === "" ? 0 : v;
    setTables({
      ...tables,
      tables: { ...tables.tables, [kind]: { ...tables.tables?.[kind], [sel]: arr } },
    });
  };
  const resetKey = () => {
    const o = { ...tables.tables?.[kind] };
    delete o[sel];
    setTables({ ...tables, tables: { ...tables.tables, [kind]: o } });
    setSel("");
  };
  const edited = tables.tables?.[kind]?.[sel] !== undefined;

  return (
    <div className="card">
      <div className="row">
        {(["enhance", "transcend", "pohoon"] as TableKind[]).map((k) => (
          <button key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setSel(""); }}>
            {TABLE_LABEL[k]}표
          </button>
        ))}
        <input placeholder="키 검색 (예: 시그니처)" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ flex: 1 }}>
          <option value="">키 선택 ({keys.length})</option>
          {keys.map((k) => <option key={k} value={k}>{k}{tables.tables?.[kind]?.[k] ? " (수정됨)" : ""}</option>)}
        </select>
        {sel && edited && <button onClick={resetKey}>원복</button>}
      </div>
      {sel && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ marginBottom: 4 }}>
            {sel} — 레벨별 보너스 ({kind === "transcend" ? "0~15" : "1~20"})
          </div>
          <div className="row">
            {cur.slice(0, levels).map((v, i) => (
              <label key={i} style={{ display: "flex", flexDirection: "column", fontSize: 11 }} className="muted">
                {kind === "transcend" ? i : i + 1}
                <Num value={v} width={56} onChange={(nv) => saveCell(i, nv)} />
              </label>
            ))}
          </div>
        </div>
      )}
      <p className="muted">원본 엑셀에 미계산(0)·오류 값이 있어 직접 고칠 수 있게 했습니다. 수정분은 이 브라우저에만 저장.</p>
    </div>
  );
}
