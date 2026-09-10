// 덱관리 핵심 타입. DB 없이 localStorage + 공유URL로 동작한다.

export type Grade =
  | "HOF"
  | "블랙시그니처"
  | "시그니처"
  | "모먼트"
  | "프라임"
  | "임팩트"
  | "S"
  | "A"
  | "B"
  | "C"
  | "WBC프라임"
  | "WBC시그니처";

export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
  grade: Grade;
  overall: number;
  level: number;
  note?: string;
}

export interface LineupSlot {
  slotId: string;
  label: string;
  allowedPositions: string[];
  playerId: string | null;
}

export interface ScoreWeights {
  gradeScores: Record<Grade, number>;
  overallWeight: number;
  synergyPerCount: number;
  synergyMax: number;
}
