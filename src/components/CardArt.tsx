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

/** 타자/투수 일러스트: 유니폼·헬멧·장비 갖춘 플랫 벡터 + 금빛 불꽃 배경 */
export function PlayerArt({ kind, accent }: { kind: Kind; accent: string }) {
  const SKIN = "#eab88c";
  const SKIN_D = "#d29a6b";
  const JERSEY = "#f1f5f9";
  const JERSEY_D = "#cbd5e1";
  const PANTS = "#eef2f6";
  const PANTS_D = "#c9d2dd";
  const NAVY = "#16294d";
  const NAVY_L = "#274067";
  return (
    <svg viewBox="0 0 100 120" className="gc-art" aria-hidden="true">
      <defs>
        <radialGradient id={`gc-flame-${kind}`} cx="50%" cy="88%" r="75%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`gc-glow-${kind}`} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`gc-soft-${kind}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="120" fill="#0d1628" />
      <circle cx="50" cy="30" r="52" fill={`url(#gc-glow-${kind})`} />
      {/* 불꽃 (필터 없이 그라데이션 타원으로 — 블러 필터가 카드 텍스트 합성을 깨뜨림) */}
      <g>
        <ellipse cx="22" cy="108" rx="17" ry="27" fill={`url(#gc-soft-${kind})`} opacity="0.7" />
        <ellipse cx="50" cy="114" rx="22" ry="32" fill={`url(#gc-soft-${kind})`} opacity="0.8" />
        <ellipse cx="78" cy="108" rx="17" ry="27" fill={`url(#gc-soft-${kind})`} opacity="0.7" />
        <ellipse cx="38" cy="94" rx="9" ry="15" fill="#fde68a" opacity="0.55" />
        <ellipse cx="64" cy="94" rx="9" ry="15" fill="#fde68a" opacity="0.55" />
      </g>
      <rect x="0" y="0" width="100" height="120" fill={`url(#gc-flame-${kind})`} />
      {/* 불티 */}
      <g fill="#fde68a" opacity="0.8">
        <circle cx="18" cy="70" r="1.4" />
        <circle cx="30" cy="52" r="1" />
        <circle cx="82" cy="62" r="1.4" />
        <circle cx="90" cy="80" r="1" />
        <circle cx="70" cy="40" r="1" />
      </g>
      {kind === "batter" ? (
        <g>
          {/* 방망이 (손 뒤) */}
          <polygon points="80,2 89,7 69,31 62,26" fill="#d9a866" />
          <polygon points="80,2 84,4 66,28 62,26" fill="#f0c98a" />
          <line x1="64" y1="32" x2="80" y2="10" stroke="#8a5a2e" strokeWidth="3.5" strokeLinecap="round" />
          {/* 뒷다리 (음영) */}
          <line x1="57" y1="62" x2="65" y2="102" stroke={PANTS_D} strokeWidth="10" strokeLinecap="round" />
          <rect x="58" y="100" width="15" height="6.5" rx="3" fill="#1e293b" />
          {/* 앞다리 */}
          <line x1="50" y1="62" x2="40" y2="102" stroke={PANTS} strokeWidth="10" strokeLinecap="round" />
          <rect x="30" y="100" width="15" height="6.5" rx="3" fill="#0f172a" />
          {/* 몸통 유니폼 */}
          <path d="M42,30 L62,30 L64,62 L44,62 Z" fill={JERSEY} />
          <path d="M55,30 L62,30 L64,62 L56,62 Z" fill={JERSEY_D} opacity="0.8" />
          <line x1="53" y1="32" x2="53" y2="58" stroke={JERSEY_D} strokeWidth="1.4" />
          <circle cx="53" cy="38" r="1.1" fill="#94a3b8" />
          <circle cx="53" cy="45" r="1.1" fill="#94a3b8" />
          <circle cx="53" cy="52" r="1.1" fill="#94a3b8" />
          {/* 벨트 */}
          <rect x="44" y="59" width="20" height="5" fill={NAVY} />
          {/* 소매 */}
          <path d="M42,30 L49,31 L47,42 L39,40 Z" fill={JERSEY} />
          <path d="M62,30 L56,31 L58,42 L65,40 Z" fill={JERSEY_D} />
          {/* 팔 (방망이 쥠) */}
          <line x1="57" y1="38" x2="63" y2="46" stroke={SKIN_D} strokeWidth="6" strokeLinecap="round" />
          <line x1="63" y1="46" x2="66" y2="32" stroke={SKIN_D} strokeWidth="5.5" strokeLinecap="round" />
          <line x1="50" y1="38" x2="57" y2="47" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
          <line x1="57" y1="47" x2="66" y2="32" stroke={SKIN} strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="66" cy="31" r="4.2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
          {/* 목 + 머리 + 헬멧 */}
          <rect x="52" y="24" width="7" height="8" fill={SKIN} />
          <circle cx="55" cy="19" r="8" fill={SKIN} />
          <path d="M46.5,19 a8.5 8.5 0 0 1 17 0 Z" fill={NAVY} />
          <path d="M46.5,19 a8.5 8.5 0 0 1 8 -6 l -1.5 -2.5 a 11 11 0 0 0 -9 8.5 Z" fill={NAVY_L} />
          <rect x="37" y="15.5" width="10" height="3.4" rx="1.7" fill={NAVY} />
        </g>
      ) : (
        <g>
          {/* 지지 다리 */}
          <line x1="50" y1="62" x2="45" y2="102" stroke={PANTS} strokeWidth="10" strokeLinecap="round" />
          <rect x="37" y="100" width="15" height="6.5" rx="3" fill="#0f172a" />
          {/* 든 다리 */}
          <line x1="52" y1="62" x2="67" y2="55" stroke={PANTS_D} strokeWidth="10" strokeLinecap="round" />
          <line x1="67" y1="55" x2="64" y2="73" stroke={PANTS_D} strokeWidth="9" strokeLinecap="round" />
          <rect x="57" y="71" width="13" height="6.5" rx="3" fill="#1e293b" />
          {/* 몸통 유니폼 */}
          <path d="M40,32 L60,32 L58,62 L42,62 Z" fill={JERSEY} />
          <path d="M53,32 L60,32 L58,62 L51,62 Z" fill={JERSEY_D} opacity="0.8" />
          <line x1="47" y1="34" x2="47" y2="58" stroke={JERSEY_D} strokeWidth="1.4" />
          <rect x="42" y="59" width="16" height="5" fill={NAVY} />
          {/* 글러브 팔 */}
          <path d="M40,33 L34,35 L32,44 L38,45 Z" fill={JERSEY} />
          <line x1="36" y1="44" x2="29" y2="50" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="24" cy="55" rx="8" ry="10" fill="#7a4c22" />
          <ellipse cx="24" cy="55" rx="4" ry="6" fill="#5b3719" />
          {/* 던지는 팔 (뒤로) */}
          <path d="M60,33 L55,34 L56,43 L62,42 Z" fill={JERSEY_D} />
          <line x1="59" y1="41" x2="71" y2="28" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
          <circle cx="72" cy="27" r="3.6" fill={SKIN} />
          <circle cx="77" cy="22" r="3.6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
          {/* 목 + 머리 + 모자 */}
          <rect x="47" y="24" width="7" height="8" fill={SKIN} />
          <circle cx="50" cy="20" r="8" fill={SKIN} />
          <path d="M41.5,20 a8.5 8.5 0 0 1 17 0 Z" fill={NAVY} />
          <circle cx="50" cy="13.5" r="1.6" fill={NAVY_L} />
          <rect x="30" y="17" width="13" height="3.4" rx="1.7" fill={NAVY} />
        </g>
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
      style={{ boxShadow: `0 0 12px ${gc}66` }}
      onClick={onClick}
      title={`${name} — 클릭하면 입력 팝업`}
    >
      <span className="gc-top">
        <span className="gc-ovr">{score.toFixed(0)}</span>
        <span className="gc-tags">
          {team && <b className="gc-team">{team.slice(0, 3)}</b>}
          <span className="dc-pos">{pos}</span>
        </span>
      </span>
      <span className="gc-artbox">
        {artUrl
          ? <img className="gc-img" src={artUrl} alt={name} />
          : <PlayerArt kind={kind} accent={gc} />}
      </span>
      <span className="gc-name">{name}</span>
      <span className="dc-grade">{shortCard(card)}</span>
    </button>
  );
}
