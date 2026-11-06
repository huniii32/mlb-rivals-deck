import type { ReactNode } from "react";

export type Page = "lineup" | "skills" | "ranking" | "simulator" | "news";
const pages: { id: Page; icon: string; title: string; description: string }[] =
  [
    {
      id: "lineup",
      icon: "▦",
      title: "내 라인업",
      description: "나만의 라인업, 한눈에 보고 더 간편하게.",
    },
    {
      id: "skills",
      icon: "✦",
      title: "스킬 비교",
      description: "레벨과 조건을 맞추고, 두 조합의 점수를 비교하세요.",
    },
    {
      id: "ranking",
      icon: "≋",
      title: "덱랭킹",
      description: "다양한 덱을 살펴보고, 내 덱과 비교해보세요.",
    },
    {
      id: "simulator",
      icon: "◈",
      title: "시뮬레이터",
      description: "다음 순간의 주인공을 미리 만나보세요.",
    },
    {
      id: "news",
      icon: "▤",
      title: "정보글",
      description: "새로운 소식과 함께 더 즐거운 야구를.",
    },
  ];

export function RenewalShell({
  page,
  navigate,
  theme,
  toggleTheme,
  openModal,
  children,
}: {
  page: Page;
  navigate: (page: Page) => void;
  theme: string;
  toggleTheme: () => void;
  openModal: (modal: "guide" | "patch" | "inquiry") => void;
  children: ReactNode;
}) {
  const current = pages.find((p) => p.id === page)!;
  const home = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("lineup");
  };
  return (
    <div className={`renewal ${theme === "dark" ? "night" : ""}`}>
      <div className="preview-strip">
        <b>RENEWAL PREVIEW</b>
        <span>실제 덱 저장 · 공개 랭킹과 연결되는 미리보기입니다.</span>
      </div>
      <aside className="sidebar">
        <a
          className="brand"
          href="#lineup"
          aria-label="Rivals Deck 로고 · 내 라인업으로 이동"
          onClick={home}
        >
          <span className="brand-mark">
            R<span>●</span>
          </span>
          <span>
            Rivals Deck<small>YOUR CLUB. YOUR WAY.</small>
          </span>
        </a>
        <div className="nav-label">MY CLUBHOUSE</div>
        <nav aria-label="주 메뉴">
          {pages.map((p) => (
            <button
              key={p.id}
              title={p.title}
              className={page === p.id ? "active" : ""}
              aria-current={page === p.id ? "page" : undefined}
              onClick={() => navigate(p.id)}
            >
              <span aria-hidden="true">{p.icon}</span>
              {p.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-event">
          <span>TRY YOUR NEXT MOMENT</span>
          <strong>
            상상했던 그 조합,
            <br />
            여기서 만나보세요.
          </strong>
          <p>스킬 · 슈프림 모먼트 · 명예의 전당</p>
          <button onClick={() => navigate("simulator")}>
            시뮬레이터 <span>↗</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          나의 야구, 나의 라인업
          <small>랭킹대전 공격 기준으로 계산합니다.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            MY CLUB <b>/</b> {current.title}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label={
                theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
              }
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button className="help-button" onClick={() => openModal("guide")}>
              산정방식 ↗
            </button>
            <button className="help-button" onClick={() => openModal("patch")}>
              공지사항
            </button>
            <button
              className="help-button"
              onClick={() => openModal("inquiry")}
            >
              문의하기
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "lineup"
                  ? "BUILD YOUR BEST NINE"
                  : "RIVALS CLUBHOUSE"}
              </div>
              <h1>
                {current.title}
                <span className="title-dot">.</span>
              </h1>
              <p>{current.description}</p>
            </div>
          </div>
          {children}
          <footer>
            <a href="#lineup" onClick={home}>
              <strong>Rivals Deck</strong>
            </a>
            <span>당신의 야구를, 더 즐겁게.</span>
            <small>카드 일러스트: 자체 제작 · 랭대 공격 기준</small>
          </footer>
        </main>
      </div>
    </div>
  );
}
