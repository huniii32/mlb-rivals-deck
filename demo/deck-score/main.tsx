import { useSiteUsage } from "../../src/lib/siteUsage";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/components/renewal/styles/layout.css";
import { DeckScorePanel } from "../../src/components/DeckScorePanel";
import { selectDeckScoreSide } from "../../src/lib/deckScoreTargets";
import "./preview.css";

function Preview() {
  useSiteUsage("deck-score");
  const [night, setNight] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [team, setTeam] = useState("LAD");
  const [flags, setFlags] = useState<Record<string, boolean>>({ "10-team-L": true, "11-team-R": true, "14-team-L": true, "33-spec-R": true });
  const [years, setYears] = useState<Record<number, number | "">>({33: 2020});
  return <main className={`renewal score-demo${night ? " night" : ""}`}>
    <header><b>Rivals Deck</b><button onClick={() => setNight(!night)}>{night ? "라이트 모드" : "다크 모드"}</button></header>
    <article><h1>덱스코어 설정</h1><p>개발 미리보기 · 예시 덱으로 효과를 선택해 보세요.</p>
      <div className="demo-sheet"><DeckScorePanel preferredTeam={team} setPreferredTeam={setTeam} flags={flags} yearInputs={years}
        toggleFlag={key => setFlags(old => ({...old, [key]: !old[key]}))}
        setRowSide={(region, row, side) => setFlags(old => selectDeckScoreSide(old, region, row, side))}
        setYearInput={(row, year) => setYears(old => ({...old, [row]: year}))}/></div>
    </article>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
