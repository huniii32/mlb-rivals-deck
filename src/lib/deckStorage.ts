import { flagDefaults } from "./engine";
import { isDeck, normalizeDeck, type Deck } from "./deck";

/** 유효한 덱만 복원한다. 손상 여부는 호출자에게 돌려주어 덮어쓰기 전에 원본을 보존한다. */
export function readStoredDecks(raw: string, legacy = false): { decks: Deck[]; activeId?: string; damaged: boolean } {
  try {
    const value: unknown = JSON.parse(raw);
    const state = value as { decks?: unknown; activeId?: unknown } | null;
    const list = legacy ? [value] : state?.decks;
    if (!Array.isArray(list)) return { decks: [], damaged: true };
    const decks = list.filter(isDeck).map(d => normalizeDeck({ ...d, flags: d.flags ?? flagDefaults() }));
    const activeId = typeof state?.activeId === "string" ? state.activeId : undefined;
    return { decks, activeId, damaged: decks.length !== list.length };
  } catch {
    return { decks: [], damaged: true };
  }
}
