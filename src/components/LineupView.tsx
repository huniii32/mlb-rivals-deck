import type { PlayerInput, PlayerResult } from "../lib/engine";
import type { PhotoInfo } from "../lib/photos";

// 게임 라인업 화면처럼 다이아몬드 위에 카드 배치.
// 타자 9명(외야 LF/CF/RF, 내야 3B/SS/2B/1B, 포수 C, 지명 DH) + 투수 9명(SP5/RP3/CP1).

const DIAMOND: [string, number, number][] = [
  ["CF", 50, 5],
  ["LF", 24, 12],
  ["RF", 76, 12],
  ["SS", 41, 26],
  ["2B", 59, 26],
  ["3B", 24, 35],
  ["1B", 76, 35],
  ["C", 50, 50],
  ["DH", 50, 64],
];

const DEF_ROW: Record<string, number> = {
  C: 11, "1B": 12, "2B": 13, "3B": 14, SS: 15, LF: 16, CF: 17, RF: 18, DH: 19,
};

const GRADE_COLOR: [string, string][] = [
  ["블랙", "#a855f7"],
  ["시그니처", "#8b5cf6"],
  ["슈프림", "#ef4444"],
  ["모먼트", "#f97316"],
  ["프라임", "#3b82f6"],
  ["명예의 전당", "#eab308"],
];

function gradeColor(card: string): string {
  for (const [k, c] of GRADE_COLOR) if (card.includes(k)) return c;
  return "#64748b";
}

function shortCard(card: string): string {
  return card
    .replace("WBC 시그니처 블랙", "WBC시블")
    .replace("FA 시그니처 블랙", "FA시블")
    .replace("시그니처 블랙", "시블")
    .replace("FA 시그니처", "FA시그")
    .replace("WBC 시그니처", "WBC시그")
    .replace("슈프림 모먼트", "슈모")
    .replace("명예의 전당", "HOF")
    .replace("FA 프라임", "FA프")
    .replace("WBC 프라임", "WBC프");
}

function Card({
  pos, name, team, card, score, filled, photo, onClick,
}: {
  pos: string; name: string; team: string; card: string; score: number; filled: boolean;
  photo?: PhotoInfo; onClick: () => void;
}) {
  const inner = filled ? (
    <>
      <span className="dc-top">
        <span className="dc-ovr">{score.toFixed(0)}</span>
        <span className="dc-pos">{pos}</span>
      </span>
      {team && <span className="dc-team">{team}</span>}
      {photo
        ? <img className="dc-img" src={photo.src} alt={name} />
        : <span className="dc-noimg">NO PHOTO</span>}
      <span className="dc-name">{name}</span>
      <span className="dc-grade">{shortCard(card)}</span>
    </>
  ) : (
    <>
      <span className="dc-pos alone">{pos}</span>
      <span className="dc-name muted">+ 등록</span>
    </>
  );
  if (filled && photo) {
    return (
      <span className="pcard dcard" style={{ borderColor: gradeColor(card), boxShadow: `0 0 12px ${gradeColor(card)}66` }}>
        <a href={photo.page} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{inner}</a>
        <button className="pcard-edit" onClick={onClick} title="입력 팝업">✎</button>
      </span>
    );
  }
  return (
    <button
      className={`pcard dcard ${filled ? "" : "empty"}`}
      style={filled ? { borderColor: gradeColor(card), boxShadow: `0 0 12px ${gradeColor(card)}66` } : undefined}
      onClick={onClick}
      title={filled ? `${name} — 클릭하면 입력 팝업` : `${pos} 비어있음 — 클릭하면 입력 팝업`}
    >
      {inner}
    </button>
  );
}

export function LineupView({
  batters, pitchers, bRes, pRes, onSelect, photos,
}: {
  batters: PlayerInput[];
  pitchers: PlayerInput[];
  bRes: PlayerResult[];
  pRes: PlayerResult[];
  onSelect: (excelRow: number) => void;
  photos: Record<number, PhotoInfo>;
}) {
  const byPos = new Map(batters.map((p, i) => [p.pos.trim().toUpperCase(), { p, r: bRes[i] }]));
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const sp = pRes.slice(0, 5).filter((_, i) => pitchers[i].name.trim()).map((r) => r.total);
  const rp = pRes.slice(5).filter((_, i) => pitchers[i + 5].name.trim()).map((r) => r.total);
  const bt = bRes.filter((_, i) => batters[i].name.trim()).map((r) => r.total);
  const dSP = avg(sp) * 10;
  const dRP = avg(rp) * 10;
  const dBT = avg(bt) * 10;
  const total = dSP * 0.4 + dRP * 0.1 + dBT * 0.5;

  return (
    <div className="card stadium">
      <div className="stadium-hd">
        <h3>라인업</h3>
        <div className="scoreboard">
          <div className="sb-total"><span>총점</span><b>{total.toFixed(0)}</b></div>
          <div><span>선발</span><b>{dSP.toFixed(0)}</b></div>
          <div><span>계투</span><b>{dRP.toFixed(0)}</b></div>
          <div><span>타자</span><b>{dBT.toFixed(0)}</b></div>
        </div>
      </div>
      <div className="diamond">
        <svg viewBox="0 0 100 72" preserveAspectRatio="none">
          <defs>
            <radialGradient id="grass" cx="50%" cy="18%" r="95%">
              <stop offset="0%" stopColor="#2a7a3c" />
              <stop offset="60%" stopColor="#1e5c2c" />
              <stop offset="100%" stopColor="#143f1f" />
            </radialGradient>
            <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9a6534" />
              <stop offset="100%" stopColor="#71441f" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="72" fill="url(#grass)" />
          <ellipse cx="50" cy="20" rx="46" ry="26" fill="#ffffff" opacity="0.04" />
          <ellipse cx="50" cy="20" rx="30" ry="17" fill="#000000" opacity="0.06" />
          {/* 흙: 내야 다이아몬드 + 마운드 + 홈 */}
          <polygon points="50,61 71,41 50,21 29,41" fill="url(#dirt)" />
          <circle cx="50" cy="45" r="3.4" fill="url(#dirt)" />
          <circle cx="50" cy="58" r="4.6" fill="url(#dirt)" />
          {/* 잔디: 내야 안쪽 */}
          <polygon points="50,54 62,42 50,30 38,42" fill="#24703a" />
          {/* 파울라인 */}
          <line x1="50" y1="58" x2="6" y2="8" stroke="#f8fafc" strokeWidth="0.45" opacity="0.85" />
          <line x1="50" y1="58" x2="94" y2="8" stroke="#f8fafc" strokeWidth="0.45" opacity="0.85" />
          {/* 외야 담장 */}
          <path d="M 8 44 A 46 46 0 0 1 92 44" fill="none" stroke="#f8fafc" strokeWidth="0.7" opacity="0.7" />
          {/* 베이스 */}
          <rect x="62.3" y="41.3" width="1.6" height="1.6" fill="#f8fafc" transform="rotate(45 63.1 42.1)" />
          <rect x="49.2" y="30.2" width="1.6" height="1.6" fill="#f8fafc" transform="rotate(45 50 31)" />
          <rect x="36.2" y="41.3" width="1.6" height="1.6" fill="#f8fafc" transform="rotate(45 37 42.1)" />
          <polygon points="50,56.2 51.1,57.3 50.6,58.4 49.4,58.4 48.9,57.3" fill="#f8fafc" />
          <ellipse cx="50" cy="45" rx="1.6" ry="0.9" fill="#e7e5e4" />
        </svg>
        {DIAMOND.map(([pos, x, y]) => {
          const hit = byPos.get(pos);
          return (
            <div key={pos} className="dslot" style={{ left: `${x}%`, top: `${y}%` }}>
              <Card
                pos={pos}
                name={hit?.p.name ?? ""}
                team={hit?.p.team ?? ""}
                card={hit?.p.card ?? ""}
                score={hit?.r.total ?? 0}
                filled={!!hit?.p.name.trim()}
                photo={hit ? photos[hit.p.excelRow] : undefined}
                onClick={() => onSelect(hit?.p.excelRow ?? DEF_ROW[pos] ?? 11)}
              />
            </div>
          );
        })}
      </div>
      <h4>선발</h4>
      <div className="prow">
        {pitchers.slice(0, 5).map((p, i) => (
          <Card key={p.excelRow} pos={p.pos} name={p.name} team={p.team} card={p.card} score={pRes[i].total}
            filled={!!p.name.trim()} photo={photos[p.excelRow]} onClick={() => onSelect(p.excelRow)} />
        ))}
      </div>
      <h4>불펜</h4>
      <div className="prow">
        {pitchers.slice(5).map((p, i) => (
          <Card key={p.excelRow} pos={p.pos} name={p.name} team={p.team} card={p.card} score={pRes[i + 5].total}
            filled={!!p.name.trim()} photo={photos[p.excelRow]} onClick={() => onSelect(p.excelRow)} />
        ))}
      </div>
      <p className="muted">사진: Wikimedia Commons (CC 라이선스, 클릭 시 출처 페이지로 이동)</p>
    </div>
  );
}
