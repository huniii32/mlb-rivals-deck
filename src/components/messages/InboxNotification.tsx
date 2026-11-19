import { useEffect, useRef, useState } from "react";
import type { RankRef } from "../../lib/deckFile";
import { mailboxRequest, type PrivateMessage } from "../../lib/privateMessages";
import { supabase } from "../../lib/supabase";
import "./messages.css";

// Only delivery IDs are remembered, never subjects, bodies, images or credentials.
const PREFIX = "rivals-mail-alerts-v1:";
function remembered(id: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + id) || "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(-1000) : [];
  } catch { return []; }
}

/** Mount with a key containing the authenticated deck ID/token to isolate sessions. */
export default function InboxNotification({ deck, paused, onOpen }: {
  deck: RankRef & { name: string }; paused: boolean; onOpen: () => void;
}) {
  const seen = useRef(new Set(remembered(deck.id)));
  const [pending, setPending] = useState<string[]>([]);
  useEffect(() => {
    setPending([]);
    if (!supabase || !deck.password || !deck.token || paused) return;
    let disposed = false, loading = false;
    async function check() {
      if (disposed || loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const messages = await mailboxRequest<PrivateMessage[]>("list", { p_ranking_id: deck.id, p_token: deck.token, p_offset: 0 });
        if (disposed) return;
        for (const id of remembered(deck.id)) seen.current.add(id);
        const unread = messages.filter(m => !m.read_at).map(m => m.id);
        const fresh = unread.filter(id => !seen.current.has(id));
        if (fresh.length) {
          seen.current = new Set([...seen.current, ...fresh].slice(-1000));
          try { localStorage.setItem(PREFIX + deck.id, JSON.stringify([...seen.current])); } catch { /* Memory still prevents repeats while this page is open. */ }
        }
        setPending(current => [...new Set([...current.filter(id => unread.includes(id)), ...fresh])]);
      } catch {
        // A revoked/expired session must not leave another deck's notification visible.
        if (!disposed) setPending([]);
      } finally { loading = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const focus = () => void check();
    const storage = (event: StorageEvent) => { if (event.key === PREFIX + deck.id) setPending([]); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("storage", storage);
    return () => {
      disposed = true; window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("storage", storage);
    };
  }, [deck.id, deck.token, deck.password, paused]);

  if (paused || !pending.length) return null;
  return <aside className="inbox-notification" aria-label="새 쪽지 알림">
    <button className="inbox-notification-close" aria-label="새 쪽지 알림 닫기" onClick={() => setPending([])}>✕</button>
    <p role="status">새 쪽지가 도착했습니다.</p>
    <strong>{deck.name}</strong>
    <span>운영자가 보낸 쪽지를 확인해주세요.</span>
    <button className="inbox-notification-open" onClick={() => { setPending([]); onOpen(); }}>쪽지 확인</button>
  </aside>;
}
