// ── 뼈대 기반 그리기 (선발/구원) ──
// 관절 좌표(P)를 먼저 데이터로 정하고, 팔다리·바지·양말·신발을 전부 그 관절에서 파생시킨다.
// → 조각들이 같은 끝점을 공유해 어긋날 수 없고, 바지는 골반에서 시작하는 하나의 실루엣(ns=면만, 외곽은 Figure의 굵은 잉크 패스)이다.
export const f1 = (n: number) => n.toFixed(1);

export type P = [number, number];
export const pp = (p: P) => `${f1(p[0])},${f1(p[1])}`;
export const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const PAIR = /(-?\d*\.?\d+),(-?\d*\.?\d+)/g;

function nrm(a: P, b: P): P {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [-dy / L, dx / L];
}
/** 관절 a→b를 잇는 끝이 둥근 테이퍼 캡슐 (양 끝 반지름 wa, wb) */
export function limb(a: P, b: P, wa: number, wb: number): string {
  const [nx, ny] = nrm(a, b);
  const at = (p: P, w: number, s: number): P => [p[0] + nx * w * s, p[1] + ny * w * s];
  return `M${pp(at(a, wa, 1))} L${pp(at(b, wb, 1))} A${f1(wb)},${f1(wb)} 0 0 0 ${pp(at(b, wb, -1))} L${pp(at(a, wa, -1))} A${f1(wa)},${f1(wa)} 0 0 0 ${pp(at(a, wa, 1))} Z`;
}
/** limb와 같은 감김 방향의 다각형 (nonzero 합집합용) */
export function poly(pts: P[]): string {
  let A = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; });
  const o = A > 0 ? [...pts].reverse() : pts;
  return `M${o.map(pp).join(" L")}Z`;
}
/** 빛(왼쪽 위) 반대쪽 = 오른쪽/아래쪽 그림자 면 */
export function shade(a: P, b: P, wa: number, wb: number, k = 0.15): string {
  const [nx, ny] = nrm(a, b);
  const s = nx * 0.55 + ny * 0.85 >= 0 ? 1 : -1;
  const q = (p: P, w: number): P => [p[0] + nx * w * s, p[1] + ny * w * s];
  return poly([q(a, wa * k), q(b, wb * k), q(b, wb * 3), q(a, wa * 3)]);
}
/** 팔 위 t 지점을 가로지르는 짧은 선 (소매 끝 파이핑) */
export function cross(a: P, b: P, wa: number, wb: number, t: number): string {
  const [nx, ny] = nrm(a, b), c = lerp(a, b, t), w = wa + (wb - wa) * t;
  return `M${pp([c[0] + nx * w, c[1] + ny * w])} L${pp([c[0] - nx * w, c[1] - ny * w])}`;
}
/** limb의 한쪽 모서리선 (s=±1, 구간 t0~t1) */
export function edge(a: P, b: P, wa: number, wb: number, s: number, t0 = 0, t1 = 1): string {
  const [nx, ny] = nrm(a, b);
  const at = (t: number): P => {
    const c = lerp(a, b, t), w = wa + (wb - wa) * t;
    return [c[0] + nx * w * s, c[1] + ny * w * s];
  };
  return `M${pp(at(t0))} L${pp(at(t1))}`;
}
/** 경로 문자열의 "x,y" 쌍을 (원점 o 기준) 배율·회전 후 at으로 옮김 */
export function xf(d: string, o: P, s: number, rot: number, at: P): string {
  const c = Math.cos((rot * Math.PI) / 180), n = Math.sin((rot * Math.PI) / 180);
  return d.replace(PAIR, (_, x, y) => {
    const u = (+x - o[0]) * s, v = (+y - o[1]) * s;
    return `${f1(at[0] + u * c - v * n)},${f1(at[1] + u * n + v * c)}`;
  });
}
