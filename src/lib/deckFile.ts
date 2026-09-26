import { isDeck, type Deck } from "./deck";
import type { RankLinks } from "./rankSync";

/** 덱 파일 형식: 덱 1개(기존) 또는 여러 덱 묶음. 랭킹 연동 덱에는 rank{id,token}이 파일에만 들어간다. */
export const BUNDLE_FORMAT = "rivals-decks-bundle";
export interface RankRef { id: string; token: string }
export interface DeckFileEntry { deck: Deck; rank?: RankRef }

// 토큰 있는 레거시 연동만 파일에 담는다. 코드 소유 글(token 없음)과 내 덱 코드는 파일에 넣지 않음
const rankOf = (deck: Deck, links: RankLinks): RankRef | undefined => {
  for (const [id, l] of Object.entries(links)) if (l.deckId === deck.id && l.token) return { id, token: l.token };
};

/** 내보내기용: 연동 덱만 rank를 붙인다 (덱 상태 자체는 건드리지 않음) */
export const withRank = (deck: Deck, links: RankLinks): Deck & { rank?: RankRef } => {
  const rank = rankOf(deck, links);
  return rank ? { ...deck, rank } : deck;
};

export const buildBundle = (decks: Deck[], links: RankLinks) => ({
  format: BUNDLE_FORMAT,
  decks: decks.map((d) => withRank(d, links)),
});

const readRank = (v: unknown): RankRef | undefined => {
  const r = (v as { rank?: { id?: unknown; token?: unknown } } | null)?.rank;
  return typeof r?.id === "string" && typeof r.token === "string" ? { id: r.id, token: r.token } : undefined;
};

/** 가져오기용: 단일 덱/묶음 파일을 [{deck, rank}]로. 형식이 아닌 항목은 버리고, deck에서는 rank를 제거한다. */
export function parseDeckFile(raw: unknown): DeckFileEntry[] {
  const list = Array.isArray((raw as { decks?: unknown } | null)?.decks) ? (raw as { decks: unknown[] }).decks : [raw];
  const out: DeckFileEntry[] = [];
  for (const item of list) {
    if (!isDeck(item)) continue;
    const { rank: _rank, ...deck } = item as Deck & { rank?: unknown }; // 토큰이 덱 상태로 새지 않게
    out.push({ deck: deck as Deck, rank: readRank(item) });
  }
  return out;
}
