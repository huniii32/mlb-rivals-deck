import { BELT, LEATHER, LEATHER_D, NAVY, OL, SKIN, WHITE, WOOD, Figure, Head, ball, buttons, glove, logo, shoe, type Part, type Role } from "./figure";
import { cross, edge, lerp, limb, poly, pp, shade, type P } from "./geom";
import type { GradeTheme } from "./theme";

/** 타자: 팔로스루 — 몸통 회전, 배트는 어깨 너머 위로, 금빛 스윙 궤적 */
export function BatterArt({ r, t }: { r: Role; t: GradeTheme }) {
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
/** 선발: 와인드업 밸런스 포인트 — 축발 위에 상체를 세우고 무릎을 벨트 높이로 들어 올림, 두 손은 가슴에 */
export function StarterArt({ r }: { r: Role }) {
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
export function RelieverArt({ r }: { r: Role }) {
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
export function CloserArt({ r }: { r: Role }) {
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
