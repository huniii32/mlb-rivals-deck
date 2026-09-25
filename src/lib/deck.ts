import type { Chem, Kind, PlayerInput } from "./engine";
import { migrateSkillName } from "./engine";

export interface Deck {
  id: string;
  name: string;
  updatedAt: number;
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
}

// 라인업 18칸: 엑셀 행 ↔ 포지션 라벨 ↔ 타순 (타자 9 + 투수 9). 이 순서가 players 배열 순서.
export const LINEUP: { row: number; pos: string; kind: Kind; order: number | "" }[] = [
  { row: 11, pos: "C", kind: "batter", order: 9 },
  { row: 12, pos: "1B", kind: "batter", order: 5 },
  { row: 13, pos: "2B", kind: "batter", order: 2 },
  { row: 14, pos: "3B", kind: "batter", order: 6 },
  { row: 15, pos: "SS", kind: "batter", order: 7 },
  { row: 16, pos: "LF", kind: "batter", order: 4 },
  { row: 17, pos: "CF", kind: "batter", order: 8 },
  { row: 18, pos: "RF", kind: "batter", order: 1 },
  { row: 19, pos: "DH", kind: "batter", order: 3 },
  { row: 22, pos: "SP1", kind: "pitcher", order: "" },
  { row: 23, pos: "SP2", kind: "pitcher", order: "" },
  { row: 24, pos: "SP3", kind: "pitcher", order: "" },
  { row: 25, pos: "SP4", kind: "pitcher", order: "" },
  { row: 26, pos: "SP5", kind: "pitcher", order: "" },
  { row: 27, pos: "RP1", kind: "pitcher", order: "" },
  { row: 28, pos: "RP2", kind: "pitcher", order: "" },
  { row: 29, pos: "RP3", kind: "pitcher", order: "" },
  { row: 30, pos: "CP1", kind: "pitcher", order: "" },
];
export const N_PLAYERS = LINEUP.length;

export const DEFAULT_CHEM: Chem = {
  commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1",
};

// 연도 입력행 -> 스덱코 임계값 행 옆에 표시 (규칙: 33→615, 35→645, 37→680)
export const YEAR_ANCHOR: Record<number, number> = { 615: 33, 645: 35, 680: 37 };

// skillB는 엔진이 무시하는 레거시 필드지만 호출부별 기존 값(앱 false / 엑셀 true)을 그대로 유지
export function blankPlayer(
  excelRow: number, kind: Kind, pos: string, order: number | "", skillB = false,
): PlayerInput {
  return {
    excelRow, kind, pos, order,
    card: "", name: "", team: "", year: "", enName: "", photoUrl: "",
    base: ["", "", ""], train: ["", "", ""], spec: ["", "", ""],
    transLv: "", enhLv: "", pohLv: "",
    extra: ["", "", ""],
    synergy: ["", "", ""],
    locker: ["", "", ""],
    blackPos: ["", "", ""],
    blackBoost: ["", "", ""],
    skillB,
    skills: ["", "", "", ""],
    finalOv: ["", "", ""],
  };
}

/** 저장/공유 덱의 옛 선수 데이터에 빠진 필드를 채우고 구 스킬명을 현행명으로 치환 */
export const normalizePlayer = (p: PlayerInput): PlayerInput => ({
  ...p,
  enName: p.enName ?? "",
  photoUrl: p.photoUrl ?? "",
  team: p.team ?? "",
  synergy: p.synergy ?? ["", "", ""],
  locker: p.locker ?? ["", "", ""],
  blackPos: p.blackPos ?? ["", "", ""],
  blackBoost: p.blackBoost ?? ["", "", ""],
  skills: (p.skills ?? ["", "", "", ""]).map((s) =>
    migrateSkillName(p.kind, s)) as [string, string, string, string],
});

export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** 덱 형식 검사: 선수 18명 배열이 있는지 */
export const isDeck = (d: unknown): d is Deck =>
  !!d && Array.isArray((d as Deck).players) && (d as Deck).players.length === N_PLAYERS;
