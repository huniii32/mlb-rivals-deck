import type { Grade, LineupSlot, ScoreWeights } from "../types";

export const GRADES: Grade[] = [
  "HOF",
  "블랙시그니처",
  "시그니처",
  "모먼트",
  "프라임",
  "임팩트",
  "WBC시그니처",
  "WBC프라임",
  "S",
  "A",
  "B",
  "C",
];

// 기본 등급 점수: 실제 게임 덱스코어 공식이 공개돼있지 않아 임의 가중치.
// 설정 탭에서 직접 조정 가능하다는 전제로 둔다.
export const DEFAULT_WEIGHTS: ScoreWeights = {
  gradeScores: {
    HOF: 100,
    블랙시그니처: 95,
    시그니처: 88,
    모먼트: 80,
    프라임: 74,
    임팩트: 68,
    WBC시그니처: 86,
    WBC프라임: 72,
    S: 60,
    A: 45,
    B: 30,
    C: 15,
  },
  overallWeight: 1.0,
  synergyPerCount: 3,
  synergyMax: 30,
};

export const POSITIONS = [
  "SP",
  "RP",
  "CP",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

// 25인 로스터: 선발 5 + 불펜 4 + 야수 9 + 지명 1 + 벤치 6
export function defaultSlots(): LineupSlot[] {
  const slots: LineupSlot[] = [];
  const push = (label: string, allowed: string[]) =>
    slots.push({
      slotId: `${label}-${slots.length}`,
      label,
      allowedPositions: allowed,
      playerId: null,
    });
  ["SP1", "SP2", "SP3", "SP4", "SP5"].forEach((l) => push(l, ["SP"]));
  ["RP1", "RP2", "RP3", "CP"].forEach((l) => push(l, ["RP", "CP", "SP"]));
  (
    [
      ["C", ["C"]],
      ["1B", ["1B"]],
      ["2B", ["2B"]],
      ["3B", ["3B"]],
      ["SS", ["SS"]],
      ["LF", ["LF"]],
      ["CF", ["CF"]],
      ["RF", ["RF"]],
      ["DH", ["DH", "1B", "LF", "RF", "CF", "3B", "2B", "SS", "C"]],
    ] as [string, string[]][]
  ).forEach(([l, a]) => push(l, a));
  for (let i = 1; i <= 7; i++) push(`BENCH${i}`, POSITIONS);
  return slots;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
