import type { Kind } from "../lib/engine";

// 게임식 일러스트 카드: 등급 프레임 + 타자/투수 벡터 실루엣 (자체 제작, 저작권 안전).
// 수동 이미지 URL이 있으면 그걸 쓰고, 없으면 일러스트.

const GRADE_COLOR: [string, string][] = [
  ["블랙", "#a855f7"],
  ["시그니처", "#8b5cf6"],
  ["슈프림", "#ef4444"],
  ["모먼트", "#f97316"],
  ["프라임", "#3b82f6"],
  ["명예의 전당", "#eab308"],
];

export function gradeColor(card: string): string {
  for (const [k, c] of GRADE_COLOR) if (card.includes(k)) return c;
  return "#64748b";
}

export function shortCard(card: string): string {
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

/** 타자/투수 실루엣 일러스트 */
export function PlayerArt({ kind, accent }: { kind: Kind; accent: string }) {
  const fig = "#0b1526";
  return (
    <svg viewBox="0 0 100 100" className="gc-art" aria-hidden="true">
      <defs>
        <radialGradient id={`gc-glow-${kind}`} cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="62" r="46" fill={`url(#gc-glow-${kind})`} />
      {/* 스피드선 */}
      <g stroke="#ffffff" strokeWidth="1.6" opacity="0.16" strokeLinecap="round">
        <line x1="8" y1="30" x2="34" y2="30" />
        <line x1="4" y1="44" x2="28" y2="44" />
        <line x1="72" y1="70" x2="96" y2="70" />
        <line x1="66" y1="82" x2="92" y2="82" />
      </g>
      {kind === "batter" ? (
        <g stroke={fig} strokeWidth="9" strokeLinecap="round" fill="none">
          <line x1="55" y1="34" x2="48" y2="58" />
          <line x1="48" y1="58" x2="37" y2="86" />
          <line x1="48" y1="58" x2="59" y2="84" />
          <line x1="54" y1="38" x2="70" y2="46" />
          <line x1="70" y1="46" x2="86" y2="30" stroke="#e2e8f0" strokeWidth="4" />
        </g>
      ) : (
        <g stroke={fig} strokeWidth="9" strokeLinecap="round" fill="none">
          <line x1="50" y1="32" x2="50" y2="56" />
          <line x1="50" y1="56" x2="43" y2="86" />
          <line x1="50" y1="56" x2="66" y2="63" />
          <line x1="66" y1="63" x2="61" y2="79" />
          <line x1="50" y1="36" x2="69" y2="27" />
          <line x1="50" y1="38" x2="35" y2="46" />
        </g>
      )}
      {kind === "batter" ? (
        <>
          <circle cx="60" cy="23" r="8.5" fill={fig} />
          <path d="M 52 20 a 8.5 8.5 0 0 1 12 -3 l -2 -4 a 11 11 0 0 0 -14 3 z" fill="#1e293b" />
          <circle cx="88" cy="28" r="3" fill="#f8fafc" />
        </>
      ) : (
        <>
          <circle cx="50" cy="21" r="8.5" fill={fig} />
          <circle cx="71" cy="25" r="3" fill="#f8fafc" />
          <circle cx="33" cy="47" r="6.5" fill="#1e293b" />
        </>
      )}
    </svg>
  );
}

export function GameCard({
  pos, name, team, card, score, filled, kind, artUrl, onClick,
}: {
  pos: string; name: string; team: string; card: string; score: number; filled: boolean;
  kind: Kind; artUrl?: string; onClick: () => void;
}) {
  const gc = gradeColor(card);
  if (!filled) {
    return (
      <button className="pcard dcard gcard empty" onClick={onClick}
        title={`${pos} 비어있음 — 클릭하면 입력 팝업`}>
        <span className="dc-pos alone">{pos}</span>
        <span className="dc-name muted">+ 등록</span>
      </button>
    );
  }
  return (
    <button
      className="pcard dcard gcard"
      style={{ borderColor: gc, boxShadow: `0 0 12px ${gc}66` }}
      onClick={onClick}
      title={`${name} — 클릭하면 입력 팝업`}
    >
      <span className="gc-top">
        <span className="dc-ovr">{score.toFixed(0)}</span>
        <span className="dc-pos" style={{ background: `${gc}55` }}>{pos}</span>
      </span>
      {team && <span className="dc-team">{team}</span>}
      <span className="gc-artbox" style={{ background: `linear-gradient(180deg, #101b30 0%, ${gc}33 100%)` }}>
        {artUrl
          ? <img className="gc-img" src={artUrl} alt={name} />
          : <PlayerArt kind={kind} accent={gc} />}
      </span>
      <span className="dc-name">{name}</span>
      <span className="dc-grade">{shortCard(card)}</span>
    </button>
  );
}
