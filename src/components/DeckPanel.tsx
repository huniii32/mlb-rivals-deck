import type { Chem } from "../lib/engine";
import { LOOKUP } from "../lib/engine";
import { CHEM_LABELS } from "../lib/teamBuffs";

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
      <p className="muted">컴백 플래그의 팀 타자 효과는 중계 등판·동점/열세 조건의 효과이므로 상시 팀 버프에 포함하지 않습니다. 이전 선택값도 타자 점수에 가산하지 않으며, 투수 개인 스킬 점수는 유지합니다.</p>
      <p className="muted">락다운은 CP 배치 효과를 랭킹대전 9이닝 중 7~9회 비중으로 반영하며 중복 적용하지 않습니다.</p>
    </div>
  );
}
