import { useEffect, useMemo, useState } from "react";
import type { Deck } from "../App";
import type { SkillTables } from "../lib/engine";
import { calcDeckTotal } from "../lib/engine";

function encodeDeck(d: Deck): string {
  const json = JSON.stringify(d);
  const bin = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDeck(code: string): Deck | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const d = JSON.parse(json) as Deck;
    if (!d || !Array.isArray(d.players) || d.players.length !== 18) return null;
    return d;
  } catch {
    return null;
  }
}

/** 공유 + 내 덱 랭킹. 전체 공개 랭킹은 서버가 필요해서 내 덱끼리만 순위. */
export function SharePanel({
  decks, tables, activeId, onSelectDeck, onImportDeck,
}: {
  decks: Deck[];
  tables: SkillTables;
  activeId: string;
  onSelectDeck: (id: string) => void;
  onImportDeck: (d: Deck) => void;
}) {
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");

  const ranking = useMemo(
    () =>
      decks
        .map((d) => ({ deck: d, ...calcDeckTotal(d, tables) }))
        .sort((a, b) => b.total - a.total),
    [decks, tables],
  );
  const active = decks.find((d) => d.id === activeId) ?? decks[0];

  const make = () => {
    const code = encodeDeck(active);
    setLink(`${window.location.origin}${window.location.pathname}#d=${code}`);
  };
  const importFrom = (text: string) => {
    const m = text.match(/#d=([A-Za-z0-9\-_]+)/);
    const deck = decodeDeck(m ? m[1] : text.trim());
    if (!deck) {
      alert("공유 코드解析 실패");
      return;
    }
    onImportDeck(deck);
    setInput("");
  };

  // 공유 링크로 들어오면 자동 인식
  useEffect(() => {
    const m = window.location.hash.match(/#d=([A-Za-z0-9\-_]+)/);
    if (m) setInput(window.location.href);
  }, []);

  return (
    <div>
      <div className="card">
        <h3>내 덱 랭킹</h3>
        <table>
          <thead><tr><th>#</th><th>덱</th><th>총점</th><th>선발</th><th>계투</th><th>타자</th><th>등록</th><th></th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.deck.id}>
                <td>{i + 1}</td>
                <td>{r.deck.name}{r.deck.id === activeId && " ◀"}</td>
                <td><b>{r.total.toFixed(1)}</b></td>
                <td>{r.sp.toFixed(0)}</td>
                <td>{r.rp.toFixed(0)}</td>
                <td>{r.bt.toFixed(0)}</td>
                <td>{r.named}/18</td>
                <td>{r.deck.id !== activeId && <button onClick={() => onSelectDeck(r.deck.id)}>보기</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>덱 공유하기</h3>
        <p className="muted">현재 덱({active.name})을 링크에 담아 공유. 받는 쪽은 링크를 열어 가져오면 자기 덱 목록에 추가됨.</p>
        <div className="row">
          <button className="primary" onClick={make}>공유 링크 만들기</button>
          {link && <button onClick={() => navigator.clipboard.writeText(link)}>복사</button>}
        </div>
        {link && <p style={{ wordBreak: "break-all" }}><a href={link}>{link.slice(0, 90)}…</a></p>}
        <div className="row" style={{ marginTop: 8 }}>
          <input style={{ flex: 1 }} placeholder="공유 링크 또는 코드 붙여넣기" value={input}
            onChange={(e) => setInput(e.target.value)} />
          <button onClick={() => importFrom(input)}>가져오기</button>
        </div>
        <p className="muted">불특정다수 전체 랭킹(서버 집계)은 백엔드가 필요해서 아직 없음. 링크 공유로 덱 자랑은 가능.</p>
      </div>
    </div>
  );
}
