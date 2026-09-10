import type { PlayerInput, PlayerResult } from "../lib/engine";
import type { PhotoInfo } from "../lib/photos";

// 게임 라인업 화면처럼 다이아몬드 위에 카드 배치.
// 타자 9명(외야 LF/CF/RF, 내야 3B/SS/2B/1B, 포수 C, 지명 DH) + 투수 9명(SP5/RP3/CP1).

const DIAMOND: [string, number, number][] = [
  ["CF", 50, 14],
  ["LF", 23, 21],
  ["RF", 77, 21],
  ["SS", 40, 32],
  ["2B", 60, 32],
  ["3B", 23, 41],
  ["1B", 77, 41],
  ["C", 50, 69],
  ["DH", 72, 69],
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
      <span className="pcard dcard" style={{ borderColor: gradeColor(card), boxShadow: `0 0 12px ${gradeColor(card)}66` }}
        onClick={onClick} role="button" tabIndex={0} title={`${name} — 클릭하면 입력 팞업`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
        {inner}
        <a className="pcard-src" href={photo.page} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()} title="사진 출처 페이지">⧉</a>
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
        <svg viewBox="0 0 100 81" preserveAspectRatio="none">
          <defs>
            <radialGradient id="grass" cx="50%" cy="112%" r="135%">
              <stop offset="0%" stopColor="#2f8a44" />
              <stop offset="55%" stopColor="#226b33" />
              <stop offset="100%" stopColor="#153d21" />
            </radialGradient>
            <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a8703a" />
              <stop offset="100%" stopColor="#7a4c22" />
            </linearGradient>
            <clipPath id="fieldClip">
              <path d="M 12 32 Q 50 -2 88 32 L 88 81 L 12 81 Z" />
            </clipPath>
          </defs>
          <rect x="0" y="0" width="100" height="81" fill="url(#grass)" />
          {/* 잔디 결: 홈플레이트 중심 방사형 스트라이프 */}
          <g clipPath="url(#fieldClip)" stroke="#ffffff" fill="none">
            <circle cx="50" cy="62" r="21" strokeWidth="7" opacity="0.05" />
            <circle cx="50" cy="62" r="35" strokeWidth="7" opacity="0.05" />
            <circle cx="50" cy="62" r="49" strokeWidth="7" opacity="0.05" />
            <circle cx="50" cy="62" r="63" strokeWidth="7" opacity="0.05" />
          </g>
          {/* 워닝트랙 + 외야 담장 */}
          <path d="M 12 32 Q 50 -2 88 32" fill="none" stroke="#8a5a2e" strokeWidth="3.4" opacity="0.9" />
          <path d="M 12 32 Q 50 -2 88 32" fill="none" stroke="#f8fafc" strokeWidth="0.7" opacity="0.85" />
          {/* 파울폴 */}
          <line x1="12" y1="32" x2="12" y2="26" stroke="#facc15" strokeWidth="0.8" />
          <line x1="88" y1="32" x2="88" y2="26" stroke="#facc15" strokeWidth="0.8" />
          {/* 파울라인: 홈에서 파울폴까지 */}
          <line x1="50" y1="62" x2="12" y2="32" stroke="#f8fafc" strokeWidth="0.45" opacity="0.9" />
          <line x1="50" y1="62" x2="88" y2="32" stroke="#f8fafc" strokeWidth="0.45" opacity="0.9" />
          {/* 내야 흙 (스킨드 인필드) */}
          <path d="M 50 64.5 L 66.5 50 L 50 35.5 L 33.5 50 Z" fill="url(#dirt)" stroke="#6e4420" strokeWidth="1" strokeLinejoin="round" />
          {/* 내야 잔디 */}
          <path d="M 50 58.5 L 60.5 50 L 50 41.5 L 39.5 50 Z" fill="#2a7a3c" />
          {/* 마운드 흙 + 고무판 */}
          <circle cx="50" cy="51" r="2.8" fill="url(#dirt)" />
          <rect x="49.2" y="50.75" width="1.6" height="0.5" fill="#f8fafc" />
          {/* 베이스 */}
          <rect x="61.75" y="49.25" width="1.5" height="1.5" fill="#f8fafc" transform="rotate(45 62.5 50)" />
          <rect x="49.25" y="38.75" width="1.5" height="1.5" fill="#f8fafc" transform="rotate(45 50 39.5)" />
          <rect x="36.75" y="49.25" width="1.5" height="1.5" fill="#f8fafc" transform="rotate(45 37.5 50)" />
          {/* 홈 서클 + 홈플레이트 + 타석 */}
          <circle cx="50" cy="62" r="3.4" fill="url(#dirt)" />
          <polygon points="50,61.5 50.9,62.1 50.9,63.1 50,63.7 49.1,63.1 49.1,62.1" fill="#f8fafc" />
          <rect x="47.4" y="60.6" width="1.7" height="3.2" fill="none" stroke="#f8fafc" strokeWidth="0.35" opacity="0.8" />
          <rect x="50.9" y="60.6" width="1.7" height="3.2" fill="none" stroke="#f8fafc" strokeWidth="0.35" opacity="0.8" />
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
