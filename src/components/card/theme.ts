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
