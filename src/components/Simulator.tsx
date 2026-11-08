import { lazy, Suspense, useState } from "react";
import type { SkillTables, PlayerInput } from "../lib/engine";
import type { RankRef } from "../lib/deckFile";
import { SimulatorArt } from "./renewal/SimulatorArt";
const SkillSimulator = lazy(() => import("./SkillSimulator"));
const MomentCombination = lazy(() => import("./MomentCombination"));
const HofRecruitment = lazy(() => import("./HofRecruitment"));
const EventPage = lazy(() => import("./EventPage"));
export default function Simulator({
  tables,
  players,
  eventDeck,
  onRegisterDeck,
  onViewRankings,
}: {
  tables: SkillTables;
  players: PlayerInput[];
  eventDeck?: RankRef;
  onRegisterDeck?: () => void;
  onViewRankings?: () => void;
}) {
  const [screen, setScreen] = useState<
    "home" | "skills" | "combination" | "hof" | "event"
  >(() =>
    new URLSearchParams(location.search).get("event") === "1"
      ? "event"
      : "home",
  );
  return (
    <div className="simulator-hub">
      {screen === "home" ? (
        <>
          <div className="sim-hero">
            <div className="eyebrow">TRY YOUR NEXT MOMENT</div>
            <h2>
              상상했던 그 조합,
              <br />
              <em>여기서 먼저 만나보세요.</em>
            </h2>
            <div className="banner-illustration">
              <SimulatorArt type="moment" />
            </div>
          </div>
          <p className="muted sim-hub-description">
            원하는 시뮬레이션을 선택하세요. 설정과 기록은 이 브라우저에 자동
            저장됩니다.
          </p>
          <div className="sim-hub-options">
            <button
              className="card sim-hub-option"
              onClick={() => setScreen("skills")}
            >
              <SimulatorArt type="skills" />
              <strong>스킬 시뮬레이션</strong>
              <span className="muted">
                변경권별 스킬 추첨 · 첫 줄 잠금 · 점수 목표
              </span>
              <span className="sim-hub-enter">시작하기 →</span>
            </button>
            <button
              className="card sim-hub-option combo-option"
              onClick={() => setScreen("combination")}
            >
              <SimulatorArt type="moment" />
              <strong>슈프림 모먼트 조합</strong>
              <span className="muted">
                구단·지구·리그 선택 · 선수·테마 · 후보 5장
              </span>
              <span className="sim-hub-enter">시작하기 →</span>
            </button>
            <button
              className="card sim-hub-option hof-option"
              onClick={() => setScreen("hof")}
            >
              <SimulatorArt type="hof" />
              <strong>일반 명예의 전당 영입</strong>
              <span className="muted">
                공식 선수 명단·확률 · 희망 선수 등장까지 · 획득 통계
              </span>
              <span className="sim-hub-enter">시작하기 →</span>
            </button>
            <button
              className="card sim-hub-option event-option"
              onClick={() => setScreen("event")}
            >
              <SimulatorArt type="event" />
              <strong>이벤트</strong>
              <span className="muted">
                5회 스킬 점수 대회 · 참여 응모권 · 행운 추첨
              </span>
              <span className="sim-hub-enter">
                이벤트 페이지 →
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <button className="sim-back" onClick={() => setScreen("home")}>
            ← 시뮬레이터 선택
          </button>
          <Suspense
            fallback={
              <div className="card" role="status">
                시뮬레이터를 불러오는 중…
              </div>
            }
          >
            {screen === "skills" ? (
              <SkillSimulator tables={tables} players={players} />
            ) : screen === "combination" ? (
              <MomentCombination />
            ) : screen === "hof" ? (
              <HofRecruitment />
            ) : (
              <EventPage
                deck={eventDeck}
                onRegisterDeck={onRegisterDeck}
                onViewRankings={onViewRankings}
              />
            )}
          </Suspense>
        </>
      )}
    </div>
  );
}
