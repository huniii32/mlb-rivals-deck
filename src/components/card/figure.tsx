import type { Kind } from "../../lib/engine";
import { PAIR, f1, xf, type P } from "./geom";

export const OL = "#0a0d18"; // 잉크 외곽선
export const SKIN = "#e0aa80";
export const WHITE = "#f4f2ec";
export const NAVY = "#16223f";
const NAVY_L = "#3a5288";
export const BELT = "#17171d";
export const LEATHER = "#6a4226";
export const LEATHER_D = "#3a2212";
export const WOOD = "#d8a864";
export const FONT = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";

export type Variant = "bat" | "sp" | "rp" | "cp";
export type Role = { acc: string; accD: string; hot: string };
export const ROLE: Record<Variant, Role> = {
  bat: { acc: "#f2a516", accD: "#a86306", hot: "#fde68a" },
  sp: { acc: "#2f74e8", accD: "#1a3f99", hot: "#bfdbfe" },
  rp: { acc: "#22a55a", accD: "#136b38", hot: "#bbf7d0" },
  cp: { acc: "#e0322c", accD: "#8e1512", hot: "#fed7aa" },
};

export function variantOf(kind: Kind, pos?: string): Variant {
  if (kind === "batter") return "bat";
  const p = (pos ?? "").toUpperCase();
  return p.startsWith("RP") ? "rp" : p.startsWith("CP") ? "cp" : "sp";
}

// ── 그리기 시스템 ──
// 파트 = 채운 면. 1패스: 모든 파트를 굵은 잉크로 깔아 바깥 실루엣만 두껍게,
// 2패스: 면 + 가는 내부선 → 선 굵기가 자연스럽게 달라진다.
export type Part = {
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

export function Figure({ id, parts }: { id: string; parts: Part[] }) {
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

// ── 머리 (왼쪽을 봄, 모자/헬멧 챙 그늘이 눈을 가림) ──
export function Head({ id, x, y, s, rot = 0, gear, r, fierce }: {
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
export const buttons = (pts: [number, number][]): Part => ({
  d: "",
  o: false,
  ln: pts.map(([x, y]) => `M${x},${y} h0.01`).join(" "),
  lc: NAVY,
  lw: 1.3,
});
export const logo = (d: string, r: Role): Part => ({ d: "", o: false, ln: d, lc: r.acc, lw: 1.5 });
export const ball = (x: number, y: number, rad: number): Part => ({
  d: `M${x - rad},${y} a${rad},${rad} 0 1,0 ${2 * rad},0 a${rad},${rad} 0 1,0 ${-2 * rad},0`,
  f: "#fbfbf8",
  sh: `M${x - rad},${y + rad * 0.2} Q${x},${y + rad * 0.9} ${x + rad},${y - rad * 0.3} L${x + rad},${y + rad} L${x - rad},${y + rad} Z`,
  ln: `M${x - rad * 0.45},${y - rad * 0.85} Q${x + rad * 0.1},${y} ${x - rad * 0.45},${y + rad * 0.85} M${x + rad * 0.5},${y - rad * 0.8} Q${x},${y} ${x + rad * 0.5},${y + rad * 0.8}`,
  lc: "#d11f1f",
  lw: 0.5,
});

const SHOE = "#222a40";
/** 스파이크 신발: 발목 an, e=발끝 방향 단위벡터 (아래쪽이 밑창) */
export function shoe(an: P, e: P, s = 1): Part[] {
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
export function glove(at: P, s: number, rot: number, r: Role): Part[] {
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
