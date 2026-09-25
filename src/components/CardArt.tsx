import type { CSSProperties } from "react";
import type { Kind } from "../lib/engine";

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

// ── 선수 일러스트 ─────────────────────────────────────────────
// 잉크 외곽선 + 해칭 음영의 코믹 일러스트 톤. 배경(색·모티프)은 카드 등급이, 포즈와
// 유니폼 포인트색(모자 챙·소매 파이핑·양말·장갑)은 역할(타자/선발/구원/마무리)이 정한다.
// viewBox 100x108 + "xMidYMid slice": 카드 아트박스(≈108x100, 이름 띠 위까지)는 위아래 ~4씩 잘리고,
// 에디터 아바타(60x76)는 가운데 x≈18~82만 보인다 → 인물 핵심은 x 18~82 안.
// 좌상단(점수)·우상단(팀/포지션 태그)은 UI가 덮으므로 얼굴은 가운데, 모서리는 어둡게.
// 인물 그룹은 7 내려 그림 (머리 y≈22~42) → 점수(좌상단)·태그(우상단)와 겹치지 않게.
// SVG 필터 금지(블러 필터가 카드 텍스트 합성을 깨뜨림) — 그라데이션/패턴/클립/도형만.
// id는 문서 전역: 공용 패턴은 고정 id, 파트 클립은 변형(variant)별, 배경 그라데이션은 테마 key별 고유 id.

const OL = "#0a0d18"; // 잉크 외곽선
const SKIN = "#e0aa80";
const WHITE = "#f4f2ec";
const NAVY = "#16223f";
const NAVY_L = "#3a5288";
const BELT = "#17171d";
const LEATHER = "#6a4226";
const LEATHER_D = "#3a2212";
const WOOD = "#d8a864";
const FONT = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";

type Variant = "bat" | "sp" | "rp" | "cp";
type Role = { acc: string; accD: string; hot: string };
const ROLE: Record<Variant, Role> = {
  bat: { acc: "#f2a516", accD: "#a86306", hot: "#fde68a" },
  sp: { acc: "#2f74e8", accD: "#1a3f99", hot: "#bfdbfe" },
  rp: { acc: "#22a55a", accD: "#136b38", hot: "#bbf7d0" },
  cp: { acc: "#e0322c", accD: "#8e1512", hot: "#fed7aa" },
};

// ── 등급 테마: 배경 그라데이션·붓 색·모티프·워드마크 색 + 카드 프레임 색 ──
type Motif = "sparks" | "stars" | "splash" | "confetti" | "shards" | "bolts" | "beams" | "rays";
export type GradeTheme = {
  key: string; // id 접미사 (영문)
  bg: [string, string]; // 위→아래
  ink: string; // 큰 붓 (어두운 쪽)
  s1: string; // 큰 붓 (밝은 쪽)
  s2: string; // 가는 붓·물감 점
  s3: string; // 하이라이트 (모티프·스윙 궤적)
  motif: Motif[];
  wm: string; // 워드마크 색
  wmOp: number;
  wmOff: string; // 워드마크 어긋난 그림자 색
  vig: string; // 상단 모서리 비네팅 색 (점수 가독성)
  frame: [string, string, string]; // --gf-a/b/c
  glow: string; // --gf-glow (#rrggbb)
};
const prime = (key: string, extra: Motif[]): GradeTheme => ({
  key, bg: ["#12357f", "#050d2a"], ink: "#030a22", s1: "#2563eb", s2: "#38bdf8", s3: "#e0f2fe",
  motif: ["rays", ...extra], wm: "#020617", wmOp: 0.75, wmOff: "#38bdf8", vig: "#020617",
  frame: ["#7db4fb", "#1d4ed8", "#172554"], glow: "#3b82f6",
});
const THEMES: [string, GradeTheme][] = [
  ["명예의 전당", {
    key: "hof", bg: ["#3a2811", "#0b0805"], ink: "#050302", s1: "#7a5418", s2: "#f4c95d", s3: "#fff1bf",
    motif: ["sparks", "bolts"], wm: "#000000", wmOp: 0.8, wmOff: "#f4c95d", vig: "#080502",
    frame: ["#fde68a", "#b7862c", "#3a2710"], glow: "#fbbf24",
  }],
  ["블랙", {
    key: "blk", bg: ["#1d1238", "#040308"], ink: "#000000", s1: "#5b21b6", s2: "#a78bfa", s3: "#e9d5ff",
    motif: ["stars", "beams"], wm: "#000000", wmOp: 0.8, wmOff: "#a78bfa", vig: "#030208",
    frame: ["#c4b5fd", "#6d28d9", "#150b2b"], glow: "#a855f7",
  }],
  ["WBC 시그니처", {
    key: "wsig", bg: ["#f8f0ff", "#e4d2fb"], ink: "#a57cf0", s1: "#f5b8fb", s2: "#c9a2fb", s3: "#ffffff",
    motif: ["confetti", "splash"], wm: "#3b0764", wmOp: 0.7, wmOff: "#ffffff", vig: "#2e1065",
    frame: ["#fbcfe8", "#c084fc", "#6b21a8"], glow: "#d946ef",
  }],
  ["FA 시그니처", {
    key: "fsig", bg: ["#ff6fbd", "#9d0d5f"], ink: "#4a0630", s1: "#ff2d95", s2: "#ffd1ea", s3: "#ffe4f2",
    motif: ["shards", "splash"], wm: "#3d0526", wmOp: 0.75, wmOff: "#ffd1ea", vig: "#3d0526",
    frame: ["#ffd1ea", "#ec4899", "#6b0f40"], glow: "#ec4899",
  }],
  ["시그니처", {
    key: "sig", bg: ["#fff6f0", "#fcdce3"], ink: "#f07ea0", s1: "#fdc7a3", s2: "#f7a3c7", s3: "#ffffff",
    motif: ["splash"], wm: "#7a2745", wmOp: 0.55, wmOff: "#ffffff", vig: "#5a1a33",
    frame: ["#ffffff", "#f9a8d4", "#9d4a6b"], glow: "#f472b6",
  }],
  ["슈프림", {
    key: "sup", bg: ["#0f4a47", "#031514"], ink: "#01100f", s1: "#0f766e", s2: "#b6ff3b", s3: "#f7ff9e",
    motif: ["bolts", "sparks"], wm: "#000000", wmOp: 0.75, wmOff: "#b6ff3b", vig: "#021110",
    frame: ["#ecfccb", "#84cc16", "#134e4a"], glow: "#a3e635",
  }],
  ["모먼트", {
    key: "mom", bg: ["#10614f", "#04211c"], ink: "#021713", s1: "#059669", s2: "#6ee7b7", s3: "#d1fae5",
    motif: ["beams"], wm: "#000000", wmOp: 0.7, wmOff: "#6ee7b7", vig: "#021512",
    frame: ["#a7f3d0", "#10b981", "#064e3b"], glow: "#34d399",
  }],
  ["WBC 프라임", prime("wpri", ["confetti"])],
  ["FA 프라임", prime("fpri", ["shards"])],
  ["프라임", prime("pri", [])],
];
const DEFAULT_THEME: GradeTheme = {
  key: "def", bg: ["#3b4a60", "#0f172a"], ink: "#070b14", s1: "#475569", s2: "#94a3b8", s3: "#e2e8f0",
  motif: [], wm: "#000000", wmOp: 0.7, wmOff: "#94a3b8", vig: "#020617",
  frame: ["#94a3b8", "#475569", "#1e293b"], glow: "#64748b",
};

export function gradeTheme(card: string): GradeTheme {
  for (const [k, t] of THEMES) if (card.includes(k)) return t;
  return DEFAULT_THEME;
}

function variantOf(kind: Kind, pos?: string): Variant {
  if (kind === "batter") return "bat";
  const p = (pos ?? "").toUpperCase();
  return p.startsWith("RP") ? "rp" : p.startsWith("CP") ? "cp" : "sp";
}

// ── 그리기 시스템 ──
// 파트 = 채운 면. 1패스: 모든 파트를 굵은 잉크로 깔아 바깥 실루엣만 두껍게,
// 2패스: 면 + 가는 내부선 → 선 굵기가 자연스럽게 달라진다.
type Part = {
  d: string;
  f?: string; // 면 색 (없으면 선만)
  o?: false; // 굵은 실루엣 제외 (단추·로고 같은 장식)
  ns?: true; // 면만 채우고 자기 테두리는 생략 (바지 같은 이음새 없는 실루엣; 외곽은 1패스 굵은 선이 담당)
  sh?: string; // 셀 음영 + 해칭 (이 파트 모양으로 클립)
  dk?: string; // 짙은 음영 (챙 그늘 등)
  ln?: string; // 내부 선 (주름·파이핑·손가락)
  lc?: string;
  lw?: number;
};

function Figure({ id, parts }: { id: string; parts: Part[] }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <g fill={OL} stroke={OL} strokeWidth={3}>
        {parts.map((p, i) => (p.f && p.o !== false ? <path key={i} d={p.d} /> : null))}
      </g>
      {parts.map((p, i) => (
        <g key={i}>
          {p.f && <path d={p.d} fill={p.f} stroke={p.ns ? "none" : OL} strokeWidth={0.7} />}
          {(p.sh || p.dk) && (
            <>
              <clipPath id={`${id}-${i}`}>
                <path d={p.d} />
              </clipPath>
              <g clipPath={`url(#${id}-${i})`}>
                {p.sh && <path d={p.sh} fill={OL} opacity={0.2} />}
                {p.sh && <path d={p.sh} fill="url(#gc2-h)" />}
                {p.dk && <path d={p.dk} fill={OL} opacity={0.42} />}
                {p.dk && <path d={p.dk} fill="url(#gc2-h)" />}
              </g>
            </>
          )}
          {p.ln && <path d={p.ln} fill="none" stroke={p.lc ?? OL} strokeWidth={p.lw ?? 0.55} />}
        </g>
      ))}
    </g>
  );
}

/** 공용 해칭 패턴 + 테마별 배경/비네팅 그라데이션 (id에 테마 key) */
function Defs({ t }: { t: GradeTheme }) {
  return (
    <defs>
      <pattern id="gc2-h" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <rect width="0.42" height="1.5" fill={OL} opacity="0.6" />
      </pattern>
      <linearGradient id={`gc2-bg-${t.key}`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor={t.bg[0]} />
        <stop offset="100%" stopColor={t.bg[1]} />
      </linearGradient>
      <radialGradient id={`gc2-vig-${t.key}`}>
        <stop offset="0%" stopColor={t.vig} stopOpacity="0.85" />
        <stop offset="55%" stopColor={t.vig} stopOpacity="0.45" />
        <stop offset="100%" stopColor={t.vig} stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// ── 배경: 붓 자국 + 등급 모티프 ──
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** (x1,y1)→(x2,y2) 방향 붓 한 획: 들쭉날쭉한 가장자리 + 끝의 갈라진 마른 붓 줄 */
function brush(x1: number, y1: number, x2: number, y2: number, w: number, seed: number) {
  const r = rng(seed);
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const n = 12, top: string[] = [], bot: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const hw = (w / 2) * (0.72 + 0.28 * Math.sin(Math.PI * t));
    const px = x1 + dx * t, py = y1 + dy * t;
    const a = hw * (0.88 + r() * 0.2), b = hw * (0.88 + r() * 0.2);
    top.push(`${(px + nx * a).toFixed(1)},${(py + ny * a).toFixed(1)}`);
    bot.push(`${(px - nx * b).toFixed(1)},${(py - ny * b).toFixed(1)}`);
  }
  const body = `M${top.join(" L")} L${bot.reverse().join(" L")}Z`;
  // 마른 붓: 획 끝에서 갈라져 나가는 가는 줄들
  let dry = "";
  for (let k = 0; k < 7; k++) {
    const o = (k / 6 - 0.5) * w * 0.9;
    const s0 = 0.75 + r() * 0.15, s1 = 1.02 + r() * 0.16;
    dry += `M${(x1 + dx * s0 + nx * o).toFixed(1)},${(y1 + dy * s0 + ny * o).toFixed(1)} L${(x1 + dx * s1 + nx * o).toFixed(1)},${(y1 + dy * s1 + ny * o).toFixed(1)}`;
  }
  return { body, dry };
}

/** 튄 물감 점들 (한 path) */
function splatter(seed: number, n: number, x0: number, x1: number, y0: number, y1: number) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), s = 0.4 + r() * 1.3;
    d += `M${(x - s).toFixed(1)},${y.toFixed(1)}a${s.toFixed(1)},${s.toFixed(1)} 0 1,0 ${(2 * s).toFixed(1)},0a${s.toFixed(1)},${s.toFixed(1)} 0 1,0 ${(-2 * s).toFixed(1)},0`;
  }
  return d;
}

type Tone = "ink" | "s1" | "s2";
// [x1,y1,x2,y2,폭,색,불투명도]
type Stroke = [number, number, number, number, number, Tone, number?];
const STROKES: Record<Variant, Stroke[]> = {
  bat: [
    [98, 114, 76, -8, 40, "ink"],
    [-8, 44, 18, -8, 22, "ink"],
    [60, 114, 44, -8, 8, "s2", 0.7],
  ],
  sp: [
    [76, 114, 98, -8, 44, "ink"],
    [2, 114, 28, -8, 30, "s1"],
    [58, 114, 80, -8, 8, "s1"],
    [-10, 58, 12, -8, 20, "ink"],
    [34, 110, 58, -8, 6, "s2", 0.5],
  ],
  rp: [
    [84, 114, 86, -8, 38, "ink"],
    [12, 114, 16, -8, 26, "s1"],
    [68, 114, 70, -8, 6, "s1"],
    [-6, 114, -4, -8, 14, "ink"],
  ],
  cp: [
    [30, 114, 6, -8, 40, "s1"],
    [98, 114, 78, -8, 42, "ink"],
    [62, 114, 44, -8, 14, "s1"],
    [-8, 40, 18, -8, 18, "ink"],
    [86, 114, 70, -8, 6, "s2"],
  ],
};

const BG_CACHE: Partial<Record<Variant, { body: string; dry: string; tone: Tone; op: number }[]>> = {};
function strokesOf(v: Variant) {
  return (BG_CACHE[v] ??= STROKES[v].map(([a, b, c, d, w, tone, op], i) => ({
    ...brush(a, b, c, d, w, 7 + i * 131 + v.length * 17),
    tone,
    op: op ?? 1,
  })));
}

const f1 = (n: number) => n.toFixed(1);

/** 번개: 지그재그 꺾은선 */
function bolt(x: number, y: number, len: number, ang: number, seed: number) {
  const r = rng(seed);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let d = `M${f1(x)},${f1(y)}`;
  for (let i = 1; i <= 6; i++) {
    const t = (len * i) / 6, o = (r() - 0.5) * len * 0.35;
    d += ` L${f1(x + dx * t - dy * o)},${f1(y + dy * t + dx * o)}`;
  }
  return d;
}

/** 등급 모티프 도형들 (테마당 한 번 계산) — 전부 몇 개의 path */
type MotifShapes = { under: [string, string, number][]; over: [string, string, number, number?][] };
const MOTIF_CACHE: Record<string, MotifShapes> = {};
function motifOf(t: GradeTheme): MotifShapes {
  const hit = MOTIF_CACHE[t.key];
  if (hit) return hit;
  const r = rng(t.key.charCodeAt(0) * 97 + t.key.length * 13);
  const under: MotifShapes["under"] = []; // [d, fill, opacity] 붓 아래
  const over: MotifShapes["over"] = []; // [d, color, opacity, strokeWidth?] 붓 위 (strokeWidth 있으면 선)
  for (const m of t.motif) {
    if (m === "rays") {
      let d = "";
      for (let i = 0; i < 7; i++) {
        const a = -0.3 + i * 0.62 + r() * 0.2, b = a + 0.12 + r() * 0.08;
        d += `M50,-6 L${f1(50 + Math.cos(a + 1.2) * 160)},${f1(-6 + Math.sin(a + 1.2) * 160)} L${f1(50 + Math.cos(b + 1.2) * 160)},${f1(-6 + Math.sin(b + 1.2) * 160)}Z`;
      }
      under.push([d, t.s3, 0.22]);
    } else if (m === "beams") {
      under.push(["M8,-4 L26,-4 L-4,70 L-4,40Z M58,-4 L66,-4 L30,112 L22,112Z M84,-4 L104,-4 L104,20 L62,112 L50,112Z", t.s3, 0.24]);
      over.push(["M60,-4 L25,112 M88,-4 L54,112", t.s2, 0.7, 0.6]);
    } else if (m === "bolts") {
      over.push([bolt(-2, 22, 40, 0.5, 11) + bolt(102, 30, 38, 2.5, 23) + bolt(90, 112, 40, -1.9, 37), t.s2, 0.4, 4]);
      over.push([bolt(-2, 22, 40, 0.5, 11) + bolt(102, 30, 38, 2.5, 23) + bolt(90, 112, 40, -1.9, 37), t.s3, 1, 1.3]);
    } else if (m === "sparks") {
      over.push([splatter(r() * 1e6 + 3, 16, 2, 98, 20, 100), t.s3, 0.95]);
      over.push([splatter(r() * 1e6 + 5, 10, 2, 98, 30, 100), t.s2, 0.8]);
    } else if (m === "stars") {
      let d = "";
      for (let i = 0; i < 9; i++) {
        const x = 4 + r() * 92, y = 22 + r() * 70, s = 0.8 + r() * 1.6, q = s * 0.22;
        d += `M${f1(x)},${f1(y - s)} L${f1(x + q)},${f1(y - q)} L${f1(x + s)},${f1(y)} L${f1(x + q)},${f1(y + q)} L${f1(x)},${f1(y + s)} L${f1(x - q)},${f1(y + q)} L${f1(x - s)},${f1(y)} L${f1(x - q)},${f1(y - q)}Z`;
      }
      over.push([d, t.s3, 0.95]);
    } else if (m === "splash") {
      let d = "";
      for (let i = 0; i < 5; i++) {
        const x = 6 + r() * 88, y = 30 + r() * 64, s = 1.6 + r() * 2.2;
        d += `M${f1(x - s)},${f1(y)} q${f1(s * 0.2)},${f1(-s * 1.1)} ${f1(s)},${f1(-s)} q${f1(s * 1.2)},${f1(s * 0.1)} ${f1(s)},${f1(s)} q${f1(-s * 0.3)},${f1(s * 1.2)} ${f1(-s)},${f1(s)} q${f1(-s * 1.1)},${f1(-s * 0.2)} ${f1(-s)},${f1(-s)}Z`;
      }
      over.push([d, t.s2, 0.85]);
      over.push([splatter(r() * 1e6 + 7, 12, 2, 98, 24, 100), t.s3, 0.9]);
    } else if (m === "confetti") {
      for (const c of [t.s1, t.s3, "#fcd34d", "#67e8f9"]) {
        let d = "";
        for (let i = 0; i < 5; i++) {
          const x = 3 + r() * 94, y = 18 + r() * 76, a = r() * Math.PI, w = 1.1 + r(), h = 2 + r() * 1.4;
          const ca = Math.cos(a), sa = Math.sin(a);
          const pt = (u: number, v: number) => `${f1(x + u * ca - v * sa)},${f1(y + u * sa + v * ca)}`;
          d += `M${pt(-w, -h)} L${pt(w, -h)} L${pt(w, h)} L${pt(-w, h)}Z`;
        }
        over.push([d, c, 0.95]);
      }
    } else if (m === "shards") {
      let lite = "", deep = "";
      for (let i = 0; i < 12; i++) {
        const x = r() * 100, y = 6 + r() * 96, s = 9 + r() * 14, a = r() * 6.28;
        const tri = `M${f1(x)},${f1(y)} L${f1(x + Math.cos(a) * s)},${f1(y + Math.sin(a) * s)} L${f1(x + Math.cos(a + 0.7) * s * 0.8)},${f1(y + Math.sin(a + 0.7) * s * 0.8)}Z`;
        if (i % 2) lite += tri; else deep += tri;
      }
      under.push([deep, t.s1, 0.8]);
      over.push([lite, t.s3, 0.5]);
    }
  }
  return (MOTIF_CACHE[t.key] = { under, over });
}

function Backdrop({ v, t }: { v: Variant; t: GradeTheme }) {
  const col: Record<Tone, string> = { ink: t.ink, s1: t.s1, s2: t.s2 };
  const m = motifOf(t);
  return (
    <>
      <rect width="100" height="108" fill={`url(#gc2-bg-${t.key})`} />
      {m.under.map(([d, c, o], i) => <path key={i} d={d} fill={c} opacity={o} />)}
      {strokesOf(v).map((s, i) => (
        <g key={i} opacity={s.op}>
          <path d={s.body} fill={col[s.tone]} />
          <path d={s.dry} stroke={col[s.tone]} strokeWidth={1.1} strokeLinecap="round" fill="none" />
        </g>
      ))}
      {m.over.map(([d, c, o, w], i) =>
        w ? <path key={i} d={d} fill="none" stroke={c} strokeWidth={w} opacity={o} strokeLinejoin="round" strokeLinecap="round" />
          : <path key={i} d={d} fill={c} opacity={o} />)}
    </>
  );
}

/** 팀 코드 워드마크(굵은 이탤릭). 팀이 없으면 굵은 사선 붓 한 획. */
function Wordmark({ team, v, t }: { team?: string; v: Variant; t: GradeTheme }) {
  const code = (team ?? "").trim().slice(0, 3).toUpperCase();
  if (!code) {
    const s = brush(6, 84, 96, 30, 16, v.length * 11 + 2);
    return (
      <g opacity={0.85}>
        <path d={s.body} fill={t.ink} />
        <path d={s.dry} stroke={t.ink} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    );
  }
  const txt = {
    x: 62,
    y: 68,
    textAnchor: "middle" as const,
    fontSize: 46,
    fontStyle: "italic",
    fontWeight: 900,
    fontFamily: FONT,
    textLength: code.length === 1 ? 40 : code.length === 2 ? 70 : 96,
    lengthAdjust: "spacingAndGlyphs" as const,
  };
  return (
    <g transform="rotate(-11 50 54) skewX(-14)">
      <text {...txt} x={txt.x + 1.6} y={txt.y + 1.4} fill={t.wmOff} opacity={0.65}>{code}</text>
      <text {...txt} fill={t.wm} opacity={t.wmOp}>{code}</text>
    </g>
  );
}

// ── 머리 (왼쪽을 봄, 모자/헬멧 챙 그늘이 눈을 가림) ──
function Head({ id, x, y, s, rot = 0, gear, r, fierce }: {
  id: string; x: number; y: number; s: number; rot?: number; gear: "cap" | "helmet"; r: Role; fierce?: boolean;
}) {
  const face: Part = {
    d: "M-5.2,-3 L-6.1,-0.2 L-6.3,1.2 L-7.9,3.1 L-6.4,3.9 L-6.7,4.9 L-6.1,5.5 L-6.5,6.3 L-5.5,8.1 Q-2.5,9.5 1.8,8 Q4.6,6 6.3,2.5 L6.8,-3 Z",
    f: SKIN,
    sh: "M0.4,-4 Q3,3 -1.8,9.8 L9,9.8 L9,-4 Z",
    dk: "M-9,-4 L9,-4 L9,0.2 Q3,0.4 -1,2.7 Q-5,2.7 -9,1.6 Z",
    ln: fierce
      ? "M-6.3,5.2 L-4.2,5.6 L-5.8,6.4 M-6.4,3.7 Q-5.6,4 -5.1,3.5 M-0.5,8.8 Q2.6,7 3.6,4 M-5,2.9 Q-4.1,4.3 -4.3,5.4"
      : "M-6.1,5.55 L-4.3,5.4 M-6.4,3.7 Q-5.6,4 -5.1,3.5 M-0.5,8.8 Q2.6,7 3.6,4 M-5,2.9 Q-4.3,4.3 -4.8,5.2",
  };
  const parts: Part[] =
    gear === "cap"
      ? [
          face,
          { d: "M2,0.6 Q2,-1.8 3.8,-1.6 Q5.5,-1 5.1,1.8 Q4.5,4.1 2.9,3.7 Q1.9,2.6 2,0.6 Z", f: SKIN, ln: "M3,0.1 Q4.3,0.3 3.9,2.3" },
          {
            d: "M-6.4,-1.6 C-7,-8.5 -2,-11.4 2.5,-11 C7.5,-10.6 9.2,-6.4 7.2,-1.2 Q0,-2.6 -6.4,-1.6 Z",
            f: NAVY,
            sh: "M2,-12 Q5.5,-6 3.8,-1 L10,-1 L10,-12 Z",
            ln: "M1.9,-11 Q-1.5,-6.5 -3.6,-1.9 M2.3,-11 Q4.8,-6.5 4.8,-1.6 M-4.8,-5.6 Q-2.8,-9.6 1,-10.4",
            lc: NAVY_L,
            lw: 0.8,
          },
          { d: "M-6.3,-1.9 Q0,-2.9 7.1,-1.4", ln: "M-6.3,-1.9 Q0,-2.9 7.1,-1.4", lc: r.acc, lw: 0.9 },
          {
            d: "M-5.6,-2.5 Q-9.4,-2.4 -12.8,-0.7 Q-13.2,0.9 -11.4,1.1 Q-8,0.3 -5.2,0.3 Z",
            f: r.acc,
            sh: "M-14,-0.2 L-4,-1 L-4,2 L-14,2 Z",
          },
        ]
      : [
          face,
          {
            d: "M-6.8,-1.4 C-7.4,-9.6 -1,-12.6 3.4,-12 C8.8,-11.4 10,-6 9,0.5 L8.4,5.5 Q6,7.8 2.6,6.4 L1.8,1.4 Q-2,-1.6 -6.8,-1.4 Z",
            f: NAVY,
            sh: "M3,-13 Q6.5,-4 2.4,7 L11,7 L11,-13 Z",
            ln: "M-4.8,-6 Q-2.2,-10.4 2.6,-10.9",
            lc: "#8ea6d6",
            lw: 1.2,
          },
          { d: "M1.8,1.4 L2.6,6.4 M5.3,1.4 h0.01", ln: "M1.9,1.6 L2.7,6.2", lc: r.acc, lw: 0.9 },
          {
            d: "M-6.2,-2 Q-8.8,-1.9 -11.2,-0.6 Q-11.4,0.9 -10,1 L-5.9,0.5 Z",
            f: r.acc,
            sh: "M-12,-0.2 L-4,-0.8 L-4,2 L-12,2 Z",
          },
        ];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <Figure id={id} parts={parts} />
    </g>
  );
}

// ── 공용 파트 조각 ──
const buttons = (pts: [number, number][]): Part => ({
  d: "",
  o: false,
  ln: pts.map(([x, y]) => `M${x},${y} h0.01`).join(" "),
  lc: NAVY,
  lw: 1.3,
});
const logo = (d: string, r: Role): Part => ({ d: "", o: false, ln: d, lc: r.acc, lw: 1.5 });
const ball = (x: number, y: number, rad: number): Part => ({
  d: `M${x - rad},${y} a${rad},${rad} 0 1,0 ${2 * rad},0 a${rad},${rad} 0 1,0 ${-2 * rad},0`,
  f: "#fbfbf8",
  sh: `M${x - rad},${y + rad * 0.2} Q${x},${y + rad * 0.9} ${x + rad},${y - rad * 0.3} L${x + rad},${y + rad} L${x - rad},${y + rad} Z`,
  ln: `M${x - rad * 0.45},${y - rad * 0.85} Q${x + rad * 0.1},${y} ${x - rad * 0.45},${y + rad * 0.85} M${x + rad * 0.5},${y - rad * 0.8} Q${x},${y} ${x + rad * 0.5},${y + rad * 0.8}`,
  lc: "#d11f1f",
  lw: 0.5,
});

/** 타자: 팔로스루 — 몸통 회전, 배트는 어깨 너머 위로, 금빛 스윙 궤적 */
function BatterArt({ r, t }: { r: Role; t: GradeTheme }) {
  const back: Part[] = [
    // 바지 (앞다리 뻗고 뒷다리 무릎 안으로)
    {
      d: "M40.5,63.5 L62.5,62 Q66.5,74 70.5,92 L73,110 L60,110 L57,88 L51,77 L44,92 L36,110 L24,110 L34,87 Q38,74 40.5,63.5 Z",
      f: WHITE,
      sh: "M51,60 L78,60 L78,112 L59,112 Q58,88 51,76 Z",
      ln: "M41.5,66 Q37.5,80 31,100 M61.8,64.5 Q64.5,80 67.5,100 M44,71 q3,3 6.5,3.2",
      lc: NAVY,
      lw: 0.8,
    },
    // 뒷팔: 반팔 소매 + 남색 언더셔츠
    { d: "M59,38.5 Q68,39.5 75,43.5 Q77,48.5 72,50.5 Q66,47.5 58,46.5 Z", f: NAVY, sh: "M55,47 L80,44 L80,54 L55,54 Z" },
    { d: "M69.5,49.5 Q75.5,50 75,44.5 L70.5,31 L65,32.5 Z", f: NAVY, sh: "M72,30 L80,30 L80,52 L73,52 Z" },
    { d: "M56.5,36.5 Q63,35.5 67.5,39.5 L64,47.5 Q60,47 56.5,45.5 Z", f: WHITE, sh: "M60,35 L70,35 L66,49 L60,49 Z", ln: "M67.4,39.6 L64.1,47.4", lc: r.acc, lw: 1.2 },
    // 목
    { d: "M45.5,28.5 L54,27.5 L55,38 Q50,40.5 44.5,38 Z", f: SKIN, sh: "M50.5,26 L58,26 L58,42 L51.5,42 Q52.5,34 50.5,26 Z", ln: "M47.2,31 Q49.3,34.5 51.6,37.8" },
    // 상의
    {
      d: "M35,41 Q46,35.5 57.5,37 Q63.5,39 64,42 Q66,52 61.5,62 L40.5,64 Q36,53 35,41 Z",
      f: WHITE,
      sh: "M54,36 Q61,50 56.5,65 L70,65 L70,36 Z",
      ln: "M48.5,40 Q45.8,52 46.8,63.6 M51.6,39.6 Q49.2,52 49.9,63.3 M39.5,50 Q43.5,52.5 46,51.5 M58.5,45 Q56.3,51 58,56",
      lc: NAVY,
      lw: 0.8,
    },
    { d: "M44,37.2 Q49.5,41.5 55,37.6 L56,39.2 Q49.5,44.2 43,38.6 Z", f: NAVY, o: false },
    buttons([[48.2, 46], [47.7, 52], [47.9, 58]]),
    logo("M37.5,47.5 q2.6,-3 5.2,-1 t5.2,-0.6 t4,-1.6", r),
    { d: "M40,60.8 L62.2,59.3 L62.5,63.8 L40.6,65.4 Z", f: BELT, ln: "M45,61.2 h3.4 v3.3 h-3.4 z", lc: "#9aa4b5", lw: 0.7 },
  ];
  const front: Part[] = [
    // 앞팔: 가슴을 가로질러 손이 오른 어깨 위로
    { d: "M33.5,41.5 Q38,38 42.5,40 L44.5,47.5 Q39,48.5 35,47 Z", f: WHITE, sh: "M30,45 L46,44 L46,50 L30,50 Z", ln: "M42.5,40 L44.5,47.5", lc: r.acc, lw: 1.2 },
    { d: "M40,43 Q47,45.5 54.5,46 Q57.5,49.5 55.5,53 Q46.5,52.5 39.5,49.5 Z", f: NAVY, sh: "M30,50 L60,48.5 L60,56 L30,56 Z" },
    { d: "M52,51.5 Q57,53.5 59,49.5 L68,33.5 L63,31.5 Z", f: NAVY, sh: "M60,53 L70,33 L72,33 L72,56 Z" },
    // 배트 (손잡이는 손 사이로, 배럴은 위로)
    {
      d: "M61.1,34.7 L69.9,23.8 Q72.5,20 76.5,13.8 L87.5,0.6 Q90.5,0.8 91.5,3.9 L80.5,17 Q75,21.5 71.9,25.5 L62.9,36.3 Z",
      f: WOOD,
      sh: "M100,0 L78.5,16 L73,23 L64,36 L100,36 Z",
      ln: "M72,22.4 L86.4,4.4",
      lc: "#f7e0b2",
      lw: 0.8,
    },
    { d: "M60.3,35.6 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0", f: "#6b4220" },
    // 배팅 장갑 (두 주먹)
    {
      d: "M60.5,34 Q59.5,29.8 63.5,28.8 L69,27.6 Q72.3,28.4 71.8,32 Q70.8,35.2 66,35.8 Z",
      f: r.acc,
      sh: "M59,33 L73,31 L73,37 L59,37 Z",
      ln: "M63.7,29.2 Q62.8,32.2 63.9,35.4 M66.4,28.6 Q65.6,31.6 66.7,35.3 M69,28 Q68.4,31 69.4,34.4",
      lc: r.accD,
      lw: 0.6,
    },
  ];
  return (
    <g>
      {/* 스윙 궤적: 붓으로 크게 휘두른 금빛 획 */}
      <path d="M-4,100 Q6,40 86,6 L90,9 Q24,42 14,104 Z" fill={t.s2} opacity={0.9} />
      <path d="M2,98 Q12,44 84,10 M8,101 Q18,46 88,12 M-2,94 Q8,42 80,8" stroke={t.s3} strokeWidth={0.8} fill="none" opacity={0.9} />
      <Figure id="gc2-bat-b" parts={back} />
      <Head id="gc2-bat-h" x={49} y={26} s={0.9} rot={-4} gear="helmet" r={r} />
      <Figure id="gc2-bat-f" parts={front} />
    </g>
  );
}

// ── 뼈대 기반 그리기 (선발/구원) ──
// 관절 좌표(P)를 먼저 데이터로 정하고, 팔다리·바지·양말·신발을 전부 그 관절에서 파생시킨다.
// → 조각들이 같은 끝점을 공유해 어긋날 수 없고, 바지는 골반에서 시작하는 하나의 실루엣(ns=면만, 외곽은 Figure의 굵은 잉크 패스)이다.
type P = [number, number];
const pp = (p: P) => `${f1(p[0])},${f1(p[1])}`;
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const SHOE = "#222a40";
const PAIR = /(-?\d*\.?\d+),(-?\d*\.?\d+)/g;

function nrm(a: P, b: P): P {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [-dy / L, dx / L];
}
/** 관절 a→b를 잇는 끝이 둥근 테이퍼 캡슐 (양 끝 반지름 wa, wb) */
function limb(a: P, b: P, wa: number, wb: number): string {
  const [nx, ny] = nrm(a, b);
  const at = (p: P, w: number, s: number): P => [p[0] + nx * w * s, p[1] + ny * w * s];
  return `M${pp(at(a, wa, 1))} L${pp(at(b, wb, 1))} A${f1(wb)},${f1(wb)} 0 0 0 ${pp(at(b, wb, -1))} L${pp(at(a, wa, -1))} A${f1(wa)},${f1(wa)} 0 0 0 ${pp(at(a, wa, 1))} Z`;
}
/** limb와 같은 감김 방향의 다각형 (nonzero 합집합용) */
function poly(pts: P[]): string {
  let A = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; });
  const o = A > 0 ? [...pts].reverse() : pts;
  return `M${o.map(pp).join(" L")}Z`;
}
/** 빛(왼쪽 위) 반대쪽 = 오른쪽/아래쪽 그림자 면 */
function shade(a: P, b: P, wa: number, wb: number, k = 0.15): string {
  const [nx, ny] = nrm(a, b);
  const s = nx * 0.55 + ny * 0.85 >= 0 ? 1 : -1;
  const q = (p: P, w: number): P => [p[0] + nx * w * s, p[1] + ny * w * s];
  return poly([q(a, wa * k), q(b, wb * k), q(b, wb * 3), q(a, wa * 3)]);
}
/** 팔 위 t 지점을 가로지르는 짧은 선 (소매 끝 파이핑) */
function cross(a: P, b: P, wa: number, wb: number, t: number): string {
  const [nx, ny] = nrm(a, b), c = lerp(a, b, t), w = wa + (wb - wa) * t;
  return `M${pp([c[0] + nx * w, c[1] + ny * w])} L${pp([c[0] - nx * w, c[1] - ny * w])}`;
}
/** limb의 한쪽 모서리선 (s=±1, 구간 t0~t1) */
function edge(a: P, b: P, wa: number, wb: number, s: number, t0 = 0, t1 = 1): string {
  const [nx, ny] = nrm(a, b);
  const at = (t: number): P => {
    const c = lerp(a, b, t), w = wa + (wb - wa) * t;
    return [c[0] + nx * w * s, c[1] + ny * w * s];
  };
  return `M${pp(at(t0))} L${pp(at(t1))}`;
}
/** 경로 문자열의 "x,y" 쌍을 (원점 o 기준) 배율·회전 후 at으로 옮김 */
function xf(d: string, o: P, s: number, rot: number, at: P): string {
  const c = Math.cos((rot * Math.PI) / 180), n = Math.sin((rot * Math.PI) / 180);
  return d.replace(PAIR, (_, x, y) => {
    const u = (+x - o[0]) * s, v = (+y - o[1]) * s;
    return `${f1(at[0] + u * c - v * n)},${f1(at[1] + u * n + v * c)}`;
  });
}
/** 스파이크 신발: 발목 an, e=발끝 방향 단위벡터 (아래쪽이 밑창) */
function shoe(an: P, e: P, s = 1): Part[] {
  const g: P = [e[1], -e[0]];
  const m = (d: string) =>
    d.replace(PAIR, (_, u, v) => `${f1(an[0] + (e[0] * +u + g[0] * +v) * s)},${f1(an[1] + (e[1] * +u + g[1] * +v) * s)}`);
  return [
    {
      d: m("M-3.4,-2.8 L3.2,-2.8 Q3.8,-1 6,0.7 Q11.6,1.2 12.4,3.8 Q12.8,5.9 10.6,6.1 L-2.8,6.1 Q-4.7,5.9 -4.5,3 Z"),
      f: SHOE,
      ln: m("M-4.3,4.7 L11.9,4.7"),
      lc: "#d3d8e6",
      lw: 0.8,
    },
    { d: "", o: false, ln: m("M6.6,0.9 Q7.6,3 6.8,4.7 M2.4,-2.6 L4.3,-0.7 M3.4,-3.3 L5.4,-1.3"), lc: "#8d97b3", lw: 0.55 },
  ];
}
/** 야수 글러브(원본 글러브 모양 재사용): 중심 at, 배율 s, 회전 rot */
function glove(at: P, s: number, rot: number, r: Role): Part[] {
  const m = (d: string) => xf(d, [45, 51], s, rot, at);
  return [
    {
      d: m("M37,57 C33,49 36,41 44,40 C51,39 56,44 55,51 C54.5,58 49,62 42,62 Z"),
      f: LEATHER,
      sh: m("M56,42 Q50,56 36,60 L36,64 L58,64 L58,42 Z"),
      dk: m("M40,44 Q46,42 50,45 Q47,48 41,48 Z"),
      ln: m("M40,44.5 Q46,42.5 52,45.5 M38.6,50 Q46,48 54,51 M40,55.5 Q46,54.5 52.5,56.5 M37.3,48.5 L41.3,41.8 M38.8,50.2 L43.5,43.2"),
      lc: LEATHER_D,
      lw: 0.55,
    },
    { d: m("M40.5,55 L47,53.6 L48.6,59.4 L42.4,61 Z"), f: r.acc, sh: m("M45,52 L52,52 L52,64 L45,64 Z"), o: false },
  ];
}

/** 선발: 와인드업 밸런스 포인트 — 축발 위에 상체를 세우고 무릎을 벨트 높이로 들어 올림, 두 손은 가슴에 */
function StarterArt({ r }: { r: Role }) {
  // 관절 (왼쪽을 봄 · 가까운 쪽 = 글러브 팔/든 다리, 먼 쪽 = 던지는 팔/축발)
  const sN: P = [47.5, 31.5], eN: P = [46.5, 46.5], wN: P = [52.5, 39];
  const sF: P = [63.5, 30.5], eF: P = [65.5, 45.5], wF: P = [57.5, 38.5];
  const hipS: P = [55.5, 52], knS: P = [55.8, 68.5], anS: P = [56.4, 83.5];
  const hipN: P = [52, 53], knN: P = [37.5, 49.8], anN: P = [40.5, 66.5];
  const hemS = lerp(knS, anS, 0.34), hemN = lerp(knN, anN, 0.3);
  const pelvis = poly([[46.8, 45.5], [64, 45], [65.4, 54], [62, 58.5], [48, 58.5], [45.2, 53.5]]);

  const legs: Part[] = [
    { d: limb(lerp(knS, anS, 0.3), anS, 3.7, 3.1), f: r.acc, sh: shade(lerp(knS, anS, 0.3), anS, 3.7, 3.1), ln: edge(lerp(knS, anS, 0.5), anS, 3.7, 3.1, -1, 0, 0.6), lc: "#e8eefc", lw: 0.7 },
    ...shoe(anS, [-1, 0]),
    // 축발 바지: 골반 + 허벅지 + 정강이 위쪽까지 한 실루엣
    {
      d: pelvis + limb(hipS, knS, 6, 4.5) + limb(knS, hemS, 4.5, 4.7),
      f: WHITE,
      ns: true,
      sh: shade(hipS, knS, 6, 4.5, 0.1) + shade(knS, hemS, 4.5, 4.7, 0.1),
    },
    { d: "", o: false, ln: edge(hipS, knS, 6, 4.5, 1, 0.3, 1) + " " + edge(knS, hemS, 4.5, 4.7, 1, 0, 0.9), lc: NAVY, lw: 0.75 },
    { d: "", o: false, ln: `M${pp([hemS[0] - 4.6, hemS[1] + 0.2])} Q${pp([hemS[0], hemS[1] + 1.5])} ${pp([hemS[0] + 4.7, hemS[1] + 0.3])} M${pp([knS[0] - 3, knS[1] - 0.5])} Q${pp([knS[0] - 0.5, knS[1] + 1.2])} ${pp([knS[0] + 1, knS[1] - 0.2])}`, lc: OL, lw: 0.6 },
    // 든 다리: 발목 → 정강이 → 무릎(벨트 높이) → 허벅지(거의 수평) → 골반
    { d: limb(lerp(knN, anN, 0.35), anN, 3.5, 3), f: r.acc, sh: shade(lerp(knN, anN, 0.35), anN, 3.5, 3), ln: edge(lerp(knN, anN, 0.55), anN, 3.5, 3, 1, 0, 0.5), lc: "#e8eefc", lw: 0.7 },
    ...shoe(anN, [-0.8, 0.6], 0.95),
    {
      d: limb(hipN, knN, 5.9, 4.4) + limb(knN, hemN, 4.4, 4.6),
      f: WHITE,
      ns: true,
      sh: shade(hipN, knN, 5.9, 4.4, 0.1) + shade(knN, hemN, 4.4, 4.6, 0.1),
    },
    // 든 허벅지 아랫선(다리 사이 경계) + 무릎 주름 + 밑단
    { d: "", o: false, ln: edge(hipN, knN, 5.9, 4.4, -1, 0.05, 1) + " " + edge(knN, hemN, 4.4, 4.6, -1, 0, 0.9), lc: OL, lw: 0.9 },
    { d: "", o: false, ln: edge(hipN, knN, 5.9, 4.4, 1, 0.2, 1) + " " + edge(knN, hemN, 4.4, 4.6, 1, 0, 0.9), lc: NAVY, lw: 0.75 },
    { d: "", o: false, ln: `M${pp([hemN[0] - 4.5, hemN[1] - 0.6])} Q${pp([hemN[0] + 0.3, hemN[1] + 1.2])} ${pp([hemN[0] + 4.5, hemN[1] + 0.2])}`, lc: OL, lw: 0.6 },
  ];
  const upper: Part[] = [
    // 먼 쪽 팔 (몸통 뒤에서 팔꿈치만 밖으로)
    { d: limb(sF, eF, 3.4, 3.1), f: NAVY, sh: shade(sF, eF, 3.4, 3.1) },
    { d: limb(sF, lerp(sF, eF, 0.62), 4.3, 3.9), f: WHITE, sh: shade(sF, eF, 4.3, 3.9), ln: cross(sF, eF, 4.3, 3.9, 0.62), lc: r.acc, lw: 1.3 },
    // 목
    { d: limb([53.5, 21], [54.5, 29.5], 3.4, 3.6), f: SKIN, sh: "M54.4,19 L60,19 L60,32 L55.6,32 Z", ln: "M51.8,25 Q53.6,28 55.4,29.4" },
    // 상의: 어깨 → 허리로 좁아지는 몸통
    {
      d: "M45.6,31 Q46,27.6 51,27 L57.5,26.8 Q64,27 65.8,31 Q66.8,38 64,45.5 L62.6,46.8 L47.4,47.2 Q46,39 45.6,31 Z",
      f: WHITE,
      sh: "M60.5,26 Q64.5,38 61.5,48 L70,48 L70,26 Z",
      ln: "M55.3,33 Q54.6,40 54.8,46.6 M58,32.6 Q57.4,40 57.6,46.6 M62.3,38 Q61.6,42 62.2,45",
      lc: NAVY,
      lw: 0.7,
    },
    { d: "M50.3,27.4 Q54.3,33.6 59.5,27.2 L60.6,28.8 Q54.6,36.4 49.4,29 Z", f: NAVY, o: false },
    buttons([[56, 39], [55.9, 42.8]]),
    { d: poly([[47, 45.2], [63.4, 44.7], [63.6, 48.9], [47.4, 49.5]]), f: BELT, ln: "M52.4,45.5 h3.4 v3.3 h-3.4 z", lc: "#9aa4b5", lw: 0.7 },
    // 먼 쪽 아래팔 → 글러브 뒤로
    { d: limb(eF, wF, 3, 2.7), f: NAVY, sh: shade(eF, wF, 3, 2.7) },
    // 가까운 쪽 팔
    { d: limb(sN, eN, 3.5, 3.2), f: NAVY, sh: shade(sN, eN, 3.5, 3.2) },
    { d: limb(sN, lerp(sN, eN, 0.62), 4.4, 4), f: WHITE, sh: shade(sN, eN, 4.4, 4), ln: cross(sN, eN, 4.4, 4, 0.62), lc: r.acc, lw: 1.3 },
    { d: limb(eN, wN, 3.1, 2.8), f: NAVY, sh: shade(eN, wN, 3.1, 2.8) },
  ];
  const gl = glove([54.4, 37.6], 0.6, -8, r);
  return (
    <g transform="translate(-5.4 -4.9) scale(1.1)">
      <ellipse cx={51} cy={89.6} rx={19} ry={2.1} fill={OL} opacity={0.35} />
      <Figure id="gc2-sp-b" parts={[...legs, ...upper]} />
      <Figure id="gc2-sp-g" parts={gl} />
      <Head id="gc2-sp-h" x={52.5} y={17.5} s={0.8} rot={-1} gear="cap" r={r} />
    </g>
  );
}

/** 구원: 세트 포지션 — 3/4로 튼 몸, 어깨너비 스탠스에 무릎을 살짝 굽혀 뒷발에 체중, 두 손은 벨트 앞 글러브에 */
function RelieverArt({ r }: { r: Role }) {
  const sN: P = [46, 31.5], eN: P = [44.8, 46.5], wN: P = [50.5, 42.2];
  const sF: P = [65.5, 31], eF: P = [67.5, 45.5], wF: P = [58, 41.5];
  const hipB: P = [58.5, 52], knB: P = [58, 68.5], anB: P = [62.5, 84];
  const hipF: P = [52, 52.5], knF: P = [45, 68.5], anF: P = [40.5, 84.5];
  const hemB = lerp(knB, anB, 0.34), hemF = lerp(knF, anF, 0.34);
  const pelvis = poly([[47, 45.5], [64.6, 45], [66.4, 54], [63.6, 59], [49.5, 59], [46, 53.5]]);

  const legs: Part[] = [
    // 뒷다리(체중)
    { d: limb(lerp(knB, anB, 0.3), anB, 3.7, 3.1), f: r.acc, sh: shade(lerp(knB, anB, 0.3), anB, 3.7, 3.1), ln: edge(lerp(knB, anB, 0.5), anB, 3.7, 3.1, -1, 0, 0.6), lc: "#eafbf0", lw: 0.7 },
    ...shoe(anB, [-1, 0], 0.92),
    {
      d: pelvis + limb(hipB, knB, 6, 4.6) + limb(knB, hemB, 4.6, 4.8),
      f: WHITE,
      ns: true,
      sh: shade(hipB, knB, 6, 4.6, 0.1) + shade(knB, hemB, 4.6, 4.8, 0.1),
    },
    { d: "", o: false, ln: edge(hipB, knB, 6, 4.6, 1, 0.3, 1) + " " + edge(knB, hemB, 4.6, 4.8, 1, 0, 0.9), lc: NAVY, lw: 0.75 },
    { d: "", o: false, ln: `M${pp([hemB[0] - 4.7, hemB[1] + 0.1])} Q${pp([hemB[0], hemB[1] + 1.5])} ${pp([hemB[0] + 4.8, hemB[1] + 0.2])} M${pp([knB[0] - 3, knB[1] - 0.3])} Q${pp([knB[0] - 0.5, knB[1] + 1.2])} ${pp([knB[0] + 1.2, knB[1] - 0.1])}`, lc: OL, lw: 0.6 },
    // 앞다리
    { d: limb(lerp(knF, anF, 0.3), anF, 3.6, 3.1), f: r.acc, sh: shade(lerp(knF, anF, 0.3), anF, 3.6, 3.1), ln: edge(lerp(knF, anF, 0.5), anF, 3.6, 3.1, -1, 0, 0.6), lc: "#eafbf0", lw: 0.7 },
    ...shoe(anF, [-1, 0]),
    {
      d: limb(hipF, knF, 6, 4.5) + limb(knF, hemF, 4.5, 4.7),
      f: WHITE,
      ns: true,
      sh: shade(hipF, knF, 6, 4.5, 0.1) + shade(knF, hemF, 4.5, 4.7, 0.1),
    },
    { d: "", o: false, ln: edge(hipF, knF, 6, 4.5, 1, 0.05, 1) + " " + edge(knF, hemF, 4.5, 4.7, 1, 0, 0.9), lc: OL, lw: 0.9 },
    { d: "", o: false, ln: edge(hipF, knF, 6, 4.5, -1, 0.2, 1) + " " + edge(knF, hemF, 4.5, 4.7, -1, 0, 0.9), lc: NAVY, lw: 0.75 },
    { d: "", o: false, ln: `M${pp([hemF[0] - 4.6, hemF[1] - 0.2])} Q${pp([hemF[0], hemF[1] + 1.4])} ${pp([hemF[0] + 4.7, hemF[1] + 0.2])} M${pp([knF[0] - 3, knF[1] - 0.3])} Q${pp([knF[0] - 0.5, knF[1] + 1.2])} ${pp([knF[0] + 1.2, knF[1] - 0.1])}`, lc: OL, lw: 0.6 },
  ];
  const upper: Part[] = [
    { d: limb(sF, eF, 3.5, 3.2), f: NAVY, sh: shade(sF, eF, 3.5, 3.2) },
    { d: limb(sF, lerp(sF, eF, 0.62), 4.4, 4), f: WHITE, sh: shade(sF, eF, 4.4, 4), ln: cross(sF, eF, 4.4, 4, 0.62), lc: r.acc, lw: 1.3 },
    { d: limb([52.5, 21], [54.5, 30], 3.4, 3.7), f: SKIN, sh: "M54.4,19 L60,19 L60,33 L56,33 Z", ln: "M51.8,25 Q53.6,28 55.4,29.6" },
    {
      d: "M45.4,32 Q45.8,28 50.5,27.4 L59,27 Q65.8,27.4 66.6,32 Q68,39 64.8,46 L63.6,47.2 L47.6,47.6 Q46,40 45.4,32 Z",
      f: WHITE,
      sh: "M61.5,26 Q65.5,38 62.5,48 L72,48 L72,26 Z",
      ln: "M55.3,33 Q54.6,40 54.8,47 M58.2,32.8 Q57.6,40 57.8,47 M63,38 Q62.4,42 63,45",
      lc: NAVY,
      lw: 0.7,
    },
    { d: "M50,27.6 Q54.6,34 60,27.4 L61.2,29 Q54.8,37 49,29.2 Z", f: NAVY, o: false },
    buttons([[56.4, 39], [56.3, 43]]),
    logo("M46.5,39 q2.8,-3.2 5.6,-1 t4.4,-0.4", r),
    { d: poly([[47, 45.6], [64.6, 45], [64.9, 49.2], [47.4, 49.9]]), f: BELT, ln: "M53,46.1 h3.4 v3.3 h-3.4 z", lc: "#9aa4b5", lw: 0.7 },
    { d: limb(eF, wF, 3.1, 2.8), f: NAVY, sh: shade(eF, wF, 3.1, 2.8) },
    { d: limb(sN, eN, 3.6, 3.3), f: NAVY, sh: shade(sN, eN, 3.6, 3.3) },
    { d: limb(sN, lerp(sN, eN, 0.62), 4.5, 4.1), f: WHITE, sh: shade(sN, eN, 4.5, 4.1), ln: cross(sN, eN, 4.5, 4.1, 0.62), lc: r.acc, lw: 1.3 },
    { d: limb(eN, wN, 3.2, 2.9), f: NAVY, sh: shade(eN, wN, 3.2, 2.9) },
  ];
  const gl = glove([52.5, 42.6], 0.62, -4, r);
  return (
    <g transform="translate(-5.4 -4.9) scale(1.1)">
      <ellipse cx={52} cy={89.8} rx={22} ry={2.1} fill={OL} opacity={0.35} />
      <Figure id="gc2-rp-b" parts={[...legs, ...upper]} />
      <Figure id="gc2-rp-g" parts={gl} />
      <Head id="gc2-rp-h" x={50.5} y={18} s={0.8} rot={2} gear="cap" r={r} />
    </g>
  );
}

/** 마무리: 릴리스 직후 — 크게 내딛고 상체를 쏟으며 팔을 앞으로 뻗음, 불붙은 공 */
function CloserArt({ r }: { r: Role }) {
  const parts: Part[] = [
    // 다리: 앞다리 크게 내딛고 뒷다리 뒤로 뻗음
    {
      d: "M52.5,72 L74,66 Q84,80 97,100 L90,110 Q80,93 68,85 L57,88 L45,110 L28,110 L38.5,90 Q44,80 52.5,72 Z",
      f: WHITE,
      sh: "M60,64 L86,64 L100,100 L90,112 L66,84 L56,86 Z",
      ln: "M53,74.5 Q44,86 36,104 M73,68.5 Q83,82 93,98",
      lc: NAVY,
      lw: 0.9,
    },
    // 목 (앞으로 기움)
    { d: "M44.5,34.5 L53,31 L58,40.5 Q52,44.5 45.5,42 Z", f: SKIN, sh: "M51,30 L61,30 L61,45 L54,45 Z", ln: "M47,36 Q50.5,39 54,41.6" },
    // 상의 (대각선으로 기운 몸통)
    {
      d: "M38,47 Q48,38.5 60,37.5 Q67,38 70,42 Q75,54 73.5,66 L52.5,72.5 Q43,62 38,47 Z",
      f: WHITE,
      sh: "M60,36 Q70,52 63,73 L82,73 L82,36 Z",
      ln: "M49.5,42.8 Q53.5,58 58.8,70.4 M52.6,42 Q56.5,57 61.8,69.6 M42.5,52 Q46,55 49.5,54.2",
      lc: NAVY,
      lw: 0.8,
    },
    { d: "M45,40.2 Q50.5,45 57,41.2 L57.8,42.8 Q50.5,48.5 44,42 Z", f: NAVY, o: false },
    buttons([[52.8, 51], [54.6, 57], [56.8, 63]]),
    { d: "M51.5,69.6 L72.8,63.6 L74,68.2 L53,74.4 Z", f: BELT, ln: "M55,68.8 l3.3,-0.95 l1,3.2 l-3.3,0.95 z", lc: "#9aa4b5", lw: 0.7 },
    // 글러브 팔 (배 쪽으로 당김)
    { d: "M36.5,46 Q33,49.5 32.5,55.5 L40.5,57 Q41.5,52 44,49 Z", f: WHITE, sh: "M30,53 L46,53 L46,58 L30,58 Z", ln: "M32.6,55.4 L40.5,57", lc: r.acc, lw: 1.2 },
    { d: "M33,55 L40.5,56.8 Q40,62 37,65.5 Q32.5,65 31.5,60.5 Z", f: NAVY, sh: "M30,61 L44,61 L44,68 L30,68 Z" },
    {
      d: "M38,68 C35,61 38,55 44,54.5 C50,54 53,58 52.5,63 C52,68 48,71 42.5,71 Z",
      f: LEATHER,
      sh: "M54,56 Q49,66 38,68 L38,74 L56,74 Z",
      ln: "M41,58.5 Q46,57 50.5,59 M39.5,62.5 Q46,61 52,63.2 M40.5,66.5 Q46,65.8 50.5,67.2 M38.5,59 L41.5,55.6",
      lc: LEATHER_D,
      lw: 0.6,
    },
    // 던진 팔: 어깨 → 앞으로 쭉 뻗음
    { d: "M56.5,39.5 Q64,38 68.5,42.5 L64,51 Q59.5,50.5 56,48.5 Z", f: WHITE, sh: "M62,37 L72,37 L68,53 L60,53 Z", ln: "M68.4,42.6 L64.1,50.8", lc: r.acc, lw: 1.2 },
    { d: "M58.5,43.5 L45,44.5 Q41.5,48.5 45,52 L59.5,51 Z", f: NAVY, sh: "M40,49.5 L62,48.5 L62,54 L40,54 Z" },
    { d: "M46.5,44.5 Q40,43.5 32.5,42.5 L31.5,48.8 Q39,50.5 46.5,52 Z", f: NAVY, sh: "M30,47.5 L48,49 L48,54 L30,54 Z" },
    {
      d: "M33.5,42.2 Q28.5,41 24,42 Q22.4,43.6 24,44.8 L28.4,45.3 Q26.8,47.6 28.8,49.2 L33.5,49 Z",
      f: SKIN,
      sh: "M22,46 L35,46.5 L35,51 L22,51 Z",
      ln: "M24.4,43.4 L29.6,43.6 M28.8,45.4 L31.8,45.6",
    },
  ];
  return (
    <g>
      {/* 불붙은 공의 궤적 */}
      <path d="M13,38.5 Q26,34.5 40,33 Q31,39.5 42,45.5 Q30,48 13,47.5 Z" fill={r.acc} />
      <path d="M14,40.5 Q24,38 33,37.2 Q27,41.5 34,44.6 Q24,46 14,45.5 Z" fill={r.hot} />
      <Figure id="gc2-cp-b" parts={parts} />
      <Head id="gc2-cp-h" x={48} y={31} s={0.95} rot={-12} gear="cap" r={r} fierce />
      <Figure id="gc2-cp-ball" parts={[ball(14.5, 43, 3.2)]} />
    </g>
  );
}

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
