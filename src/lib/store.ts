import type { LineupSlot, Player, ScoreWeights } from "../types";
import { DEFAULT_WEIGHTS, defaultSlots } from "./grades";

const KEY = "rivals-deck-v1";

export interface Persisted {
  players: Player[];
  slots: LineupSlot[];
  weights: ScoreWeights;
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Persisted;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.slots)) throw new Error("bad");
    return {
      players: parsed.players,
      slots: parsed.slots,
      weights: { ...DEFAULT_WEIGHTS, ...(parsed.weights || {}) },
    };
  } catch {
    return { players: [], slots: defaultSlots(), weights: DEFAULT_WEIGHTS };
  }
}

export function save(state: Persisted): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
