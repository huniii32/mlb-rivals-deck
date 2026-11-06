import { useState } from "react";
import { isDeck, normalizeDeck, type Deck } from "../lib/deck";
import { validDeckName } from "../lib/deckPassword";
import { Modal } from "./Modal";

function encodeDeck(d: Deck): string {
  const bin = encodeURIComponent(JSON.stringify(d)).replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeDeck(code: string): Deck | null {
  try {
    const bytes = Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const d: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isDeck(d) ? normalizeDeck(d) : null;
  } catch { return null; }
}

export function DeckShareModal({ deck, onImport, onSave, close }: {
  deck: Deck; onImport: (d: Deck) => void; onSave: () => void; close: () => void;
}) {
  const [input, setInput] = useState(() => /#d=([A-Za-z0-9\-_]+)/.test(window.location.hash) ? window.location.href : "");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  return <Modal title="덱 링크 공유" close={close} width="min(560px, 100%)">
    <div className="deck-share-content" role="dialog" aria-label="덱 링크 공유">
      <p className="muted">덱의 복사본을 공유합니다. 원래 랭킹을 관리하려면 랭킹 목록에서 비밀번호로 가져오세요.</p>
      <section><h4>현재 덱 공유</h4><p>{deck.name || "이름 없는 덱"}</p>
        <button onClick={() => {
          if (!validDeckName(deck.name)) { close(); onSave(); return; }
          setLink(`${window.location.origin}${window.location.pathname}#d=${encodeDeck(deck)}`); setMessage("");
        }}>공유 링크 만들기</button>
        {link && <div className="deck-share-link"><input aria-label="생성된 공유 링크" readOnly value={link} onFocus={e => e.target.select()} /><button onClick={async () => {
          try { await navigator.clipboard.writeText(link); setMessage("공유 링크를 복사했습니다."); }
          catch { setMessage("자동 복사를 사용할 수 없습니다. 위 링크를 선택해 복사하세요."); }
        }}>복사</button></div>}
      </section>
      <form onSubmit={e => {
        e.preventDefault();
        const m = input.match(/#d=([A-Za-z0-9\-_]+)/);
        const d = decodeDeck(m ? m[1] : input.trim());
        if (!d) { setMessage("공유 링크를 확인하세요. 읽을 수 있는 덱이 없습니다."); return; }
        onImport(d); close();
      }}><h4>공유받은 덱 가져오기</h4>
        <label className="sr-only" htmlFor="deck-share-input">공유 링크 또는 코드</label>
        <div className="deck-share-link"><input id="deck-share-input" placeholder="공유 링크 또는 코드 붙여넣기" value={input} onChange={e => setInput(e.target.value)} required /><button type="submit">가져오기</button></div>
      </form>
      {message && <p role="status" className="muted">{message}</p>}
    </div>
  </Modal>;
}
