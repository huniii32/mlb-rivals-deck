import type { PlayerInput, PlayerResult } from "../lib/engine";

/** 덱랭킹 탭 하단: 현재 덱 점수 + 내 선수 랭킹 (스킬 1:1 비교는 스킬비교 탭) */
export function ResultPanel({
  batters, pitchers, bRes, pRes,
}: {
  batters: PlayerInput[];
  pitchers: PlayerInput[];
  bRes: PlayerResult[];
  pRes: PlayerResult[];
}) {
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const sp = pRes.slice(0, 5).filter((_, i) => pitchers[i].name.trim());
  const rp = pRes.slice(5).filter((_, i) => pitchers[i + 5].name.trim());
  const bt = bRes.filter((_, i) => batters[i].name.trim());
  const dSP = avg(sp.map((r) => r.total)) * 10;
  const dRP = avg(rp.map((r) => r.total)) * 10;
  const dBT = avg(bt.map((r) => r.total)) * 10;
  const total = dSP * 0.4 + dRP * 0.1 + dBT * 0.5;

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
        <h3>선수 랭킹 (내 덱)</h3>
        <table>
          <thead><tr><th>#</th><th>포지션</th><th>선수</th><th>최종점수</th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.pos}</td><td>{r.name}</td><td><b>{r.score.toFixed(1)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
