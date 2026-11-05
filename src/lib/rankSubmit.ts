import type { Deck } from "./deck";
import type { RankLinks } from "./rankSync";
import type { PublicRank } from "./supabase";

/** 서버와 동일한 이름 비교: 양끝/연속 공백, 영문 대소문자 차이 무시. */
export const rankingNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** 이름은 검색 기준일 뿐 소유 증명이 아니다. 토큰/코드가 있는 행만 후보. */
export function findRankTarget(active: Deck, decks: Deck[], links: RankLinks, rows: PublicRank[]) {
  const entries = Object.entries(links);
  const exact = entries.find(([, link]) => link.deckId === active.id);
  if (exact) return exact;
  const key = rankingNameKey(active.name);
  return entries.find(([id, link]) => {
    const row = rows.find(r => r.id === id);
    const local = decks.find(d => d.id === link.deckId);
    return rankingNameKey(row?.deck_name ?? local?.name ?? "") === key;
  });
}

/** 연결을 새 로컬 덱으로 옮겨 옛 복사본의 자동 동기화가 다시 덮어쓰지 않게 한다. */
export function bindRank(links: RankLinks, id: string, deckId: string, proof: { owned?: boolean; token?: string }, sig: string): RankLinks {
  return { ...links, [id]: { ...proof, deckId, sig } };
}
