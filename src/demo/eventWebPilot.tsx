import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PGlite } from "@electric-sql/pglite";
import EventPage from "../components/EventPage";
import {
  demoAdapter,
  openDemoDb,
  resetDemo,
  type DemoRole,
} from "./eventBrowserDb";
import "../styles.css";
import "../components/renewal/renewal.css";
import "./eventWebPilot.css";
const ROLE_LABELS: Record<DemoRole, string> = {
  alice: "참가자 A · 다저스",
  bob: "참가자 B · 양키스",
  admin: "운영자 화면",
  guest: "비참가자 화면",
};
function Demo() {
  const [db, setDb] = useState<PGlite>(),
    [error, setError] = useState(""),
    [role, setRole] = useState<DemoRole>(() =>
      new URLSearchParams(location.search).get("view") === "admin"
        ? "admin"
        : "alice",
    ),
    [version, setVersion] = useState(0),
    [resetting, setResetting] = useState(false);
  const [night, setNight] = useState(false);
  const adapter = useMemo(
    () => (db ? demoAdapter(db, role) : undefined),
    [db, role],
  );
  useEffect(() => {
    void openDemoDb()
      .then(setDb)
      .catch((e) =>
        setError(
          e?.message === "another_demo_tab"
            ? "다른 탭에서 데모가 열려 있습니다. 그 탭을 닫고 이 페이지를 새로고침해주세요."
            : "데모를 불러오지 못했습니다. 최신 Chrome·Edge에서 저장소 사용을 허용한 뒤 새로고침해주세요.",
        ),
      );
  }, []);
  async function reset() {
    if (
      !db ||
      !confirm(
        "이 브라우저의 데모 참가자·도전·당첨 기록을 초기화할까요? 실제 덱 기록에는 영향이 없습니다.",
      )
    )
      return;
    setResetting(true);
    try {
      await resetDemo(db);
      setVersion((v) => v + 1);
      setRole("alice");
      setError("");
    } catch {
      setError("초기화에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setResetting(false);
    }
  }
  return (
    <main className={`renewal event-web-demo${night ? " night" : ""}`}>
      <header className="web-demo-header">
        <span className="eyebrow">RIVALS DECK · DEMO</span>
        <h1>이벤트 체험</h1>
        <p>
          참가자 A·B로 도전한 뒤 운영자 화면에서 마감 → 추첨 → 인증 → 지급
          기록을 확인하세요.
        </p>
        <p className="web-demo-notice">
          가상 덱으로 체험합니다. 기록은 이 브라우저에만 저장되며 실제 응모·경품
          지급에는 반영되지 않습니다.
        </p>
        <div className="web-demo-controls">
          <label>
            체험할 화면
            <select
              aria-label="체험할 화면"
              value={role}
              disabled={!db || resetting}
              onChange={(e) => setRole(e.target.value as DemoRole)}
            >
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!db || resetting} onClick={() => void reset()}>
            데모 초기화
          </button>
          <button onClick={() => setNight((x) => !x)}>
            {night ? "라이트 모드" : "다크 모드"}
          </button>
          {location.hostname.endsWith(".pages.dev") && (
            <form method="post" action="/__preview/logout">
              <button>접속 종료</button>
            </form>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="web-demo-notice">
          {error}
        </p>
      )}
      {!db && !error && (
        <p role="status" className="web-demo-notice">
          데모를 준비하고 있습니다. 처음에는 체험 데이터를 내려받느라 잠시 걸릴
          수 있습니다.
        </p>
      )}
      {adapter && !resetting && (
        <EventPage
          key={`${role}:${version}`}
          preview={adapter}
          deck={adapter.deck}
          onRegisterDeck={() => setRole("alice")}
          onViewRankings={() => setRole("alice")}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
