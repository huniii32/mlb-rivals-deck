import type { CSSProperties } from "react";
import type { Kind } from "../lib/engine";
import { gradeTheme, type GradeTheme } from "./card/theme";
import { ROLE, variantOf } from "./card/figure";
import { Backdrop, Defs, Wordmark } from "./card/backdrop";
import { BatterArt, CloserArt, RelieverArt, StarterArt } from "./card/players";

// 게임식 일러스트 카드: 등급 프레임 + 타자/투수 벡터 일러스트 (자체 제작, 저작권 안전).
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

// ── 선수 일러스트 ─────────────────────────────────────────────
// 잉크 외곽선 + 해칭 음영의 코믹 일러스트 톤. 배경(색·모티프)은 카드 등급이, 포즈와
// 유니폼 포인트색(모자 챙·소매 파이핑·양말·장갑)은 역할(타자/선발/구원/마무리)이 정한다.
// viewBox 100x108 + "xMidYMid slice": 카드 아트박스(≈108x100, 이름 띠 위까지)는 위아래 ~4씩 잘리고,
// 에디터 아바타(60x76)는 가운데 x≈18~82만 보인다 → 인물 핵심은 x 18~82 안.
// 좌상단(점수)·우상단(팀/포지션 태그)은 UI가 덮으므로 얼굴은 가운데, 모서리는 어둡게.
// 인물 그룹은 7 내려 그림 (머리 y≈22~42) → 점수(좌상단)·태그(우상단)와 겹치지 않게.
// SVG 필터 금지(블러 필터가 카드 텍스트 합성을 깨뜨림) — 그라데이션/패턴/클립/도형만.
// id는 문서 전역: 공용 패턴은 고정 id, 파트 클립은 변형(variant)별, 배경 그라데이션은 테마 key별 고유 id.

/** 타자/선발/구원/마무리 4종 일러스트. 배경은 등급(card) 테마, 뒤에 팀 코드 워드마크. */
export function PlayerArt({ kind, pos, team, card = "" }: { kind: Kind; pos?: string; team?: string; card?: string }) {
  const v = variantOf(kind, pos);
  const r = ROLE[v];
  const t = gradeTheme(card);
  return (
    <svg viewBox="0 0 100 108" preserveAspectRatio="xMidYMid slice" className="gc-art" aria-hidden="true">
      <Defs t={t} />
      <Backdrop v={v} t={t} />
      <Wordmark team={team} v={v} t={t} />
      {/* 카드 아트박스는 가로가 약간 넓어(≈108x100) slice로 위아래가 잘림 → 인물을 조금 내려 머리를 점수/태그 아래로 */}
      <g transform="translate(0 7)">
        {v === "bat" ? <BatterArt r={r} t={t} /> : v === "sp" ? <StarterArt r={r} /> : v === "rp" ? <RelieverArt r={r} /> : <CloserArt r={r} />}
      </g>
      {/* 점수·태그 가독성용 상단 모서리 비네팅 (테마 색) */}
      <circle cx="4" cy="2" r="38" fill={`url(#gc2-vig-${t.key})`} />
      <circle cx="98" cy="2" r="30" fill={`url(#gc2-vig-${t.key})`} />
    </svg>
  );
}

/** 카드 프레임 CSS 변수 (styles.css의 .gcard가 사용) + 등급색 외곽 글로우 */
function frameVars(t: GradeTheme): CSSProperties {
  return {
    "--gf-a": t.frame[0],
    "--gf-b": t.frame[1],
    "--gf-c": t.frame[2],
    "--gf-glow": t.glow,
    boxShadow: `0 0 12px ${t.glow}66`,
  } as CSSProperties;
}

export function GameCard({
  pos, name, team, card, score, filled, kind, artUrl, onClick, diff,
}: {
  pos: string; name: string; team: string; card: string; score: number; filled: boolean;
  kind: Kind; artUrl?: string; onClick: () => void; diff?: number;
}) {
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
      style={frameVars(gradeTheme(card))}
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
      {diff !== undefined && diff !== 0 && (
        <b className="gc-diff" style={{ color: diff > 0 ? "var(--good)" : "var(--danger)" }}>
          {diff > 0 ? "+" : ""}{diff.toFixed(1)}
        </b>
      )}
      <span className="gc-artbox">
        {artUrl
          ? <img className="gc-img" src={artUrl} alt={name} />
          : <PlayerArt kind={kind} pos={pos} team={team} card={card} />}
      </span>
      <span className="gc-name">{name}</span>
      <span className="dc-grade">{shortCard(card)}</span>
    </button>
  );
}
