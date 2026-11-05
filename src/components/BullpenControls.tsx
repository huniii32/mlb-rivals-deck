import type { PlayerInput } from "../lib/engine";
import type { BullpenRole, BullpenTactics } from "../lib/bullpen";
import { BULLPEN_ROLES, MAX_BULLPEN, ROLE_LABELS, ROLE_LIMITS, bullpenCounts, normalizeTactics, tacticStatus } from "../lib/bullpen";

export function BullpenControls({ players, tactics, setCount, setTactics }: {
  players: PlayerInput[]; tactics?: BullpenTactics;
  setCount: (role: BullpenRole, count: number) => void;
  setTactics: (t: BullpenTactics) => void;
}) {
  const counts = bullpenCounts(players);
  const total = players.length - 14;
  const t = normalizeTactics(tactics);
  const s = tacticStatus(players, t);
  const status = (bonus: number, count: number, required: number) =>
    required === 0 ? "능력치 가산 없음" : bonus ? `등록 ${count}명 · 변화·구위 +${bonus}` : `등록 ${count}명 · 최소 ${required}명 등록 시 적용`;
  return (
    <section className="bullpen-controls" aria-label="불펜 배치 및 전술">
      <h3>불펜 배치 <span className="pill">{total} / {MAX_BULLPEN}명</span></h3>
      <p className="muted">승리조·추격조·롱릴리프는 각각 최대 4명, 마무리는 최대 2명까지 배치합니다.</p>
      <div className="bullpen-counts">
        {BULLPEN_ROLES.map((r) => (
          <label key={r}>{ROLE_LABELS[r]} 배치
            <select aria-label={`${ROLE_LABELS[r]} 배치 인원`} value={counts[r]} onChange={(e) => setCount(r, Number(e.target.value))}>
              {Array.from({ length: ROLE_LIMITS[r] + 1 }, (_, i) => (
                <option key={i} value={i} disabled={total - counts[r] + i > MAX_BULLPEN}>{i}명</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="bullpen-tactics">
        <label>승리조 전술
          <select aria-label="승리조 전술" value={t.winning} onChange={(e) => setTactics({ ...t, winning: e.target.value as BullpenTactics["winning"] })}>
            <option value="basic">기본</option><option value="aggressive">적극 · 2명 이상 · +2</option><option value="division">분업 · 3명 이상 · +4</option>
          </select>
          <span className={s.winningRequired && !s.winningBonus ? "bad" : "muted"}>{status(s.winningBonus, s.counts.winning, s.winningRequired)}</span>
        </label>
        <label>추격조 전술
          <select aria-label="추격조 전술" value={t.chasing} onChange={(e) => setTactics({ ...t, chasing: e.target.value as BullpenTactics["chasing"] })}>
            <option value="basic">기본</option><option value="aggressive">적극 · 2명 이상 · +2</option>
          </select>
          <span className={s.chasingRequired && !s.chasingBonus ? "bad" : "muted"}>{status(s.chasingBonus, s.counts.chasing, s.chasingRequired)}</span>
        </label>
      </div>
      <p className="muted">이름이 입력된 투수만 전술 인원으로 인정됩니다. 지구력을 제외한 능력치 보너스 중 점수에 사용하는 변화·구위에 자동 반영됩니다. 롱릴리프·마무리는 가산이 없습니다.</p>
    </section>
  );
}
