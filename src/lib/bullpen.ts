import type { PlayerInput } from "./engine";

export const BULLPEN_ROLES = ["winning", "chasing", "long", "closer"] as const;
export type BullpenRole = typeof BULLPEN_ROLES[number];
export type WinningTactic = "basic" | "aggressive" | "division";
export interface BullpenTactics { winning: WinningTactic; chasing: "basic" | "aggressive" }
export const DEFAULT_TACTICS: BullpenTactics = { winning: "basic", chasing: "basic" };
export const MAX_BULLPEN = 7;
export const BULLPEN_ROWS = [27, 28, 29, 30, 31, 32, 33];
export const ROLE_LABELS: Record<BullpenRole, string> = {
  winning: "승리조", chasing: "추격조", long: "롱릴리프", closer: "마무리",
};
export const ROLE_LIMITS: Record<BullpenRole, number> = { winning: 4, chasing: 4, long: 4, closer: 2 };
// 같은 역할의 추가 선수도 기존 엑셀의 해당 역할 덱코·포훈 규칙을 사용한다.
export const ROLE_PROFILES: Record<BullpenRole, { row: number; pos: string }> = {
  winning: { row: 27, pos: "RP1" }, chasing: { row: 28, pos: "RP2" },
  long: { row: 29, pos: "RP3" }, closer: { row: 30, pos: "CP1" },
};

export function bullpenRole(p: PlayerInput): BullpenRole | null {
  if (p.kind !== "pitcher" || !BULLPEN_ROWS.includes(p.excelRow)) return null;
  if (BULLPEN_ROLES.includes(p.bullpenRole as BullpenRole)) return p.bullpenRole!;
  if (p.pos.startsWith("CP") || p.excelRow === 30) return "closer";
  return p.excelRow === 28 ? "chasing" : p.excelRow === 29 ? "long" : "winning";
}

export function normalizeTactics(t?: Partial<BullpenTactics>): BullpenTactics {
  return {
    winning: t?.winning === "aggressive" || t?.winning === "division" ? t.winning : "basic",
    chasing: t?.chasing === "aggressive" ? "aggressive" : "basic",
  };
}

export function bullpenCounts(players: PlayerInput[], namedOnly = false): Record<BullpenRole, number> {
  const counts = { winning: 0, chasing: 0, long: 0, closer: 0 };
  for (const p of players) {
    const role = bullpenRole(p);
    if (role && (!namedOnly || p.name.trim())) counts[role]++;
  }
  return counts;
}

export function tacticStatus(players: PlayerInput[], tactics?: BullpenTactics) {
  const t = normalizeTactics(tactics);
  const counts = bullpenCounts(players, true);
  const winningRequired = t.winning === "division" ? 3 : t.winning === "aggressive" ? 2 : 0;
  const chasingRequired = t.chasing === "aggressive" ? 2 : 0;
  return {
    counts, winningRequired, chasingRequired,
    winningBonus: winningRequired && counts.winning >= winningRequired ? (t.winning === "division" ? 4 : 2) : 0,
    chasingBonus: chasingRequired && counts.chasing >= chasingRequired ? 2 : 0,
  };
}

export function tacticBonuses(players: PlayerInput[], tactics?: BullpenTactics): Record<number, number> {
  const s = tacticStatus(players, tactics);
  return Object.fromEntries(players.map((p) => {
    const role = bullpenRole(p);
    return [p.excelRow, !p.name.trim() ? 0 : role === "winning" ? s.winningBonus : role === "chasing" ? s.chasingBonus : 0];
  }));
}
