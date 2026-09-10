import { useState } from "react";
import type { Kind, SkillTables } from "../lib/engine";
import { LOOKUP } from "../lib/engine";

/** 스킬점수 탭: 점수 수정 + 신규 스킬 추가 (원본 '스킬점수 시트' 대응) */
export function SkillPanel({
  tables, setTables,
}: {
  tables: SkillTables;
  setTables: (t: SkillTables) => void;
}) {
  const [kind, setKind] = useState<Kind>("batter");
  const [q, setQ] = useState("");
  const [nName, setNName] = useState("");
  const [nScore, setNScore] = useState<number | "">(0);
  const base = kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher;
  const merged: { name: string; score: number; custom: boolean; edited?: boolean }[] = [
    ...tables.customs.filter((c) => c.kind === kind).map((c) => ({ name: c.name, score: c.score, custom: true })),
    ...base.map((s) => ({
      name: s.name,
      score: tables.overrides[`${kind}:${s.name}`] ?? s.score,
      custom: false,
      edited: tables.overrides[`${kind}:${s.name}`] !== undefined,
    })),
  ].filter((s) => !q || s.name.includes(q));

  const setScore = (name: string, score: number, custom: boolean) => {
    if (custom) {
      setTables({ ...tables, customs: tables.customs.map((c) => (c.kind === kind && c.name === name ? { ...c, score } : c)) });
    } else {
      setTables({ ...tables, overrides: { ...tables.overrides, [`${kind}:${name}`]: score } });
    }
  };
  const resetScore = (name: string) => {
    const o = { ...tables.overrides };
    delete o[`${kind}:${name}`];
    setTables({ ...tables, overrides: o });
  };
  const add = () => {
    const name = nName.trim();
    if (!name || nScore === "") return;
    if (base.some((s) => s.name === name) || tables.customs.some((c) => c.kind === kind && c.name === name)) {
      alert("이미 있는 스킬명입니다. 점수 수정으로 변경하세요.");
      return;
    }
    setTables({ ...tables, customs: [...tables.customs, { kind, name, score: Number(nScore) }] });
    setNName("");
  };

  return (
    <div className="card">
      <h3>스킬점수 관리</h3>
      <div className="row">
        <button className={kind === "batter" ? "on" : ""} onClick={() => setKind("batter")}>타자({LOOKUP.batter.length})</button>
        <button className={kind === "pitcher" ? "on" : ""} onClick={() => setKind("pitcher")}>투수({LOOKUP.pitcher.length})</button>
        <input placeholder="스킬 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="신규 스킬명 (예: [S0] xxx)" value={nName} onChange={(e) => setNName(e.target.value)} style={{ flex: 1 }} />
        <input type="number" value={nScore} onChange={(e) => setNScore(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 90 }} />
        <button className="primary" onClick={add}>추가</button>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>스킬</th><th>점수</th><th></th></tr></thead>
        <tbody>
          {merged.slice(0, 200).map((s) => (
            <tr key={s.name}>
              <td>{s.name} {s.custom && <span className="muted">(추가)</span>} {s.edited && <span className="muted">(수정됨)</span>}</td>
              <td>
                <input
                  type="number" step="0.01" style={{ width: 90 }}
                  value={s.score}
                  onChange={(e) => setScore(s.name, Number(e.target.value), !!s.custom)}
                />
              </td>
              <td>{s.edited && <button onClick={() => resetScore(s.name)}>원복</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {merged.length > 200 && <p className="muted">{merged.length - 200}개 더 있음 — 검색으로 찾으세요.</p>}
    </div>
  );
}
