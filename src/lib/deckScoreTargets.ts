export type DeckScoreRegion = "team" | "spec";
export type DeckScoreSide = "L" | "R";
type DecadeTarget = "batter" | "pitcher";

/** 연도 입력행은 기존 저장 파일/엑셀과 같은 키를 사용한다. */
export const YEAR_ANCHOR: Record<number, number> = { 615: 33, 645: 35, 680: 37 };
const DECADE_EFFECTS: Record<number, Record<DecadeTarget, string>> = {
  615: { batter: "정확·선구", pitcher: "변화" },
  645: { batter: "파워", pitcher: "구위" },
};
/** 게임의 선택 연대 효과. 나머지 연도 조건(680)은 기존 규칙을 유지한다. */
export const DECADE_TARGET_ROWS: Record<number, number> = Object.fromEntries(
  Object.keys(DECADE_EFFECTS).map(threshold => [threshold, YEAR_ANCHOR[Number(threshold)]]),
);

export function decadeTarget(flags: Record<string, boolean>, row: number): DecadeTarget | null {
  const left = !!flags[`${row}-spec-L`];
  const right = !!flags[`${row}-spec-R`];
  // 이전 저장본의 미선택, 잘못된 양쪽 선택은 대상 확정 전까지 적용하지 않는다.
  return left === right ? null : left ? "batter" : "pitcher";
}

/** 같은 행은 좌/우 택1. 선택한 쪽을 다시 누르면 둘 다 해제한다. */
export function selectDeckScoreSide(flags: Record<string, boolean>, region: DeckScoreRegion, row: number, side: DeckScoreSide) {
  const selected = !flags[`${row}-${region}-${side}`];
  return {
    ...flags,
    [`${row}-${region}-L`]: selected && side === "L",
    [`${row}-${region}-R`]: selected && side === "R",
  };
}

export function decadeStatus(threshold: number, target: DecadeTarget | null, year: number | "" | undefined): string {
  if (!target) return "대상 미선택 · 미적용 (기존 덱도 대상을 선택해주세요)";
  if (typeof year !== "number") return "기준 연도를 입력해주세요 · 미적용";
  return `${year}~${year + 9} ${target === "batter" ? "타자" : "투수"} · 평가 능력치 ${DECADE_EFFECTS[threshold][target]} +1`;
}
