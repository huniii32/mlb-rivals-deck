import type { Deck } from "./deck";
import type { SkillTables } from "./engine";
import { deckPlayerResults } from "./engine";

/** 기존에 입력한 최종 능력치의 보정 차이를 보존하고, 육성·덱코 변경분을 자동 반영한다. */
export function applyDeckUpdate(deck: Deck, patch: Partial<Deck>, tables: SkillTables): Deck {
  const next = { ...deck, ...patch };
  if (!patch.players && !patch.flags && !patch.yearInputs) return next;
  const before = deckPlayerResults(deck, tables);
  const after = deckPlayerResults(next, tables);
  return {
    ...next,
    players: next.players.map((p, i) => {
      const oldIndex = deck.players.findIndex((old) => old.excelRow === p.excelRow);
      if (oldIndex < 0) return p;
      const old = deck.players[oldIndex];
      const finalOv = p.finalOv.map((value, stat) => {
        // 사용자가 최종값 자체를 수정한 칸은 새 입력을 존중한다.
        if (typeof value !== "number" || value !== old.finalOv[stat]) return value;
        const oldBase = before[oldIndex].auto[stat] - before[oldIndex].tactics[stat];
        const newBase = after[i].auto[stat] - after[i].tactics[stat];
        return Math.round((value + newBase - oldBase) * 100) / 100;
      }) as typeof p.finalOv;
      return { ...p, finalOv };
    }),
  };
}
