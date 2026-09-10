import type { Kind, PlayerInput, PlayerResult } from "../lib/engine";
import { LOOKUP } from "../lib/engine";

export function Num({
  value, onChange, width = 56, placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  width?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      style={{ width }}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? "" : Number(v));
      }}
    />
  );
}

export function SkillInput({
  kind, value, onChange, customNames,
}: {
  kind: Kind;
  value: string;
  onChange: (v: string) => void;
  customNames: string[];
}) {
  const listId = `skills-${kind}`;
  const bundled = (kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher).map((s) => s.name);
  return (
    <>
      <input
        list={listId}
        value={value}
        placeholder="스킬 검색"
        style={{ width: 170 }}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {customNames.map((n) => (
          <option key={`c-${n}`} value={n} />
        ))}
        {bundled.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}

export function PlayerTable({
  title,
  kind,
  rows,
  results,
  update,
  customNames,
}: {
  title: string;
  kind: Kind;
  rows: PlayerInput[];
  results: PlayerResult[];
  update: (excelRow: number, patch: Partial<PlayerInput>) => void;
  customNames: string[];
}) {
  const statNames = kind === "batter" ? ["파워", "정확", "선구"] : ["변화", "구위"];
  const n = kind === "batter" ? 3 : 2;
  const set = (r: PlayerInput, i: number, v: number | "", field: "base" | "train" | "spec" | "extra" | "finalOv") => {
    const arr = [...r[field]] as [number | "", number | "", number | ""];
    arr[i] = v;
    update(r.excelRow, { [field]: arr } as Partial<PlayerInput>);
  };
  return (
    <div className="card">
      <h3>{title}</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="wide">
          <thead>
            <tr>
              <th>포지션</th>
              {kind === "batter" && <th>타순</th>}
              <th>카드</th>
              <th>선수</th>
              <th>연도</th>
              <th colSpan={n}>기본</th>
              <th colSpan={n}>훈련</th>
              <th colSpan={n}>특훈</th>
              <th>초월Lv</th>
              <th>강화Lv</th>
              <th>포훈Lv</th>
              <th colSpan={n}>기타</th>
              <th>스킬B</th>
              <th colSpan={n}>최종(자동)</th>
              <th colSpan={4}>스킬 1~4</th>
              <th>능력치</th>
              <th>스킬점</th>
              <th>최종점</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const res = results[ri];
              return (
                <tr key={r.excelRow}>
                  <td>
                    <input value={r.pos} style={{ width: 44 }} onChange={(e) => update(r.excelRow, { pos: e.target.value })} />
                  </td>
                  {kind === "batter" && (
                    <td><Num value={r.order} onChange={(v) => update(r.excelRow, { order: v })} width={40} /></td>
                  )}
                  <td>
                    <select value={r.card} onChange={(e) => update(r.excelRow, { card: e.target.value })}>
                      <option value="">—</option>
                      {LOOKUP.cards.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><input value={r.name} style={{ width: 80 }} onChange={(e) => update(r.excelRow, { name: e.target.value })} /></td>
                  <td><Num value={r.year} onChange={(v) => update(r.excelRow, { year: v })} width={60} /></td>
                  {([0, 1, 2] as const).slice(0, n).map((i) => (
                    <td key={`b${i}`}><Num value={r.base[i]} onChange={(v) => set(r, i, v, "base")} width={48} /></td>
                  ))}
                  {([0, 1, 2] as const).slice(0, n).map((i) => (
                    <td key={`t${i}`}><Num value={r.train[i]} onChange={(v) => set(r, i, v, "train")} width={48} /></td>
                  ))}
                  {([0, 1, 2] as const).slice(0, n).map((i) => (
                    <td key={`s${i}`}><Num value={r.spec[i]} onChange={(v) => set(r, i, v, "spec")} width={48} /></td>
                  ))}
                  <td><Num value={r.transLv} onChange={(v) => update(r.excelRow, { transLv: v })} width={44} /></td>
                  <td><Num value={r.enhLv} onChange={(v) => update(r.excelRow, { enhLv: v })} width={44} /></td>
                  <td><Num value={r.pohLv} onChange={(v) => update(r.excelRow, { pohLv: v })} width={44} /></td>
                  {([0, 1, 2] as const).slice(0, n).map((i) => (
                    <td key={`e${i}`}><Num value={r.extra[i]} onChange={(v) => set(r, i, v, "extra")} width={48} /></td>
                  ))}
                  <td>
                    <button
                      className={r.skillB ? "on" : ""}
                      title="O면 +3"
                      onClick={() => update(r.excelRow, { skillB: !r.skillB })}
                    >{r.skillB ? "O" : "X"}</button>
                  </td>
                  {([0, 1, 2] as const).slice(0, n).map((i) => (
                    <td key={`f${i}`} title={res.manual[i] ? "직접 입력값 (지우면 자동)" : `자동합산: ${res.auto[i]}`}>
                      <Num
                        value={r.finalOv[i]}
                        placeholder={String(res.auto[i])}
                        onChange={(v) => set(r, i, v, "finalOv")}
                        width={52}
                      />
                    </td>
                  ))}
                  {([0, 1, 2, 3] as const).map((i) => (
                    <td key={`k${i}`}>
                      <SkillInput
                        kind={kind}
                        value={r.skills[i]}
                        customNames={customNames}
                        onChange={(v) => {
                          const arr = [...r.skills] as [string, string, string, string];
                          arr[i] = v;
                          update(r.excelRow, { skills: arr });
                        }}
                      />
                    </td>
                  ))}
                  <td><b>{res.ability.toFixed(1)}</b></td>
                  <td><b>{res.skill === null ? <span className="bad">표없음</span> : res.skill.toFixed(1)}</b></td>
                  <td><b>{res.total.toFixed(1)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        최종 능력치는 기본+훈련+특훈+초월+강화+포훈+기타+스킬B(+3)+덱코 자동합산. 숫자를 직접 적으면 수동값으로 고정(지우면 자동).
        {statNames.join("·")} 순서.
      </p>
      {rows.some((_, i) => results[i].warnings.length > 0) && (
        <div className="warn">
          {rows.map((r, i) => results[i].warnings.map((w, j) => (
            <div key={`${i}-${j}`}>{r.name || r.pos}: {w}</div>
          )))}
        </div>
      )}
    </div>
  );
}
