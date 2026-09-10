import type { LineupSlot, Player } from "../types";

// 로그인 없이 공유: 라인업 스냅샷(선수 정보 포함)을 URL 해시에 base64로 담는다.
// 보유목록 전체가 아니라 라인업 25명만 담으므로 URL 길이가 감당 가능하다.
export interface SharedDeck {
  v: 1;
  players: Player[];
  slots: { slotId: string; playerId: string | null }[];
}

export function encodeShare(players: Player[], slots: LineupSlot[]): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const linedIds = new Set(
    slots.map((s) => s.playerId).filter((id): id is string => Boolean(id)),
  );
  const snap = [...linedIds]
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p));
  const payload: SharedDeck = {
    v: 1,
    players: snap,
    slots: slots.map((s) => ({ slotId: s.slotId, playerId: s.playerId })),
  };
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
}

export function decodeShare(code: string): SharedDeck | null {
  try {
    const bin = atob(code);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as SharedDeck;
    if (parsed.v !== 1 || !Array.isArray(parsed.players) || !Array.isArray(parsed.slots)) return null;
    return parsed;
  } catch {
    return null;
  }
}
