import { useEffect, useRef, useState } from "react";
import type { Kind, SkillTables } from "../lib/engine";
import { LOOKUP, skillScore, suggestSkills } from "../lib/engine";

/** 스킬 1 vs 2 비교: 양쪽 4슬롯 합산 대결 */
export function SkillCompare({ tables }: { tables: SkillTables }) {
  const [kindA, setKindA] = useState<Kind>("batter");
  const [kindB, setKindB] = useState<Kind>("batter");
  const [skillsA, setSkillsA] = useState<string[]>(["", "", "", ""]);
  const [skillsB, setSkillsB] = useState<string[]>(["", "", "", ""]);

  const calc = (k: Kind, skills: string[]) => {
    const scores = skills.map((s) => (s.trim() ? skillScore(k, s, tables) : 0));
    const unknown = skills.filter((s, i) => s.trim() && scores[i] === null);
    const total = (scores as (number | null)[]).reduce<number | null>(
      (acc, s) => (acc === null || s === null ? null : acc + s), 0);
    return { scores, unknown, total };
  };
  const a = calc(kindA, skillsA);
  const b = calc(kindB, skillsB);
  const diff = a.total !== null && b.total !== null ? a.total - b.total : null;

  const side = (
    label: string, kind: Kind, setKind: (k: Kind) => void,
    skills: string[], setSkills: (s: string[]) => void,
    r: ReturnType<typeof calc>, hl: boolean,
  ) => (
    <div className="card" style={hl ? { borderColor: "var(--good)" } : undefined}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{label} {hl && diff !== null && diff !== 0 && <span className="pill">승리</span>}</h3>
        <span>
          <button className={kind === "batter" ? "on" : ""} onClick={() => setKind("batter")}>타자</button>{" "}
          <button className={kind === "pitcher" ? "on" : ""} onClick={() => setKind("pitcher")}>투수</button>
        </span>
      </div>
      <div className="ed-skills" style={{ marginTop: 8 }}>
        {([0, 1, 2, 3] as const).map((i) => {
          const v = skills[i];
          const sc = v.trim() ? skillScore(kind, v, tables) : 0;
          const sug = v.trim() && sc === null ? suggestSkills(kind, v, tables, 3) : [];
          return (
            <label key={i}>슬롯{i + 1} {sc !== null && v.trim() !== "" && <b>+{sc}</b>}
              {sc === null && <b className="pill bad-pill">표없음</b>}
              <input value={v} placeholder="스킬 검색"
                onChange={(e) => {
                  const n = [...skills];
                  n[i] = e.target.value;
                  setSkills(n);
                }} />
              <span className="muted sug">
                {sug.length > 0 && (
                  <>혹시: {sug.map((s, j) => (
                    <span key={s}>
                      <a href="#" onClick={(e) => {
                        e.preventDefault();
                        const n = [...skills];
                        n[i] = s;
                        setSkills(n);
                      }}>{s}</a>
                      {j < sug.length - 1 ? " · " : ""}
                    </span>
                  ))}</>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div className="score-sm" style={{ marginTop: 8 }}>
        합계: {r.total === null ? <span className="bad">표없음 있음</span> : <b>{r.total.toFixed(1)}</b>}
      </div>
      {r.unknown.length > 0 && <p className="muted">점수 없음: {r.unknown.join(", ")}</p>}
    </div>
  );

  return (
    <div>
      <div className="grid" style={{ alignItems: "start" }}>
        {side("①", kindA, setKindA, skillsA, setSkillsA, a, diff !== null && diff > 0)}
        {side("②", kindB, setKindB, skillsB, setSkillsB, b, diff !== null && diff < 0)}
      </div>
      <p className="muted" style={{ textAlign: "center" }}>
        {diff === null ? "스킬을 입력하면 합산 대결" : diff === 0 ? "동점" : diff > 0 ? `①이 ${diff.toFixed(1)}점 높음` : `②가 ${(-diff).toFixed(1)}점 높음`}
      </p>
    </div>
  );
}

/** 스킬점수 탭: 점수 수정 + 신규 스킬 추가 (원본 '스킬점수 시트' 대응) */
export function SkillPanel({
  tables, setTables,
}: {
  tables: SkillTables;
  setTables: (t: SkillTables) => void;
}) {
  const [filter, setFilter] = useState<"batter" | "pitcher" | "all">("batter");
  const [kind, setKind] = useState<Kind>("batter");
  const [q, setQ] = useState("");
  const [nName, setNName] = useState("");
  const [nScore, setNScore] = useState<number | "">(0);
  const nq = q.replace(/\s+/g, "").toLowerCase();
  const ofKind = (k: Kind) => [
    ...tables.customs.filter((c) => c.kind === k).map((c) => ({ kind: k, name: c.name, score: c.score, custom: true as const, edited: false as const })),
    ...(k === "batter" ? LOOKUP.batter : LOOKUP.pitcher).map((s) => ({
      kind: k, name: s.name,
      score: tables.overrides[`${k}:${s.name}`] ?? s.score,
      custom: false as const,
      edited: tables.overrides[`${k}:${s.name}`] !== undefined,
    })),
  ];
  const all = filter === "all" ? [...ofKind("batter"), ...ofKind("pitcher")] : ofKind(filter);
  const merged = all.filter((s) => !nq || s.name.toLowerCase().includes(q.trim().toLowerCase()) ||
    s.name.replace(/\s+/g, "").toLowerCase().includes(nq));
  const bCount = ofKind("batter").length;
  const pCount = ofKind("pitcher").length;
  // 검색어·탭 바뀌면 표 스크롤 맨 위로 (빈 공간 보이는 것 방지)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.scrollTo({ top: 0 });
  }, [q, filter]);

  const setScore = (k: Kind, name: string, score: number, custom: boolean) => {
    if (custom) {
      setTables({ ...tables, customs: tables.customs.map((c) => (c.kind === k && c.name === name ? { ...c, score } : c)) });
    } else {
      setTables({ ...tables, overrides: { ...tables.overrides, [`${k}:${name}`]: score } });
    }
  };
  const resetScore = (k: Kind, name: string) => {
    const o = { ...tables.overrides };
    delete o[`${k}:${name}`];
    setTables({ ...tables, overrides: o });
  };
  const removeCustom = (k: Kind, name: string) => {
    if (!confirm(`'${name}' 스킬을 삭제할까요?`)) return;
    setTables({ ...tables, customs: tables.customs.filter((c) => !(c.kind === k && c.name === name)) });
  };
  const add = () => {
    const name = nName.trim();
    if (!name || nScore === "") return;
    if (ofKind(kind).some((s) => s.name === name)) {
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
        <button className={filter === "batter" ? "on" : ""} onClick={() => setFilter("batter")}>타자({bCount})</button>
        <button className={filter === "pitcher" ? "on" : ""} onClick={() => setFilter("pitcher")}>투수({pCount})</button>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>전체({bCount + pCount})</button>
        <input placeholder="스킬 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="batter">타자</option>
          <option value="pitcher">투수</option>
        </select>
        <input placeholder="신규 스킬명 (예: [S0] xxx)" value={nName} onChange={(e) => setNName(e.target.value)} style={{ flex: 1 }} />
        <input type="number" value={nScore} onChange={(e) => setNScore(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 90 }} />
        <button className="primary" onClick={add}>추가</button>
      </div>
      <div className="skill-table-wrap" ref={wrapRef}>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>종류</th><th>스킬</th><th>점수</th><th></th></tr></thead>
          <tbody>
            {merged.slice(0, 200).map((s) => (
              <tr key={`${s.kind}:${s.name}`}>
                <td>{s.kind === "batter" ? "타자" : "투수"}</td>
                <td>{s.name} {s.custom && <span className="muted">(추가)</span>} {s.edited && <span className="muted">(수정됨)</span>}</td>
                <td>
                  <input
                    type="number" step="0.01" style={{ width: 90 }}
                    value={s.score}
                    onChange={(e) => setScore(s.kind, s.name, Number(e.target.value), !!s.custom)}
                  />
                </td>
                <td>
                  {s.edited && <button onClick={() => resetScore(s.kind, s.name)}>원복</button>}
                  {s.custom && <button onClick={() => removeCustom(s.kind, s.name)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {merged.length > 200 && <p className="muted">{merged.length - 200}개 더 있음 — 검색으로 찾으세요.</p>}
    </div>
  );
}
