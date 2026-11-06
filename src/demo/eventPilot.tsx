import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../lib/supabase";
import { LINEUP, blankPlayer, normalizeDeck } from "../lib/deck";
import { deckSig, rankArgs } from "../lib/rankSync";
import "../styles.css";
import "../components/renewal/renewal.css";
type PilotUser = {
  id: string;
  name: string;
  email: string;
  rank: string;
  token: string;
};
function Pilot() {
  const [users, setUsers] = useState<Record<string, PilotUser>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_EVENT_PILOT === "1")
      void fetch(`${import.meta.env.VITE_SUPABASE_URL}/pilot/config`)
        .then((r) => r.json())
        .then((x) => setUsers(x.users))
        .catch(() => setError("테스트 서버를 실행해주세요."));
  }, []);
  if (!import.meta.env.DEV || import.meta.env.VITE_EVENT_PILOT !== "1")
    return <p>로컬 이벤트 검증 서버에서만 사용할 수 있습니다.</p>;
  async function enter(key: string, u: PilotUser) {
    if (!supabase) return;
    const result =
      key === "admin"
        ? await supabase.auth.signInWithPassword({
            email: u.email,
            password: "test-only",
          })
        : await supabase.auth.signOut();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const deck = normalizeDeck({
      id: `event-test-${key}`,
      updatedAt: Date.now(),
      name: u.name,
      players: LINEUP.map((l) => ({
        ...blankPlayer(l.row, l.kind, l.pos, l.order),
        name: `테스트 선수 ${l.row}`,
        card: "시그니처",
      })),
      flags: {},
      yearInputs: {},
      chem: {
        commander: "X",
        catcher: "X",
        pitchChem: "X",
        batChem: "X",
        wbcP: "X",
        wbcB: "X",
      },
    });
    localStorage.setItem(
      "rivals-decks-v1",
      JSON.stringify({ decks: [deck], activeId: deck.id }),
    );
    localStorage.setItem(
      "rivals-my-ranks-v1",
      JSON.stringify({
        [u.rank]: {
          deckId: deck.id,
          token: u.token,
          password: true,
          sig: deckSig(rankArgs(deck, { customs: [], overrides: {} }).args),
        },
      }),
    );
    localStorage.setItem("rivals-theme", "light");
    location.href = "/?event=1#simulator";
  }
  return (
    <div className="renewal" style={{ padding: 32 }}>
      <h1>이벤트 서버 검증</h1>
      <p>
        가상 참가자 2명과 운영자로 참여 → 5회 도전 → 응모권 → 마감 → 추첨을
        확인하세요.
      </p>
      <p>
        참가자는 이메일 로그인 없이 덱 비밀번호 인증 정보로 참여합니다. 운영자만
        별도로 로그인합니다. 별도 테스트 DB에 저장되며 실제 덱·경품과 연결되지
        않습니다. 새로고침하거나 서버를 다시 켜도 기록이 유지됩니다.
      </p>
      <div className="row" style={{ marginTop: 24 }}>
        {Object.entries(users).map(([key, u]) => (
          <button key={key} onClick={() => void enter(key, u)}>
            {u.name}로 시작
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Pilot />);
