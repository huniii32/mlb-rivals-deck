import { FONT, OL, type Variant } from "./figure";
import { f1 } from "./geom";
import type { GradeTheme } from "./theme";

/** 공용 해칭 패턴 + 테마별 배경/비네팅 그라데이션 (id에 테마 key) */
export function Defs({ t }: { t: GradeTheme }) {
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
      const d = bolt(-2, 22, 40, 0.5, 11) + bolt(102, 30, 38, 2.5, 23) + bolt(90, 112, 40, -1.9, 37);
      over.push([d, t.s2, 0.4, 4]);
      over.push([d, t.s3, 1, 1.3]);
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

export function Backdrop({ v, t }: { v: Variant; t: GradeTheme }) {
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
export function Wordmark({ team, v, t }: { team?: string; v: Variant; t: GradeTheme }) {
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
