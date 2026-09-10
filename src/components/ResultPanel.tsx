import { useState } from "react";
import type { Kind, PlayerInput, PlayerResult, SkillTables } from "../lib/engine";
import { LOOKUP, skillCompare } from "../lib/engine";

/** 결과 탭: 선발/계투/타자/총점 + 랭킹 + 스킬 비교 계산기 */
export function ResultPanel({
  batters, pitchers, bRes, pRes, tables, customNames,
}: {
  batters: PlayerInput[];
  pitchers: PlayerInput[];
  bRes: PlayerResult[];
  pRes: PlayerResult[];
  tables: SkillTables;
  customNames: Record<Kind, string[]>;
}) {
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const sp = pRes.slice(0, 5).filter((_, i) => pitchers[i].name.trim());
  const rp = pRes.slice(5).filter((_, i) => pitchers[i + 5].name.trim());
  const bt = bRes.filter((_, i) => batters[i].name.trim());
  const dSP = avg(sp.map((r) => r.total)) * 10;
  const dRP = avg(rp.map((r) => r.total)) * 10;
  const dBT = avg(bt.map((r) => r.total)) * 10;
  const total = dSP * 0.4 + dRP * 0.1 + dBT * 0.5;

  const [kind, setKind] = useState<Kind>("batter");
  const [cmp, setCmp] = useState(["", "", "", ""]);
  const cmpScore = skillCompare(kind, cmp, tables);
  const listId = `cmp-${kind}`;
  const options = kind === "batter"
    ? [...customNames.batter, ...LOOKUP.batter.map((s) => s.name)]
    : [...customNames.pitcher, ...LOOKUP.pitcher.map((s) => s.name)];

  const ranking = [
    ...batters.map((p, i) => ({ name: p.name || p.pos, pos: p.pos, score: bRes[i].total })),
    ...pitchers.map((p, i) => ({ name: p.name || p.pos, pos: p.pos, score: pRes[i].total })),
  ].filter((r) => r.name).sort((a, b) => b.score - a.score);

  return (
    <div>
      <div className="card">
        <h3>덱 점수 (랭대 공격 기준)</h3>
        <div className="score">{total.toFixed(1)}</div>
        <div className="muted">
          선발 {dSP.toFixed(1)} × 0.4 + 계투 {dRP.toFixed(1)} × 0.1 + 타자 {dBT.toFixed(1)} × 0.5
          {" "}(이름 있는 선수만 평균)
        </div>
      </div>
      <div className="card">
        <h3>선수 랭킹</h3>
        <table>
          <thead><tr><th>#</th><th>포지션</th><th>선수</th><th>최종점수</th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.pos}</td><td>{r.name}</td><td><b>{r.score.toFixed(1)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>스킬 점수 비교</h3>
        <div className="row">
          <button className={kind === "batter" ? "on" : ""} onClick={() => setKind("batter")}>타자</button>
          <button className={kind === "pitcher" ? "on" : ""} onClick={() => setKind("pitcher")}>투수</button>
          {cmp.map((c, i) => (
            <input key={i} list={listId} value={c} placeholder={`스킬 ${i + 1}`} style={{ width: 170 }}
              onChange={(e) => setCmp(cmp.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <datalist id={listId}>{options.map((n) => <option key={n} value={n} />)}</datalist>
          <b>{cmpScore === null ? "표없음" : cmpScore.toFixed(2)}</b>
        </div>
      </div>
    </div>
  );
}
