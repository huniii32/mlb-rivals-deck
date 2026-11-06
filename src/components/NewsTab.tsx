import { useState } from "react";
import noticesData from "../data/notices.json";

interface Notice {
  title: string;
  date: string;
  url: string;
  lang: string;
}
const NOTICES = (noticesData as { updated: string; notices: Notice[] }).notices;
const UPDATED = (noticesData as { updated: string }).updated;

/** URL의 board 번호로 섹션 구분: 2=공지사항, 10=Live 업데이트, 11=개발자 노트 */
const boardOf = (u: string) => u.match(/\/board\/(\d+)\//)?.[1] ?? "";
const SECTIONS = [
  { id: "", label: "전체" },
  { id: "2", label: "공지사항" },
  { id: "10", label: "Live 업데이트" },
  { id: "11", label: "개발자 노트" },
] as const;

interface LinkItem {
  title: string;
  url: string;
  memo: string;
}

const DEFAULT_LINKS: LinkItem[] = [
  { title: "공식 커뮤니티 (한국어)", url: "https://community.withhive.com/MLB9IRIVALS/ko/board/all", memo: "업데이트·스카우트 공지" },
  { title: "공식 커뮤니티 (English)", url: "https://community.withhive.com/MLB9IRIVALS/en/board/2", memo: "Update & scout notices" },
  { title: "펨코 (직접 검색 필요)", url: "https://www.fmkorea.com/", memo: "자동 수집 불가 — 사이트에서 9이닝스 검색" },
];

const LS_KEY = "rivals-links-v1";

function loadLinks(): LinkItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as LinkItem[];
  } catch {
    // 무시
  }
  return DEFAULT_LINKS;
}

/** 소식 탭: 공식 공지(빌드 시 수집) + 정보글(직접 등록) */
export function NewsTab() {
  const [sub, setSub] = useState<"official" | "info">("official");
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("");
  const [sec, setSec] = useState<string>("");
  const [links, setLinks] = useState<LinkItem[]>(loadLinks);
  const [t, setT] = useState("");
  const [u, setU] = useState("");
  const [m, setM] = useState("");

  const save = (next: LinkItem[]) => {
    setLinks(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  const matches = (n: Notice) =>
    (!q || n.title.toLowerCase().includes(q.toLowerCase())) &&
    (!lang || n.lang === lang);
  const filtered = NOTICES.filter((n) => matches(n) && (!sec || boardOf(n.url) === sec));

  return (
    <div>
      <div className="tabs">
        <button className={sub === "official" ? "on" : ""} onClick={() => setSub("official")}>
          공식사이트
        </button>
        <button className={sub === "info" ? "on" : ""} onClick={() => setSub("info")}>
          정보글 ({links.length})
        </button>
      </div>
      {sub === "official" ? (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            {SECTIONS.map((s) => {
              const c = NOTICES.filter((n) => matches(n) && (!s.id || boardOf(n.url) === s.id)).length;
              return (
                <button key={s.id || "all"} className={sec === s.id ? "on" : ""} onClick={() => setSec(s.id)}>
                  {s.label} ({c})
                </button>
              );
            })}
          </div>
          <div className="row">
            <input placeholder="공지 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="">전체 언어</option>
              <option value="/ko/">한국어</option>
              <option value="/en/">English</option>
            </select>
            <span className="muted">수집일 {UPDATED} · {filtered.length}건</span>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>날짜</th><th>제목</th><th>언어</th></tr></thead>
            <tbody>
              {filtered.slice(0, 100).map((n) => (
                <tr key={n.url}>
                  <td style={{ whiteSpace: "nowrap" }}>{n.date}</td>
                  <td><a href={n.url} target="_blank" rel="noreferrer">{n.title}</a></td>
                  <td>{n.lang === "/ko/" ? "KO" : n.lang === "/en/" ? "EN" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && <p className="muted">100건까지만 표시 — 검색으로 좁혀보세요.</p>}
        </div>
      ) : (
        <div className="card">
          <div className="row">
            <input placeholder="제목" value={t} onChange={(e) => setT(e.target.value)} style={{ flex: 1 }} />
            <input placeholder="URL (https://…)" value={u} onChange={(e) => setU(e.target.value)} style={{ flex: 2 }} />
            <input placeholder="메모 (선택)" value={m} onChange={(e) => setM(e.target.value)} style={{ flex: 1 }} />
            <button
              className="primary"
              onClick={() => {
                if (!t.trim() || !/^https?:\/\//.test(u.trim())) {
                  alert("제목과 http(s) URL을 입력하세요.");
                  return;
                }
                save([...links, { title: t.trim(), url: u.trim(), memo: m.trim() }]);
                setT(""); setU(""); setM("");
              }}
            >
              추가
            </button>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>제목</th><th>메모</th><th></th></tr></thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={i}>
                  <td><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></td>
                  <td className="muted">{l.memo}</td>
                  <td>
                    {!DEFAULT_LINKS.some((d) => d.url === l.url && d.title === l.title) && (
                      <button onClick={() => save(links.filter((_, j) => j !== i))}>삭제</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">펨코는 자동 수집이 막혀있어서(로그인·JS 장벽) 직접 링크 등록으로 씁니다.</p>
        </div>
      )}
    </div>
  );
}
