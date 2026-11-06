/** 게임의 선택 연대 효과. 나머지 연도 조건(680)은 기존 규칙을 유지한다. */
export const DECADE_TARGET_ROWS: Record<number, number> = { 615: 33, 645: 35 };

export function decadeTarget(flags: Record<string, boolean>, row: number): "batter" | "pitcher" | null {
  const left = !!flags[`${row}-spec-L`];
  const right = !!flags[`${row}-spec-R`];
  // 이전 저장본의 미선택, 잘못된 양쪽 선택은 대상 확정 전까지 적용하지 않는다.
  return left === right ? null : left ? "batter" : "pitcher";
}
