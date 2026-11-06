import type { Chem, Kind, PlayerInput } from "./engine";
import { migrateSkillName } from "./engine";
import { BULLPEN_ROLES, BULLPEN_ROWS, MAX_BULLPEN, ROLE_LIMITS, bullpenCounts, bullpenRole, normalizeTactics } from "./bullpen";
import type { BullpenRole, BullpenTactics } from "./bullpen";

export interface Deck {
  id: string;
  name: string;
  updatedAt: number;
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
  bullpenTactics?: BullpenTactics;
}

// 기본 라인업 18칸(타자9+선발5+불펜4). 추가 불펜은 첫 14명 뒤에 확장한다.
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
export const MAX_PLAYERS = 14 + MAX_BULLPEN;

export const DEFAULT_CHEM: Chem = {
  comebackFlag: "X", lockdown: "X",
  commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1",
};

export { YEAR_ANCHOR } from "./deckScoreTargets";

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

const STAT_ARRAYS = ["base", "train", "spec", "extra", "synergy", "locker", "blackPos", "blackBoost", "leaderBonus", "finalOv"] as const;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const statValue = (v: unknown) => v === "" || (typeof v === "number" && Number.isFinite(v));

/** 구버전에서 생략된 입력칸을 채운다. 2칸 투수 스탯과 3칸 스킬도 현재 길이로 보완한다. */
export const normalizePlayer = (p: PlayerInput): PlayerInput => ({
  ...blankPlayer(p.excelRow, p.kind, p.pos, p.order ?? ""),
  ...p,
  enName: p.enName ?? "", photoUrl: p.photoUrl ?? "", team: p.team ?? "",
  ...Object.fromEntries(STAT_ARRAYS.map(key => [key, Array.from({ length: 3 }, (_, i) => p[key]?.[i] ?? "")])),
  skills: Array.from({ length: 4 }, (_, i) => migrateSkillName(p.kind, p.skills?.[i] ?? "")) as PlayerInput["skills"],
});

export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** 기존 18명 덱과 불펜 0~7명의 확장 덱을 모두 읽는다. */
export function isDeck(d: unknown): d is Deck {
  if (!record(d)) return false;
  for (const key of ["id", "name"]) if (d[key] !== undefined && typeof d[key] !== "string") return false;
  if (d.updatedAt !== undefined && (typeof d.updatedAt !== "number" || !Number.isFinite(d.updatedAt))) return false;
  for (const key of ["chem", "flags", "yearInputs"]) if (d[key] !== undefined && !record(d[key])) return false;
  if (d.chem && !Object.values(d.chem).every(v => typeof v === "string")) return false;
  if (d.flags && !Object.values(d.flags).every(v => typeof v === "boolean")) return false;
  if (d.yearInputs && !Object.values(d.yearInputs).every(statValue)) return false;
  if (d.bullpenTactics !== undefined) {
    if (!record(d.bullpenTactics)) return false;
    const t = d.bullpenTactics;
    if (t.winning !== undefined && !["basic", "aggressive", "division"].includes(String(t.winning))) return false;
    if (t.chasing !== undefined && !["basic", "aggressive"].includes(String(t.chasing))) return false;
  }
  const players = d.players;
  if (!Array.isArray(players) || players.length < 14 || players.length > MAX_PLAYERS) return false;
  if (!players.every((p) => p && typeof p.name === "string" && typeof p.pos === "string" && Number.isInteger(p.excelRow))) return false;
  if (!players.every(p => {
    for (const key of ["card", "team", "photoUrl", "enName"]) if (p[key] !== undefined && typeof p[key] !== "string") return false;
    for (const key of ["year", "order", "transLv", "enhLv", "pohLv"]) if (p[key] !== undefined && !statValue(p[key])) return false;
    for (const key of STAT_ARRAYS) if (p[key] !== undefined && (!Array.isArray(p[key]) || p[key].length > 3 || !p[key].every(statValue))) return false;
    if (p.skills !== undefined && (!Array.isArray(p.skills) || p.skills.length > 4 || !p.skills.every((v: unknown) => typeof v === "string"))) return false;
    return p.bullpenRole === undefined || BULLPEN_ROLES.includes(p.bullpenRole);
  })) return false;
  if (!LINEUP.slice(0, 14).every((l, i) => players[i].excelRow === l.row && players[i].kind === l.kind)) return false;
  if (!players.slice(14).every((p) => p.kind === "pitcher" && BULLPEN_ROWS.includes(p.excelRow))) return false;
  if (new Set(players.map((p) => p.excelRow)).size !== players.length) return false;
  const counts = bullpenCounts(players);
  return BULLPEN_ROLES.every((r) => counts[r] <= ROLE_LIMITS[r]);
}

export function normalizeRoster(players: PlayerInput[]): PlayerInput[] {
  let rp = 0, cp = 0;
  return players.map((raw) => {
    const p = normalizePlayer(raw);
    const role = bullpenRole(p);
    return role ? { ...p, bullpenRole: role, pos: role === "closer" ? `CP${++cp}` : `RP${++rp}` } : p;
  });
}

export function normalizeDeck(d: Deck): Deck {
  return { ...d, id: d.id ?? newId(), name: d.name ?? "가져온 덱", updatedAt: d.updatedAt ?? Date.now(), flags: d.flags ?? {}, yearInputs: d.yearInputs ?? {}, chem: { ...DEFAULT_CHEM, ...d.chem }, players: normalizeRoster(d.players), bullpenTactics: normalizeTactics(d.bullpenTactics) };
}

/** 역할별 배치 수 변경. 감소 시 빈 슬롯부터 제거하고, 선수 삭제 확인은 호출자가 담당한다. */
export function resizeBullpen(players: PlayerInput[], role: BullpenRole, count: number): PlayerInput[] {
  const counts = bullpenCounts(players);
  const total = players.length - 14 - counts[role] + count;
  if (!Number.isInteger(count) || count < 0 || count > ROLE_LIMITS[role] || total > MAX_BULLPEN) return players;
  const members = players.filter((p) => bullpenRole(p) === role);
  if (count < members.length) {
    const removable = [...members.filter((p) => !p.name.trim()), ...members.filter((p) => p.name.trim()).reverse()];
    const removed = new Set(removable.slice(0, members.length - count).map((p) => p.excelRow));
    return normalizeRoster(players.filter((p) => !removed.has(p.excelRow)));
  }
  const next = [...players];
  for (let i = members.length; i < count; i++) {
    const row = BULLPEN_ROWS.find((r) => !next.some((p) => p.excelRow === r))!;
    next.push({ ...blankPlayer(row, "pitcher", role === "closer" ? "CP1" : "RP1", ""), bullpenRole: role });
  }
  return normalizeRoster(next);
}
