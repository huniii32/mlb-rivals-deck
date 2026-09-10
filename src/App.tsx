import { useEffect, useMemo, useRef, useState } from "react";
import type { Chem, Kind, PlayerInput, SkillTables } from "./lib/engine";
import { calcPlayer, flagDefaults } from "./lib/engine";
import type { PhotoInfo } from "./lib/photos";
import { effectiveQuery, searchPhoto } from "./lib/photos";
import { LineupView } from "./components/LineupView";
import { PlayerEditor } from "./components/PlayerEditor";
import { ChemPanel, DeckScorePanel } from "./components/DeckPanel";
import { SkillPanel } from "./components/SkillPanel";
import { TableEditor } from "./components/TableEditor";
import { NewsTab } from "./components/NewsTab";
import { SharePanel } from "./components/SharePanel";
import { ResultPanel } from "./components/ResultPanel";
import "./styles.css";

const DECKS_KEY = "rivals-decks-v1";
const TABLES_KEY = "rivals-tables-v1";
const THEME_KEY = "rivals-theme";
const LEGACY_KEY = "rivals-deck-v2";

const BATTER_DEF: [number, string, number][] = [
  [11, "C", 9], [12, "1B", 5], [13, "2B", 2], [14, "3B", 6], [15, "SS", 7],
  [16, "LF", 4], [17, "CF", 8], [18, "RF", 1], [19, "DH", 3],
];
const PITCHER_DEF: [number, string][] = [
  [22, "SP1"], [23, "SP2"], [24, "SP3"], [25, "SP4"], [26, "SP5"],
  [27, "RP1"], [28, "RP2"], [29, "RP3"], [30, "CP1"],
];

function blankPlayer(excelRow: number, kind: Kind, pos: string, order: number | ""): PlayerInput {
  return {
    excelRow, kind, pos, order,
    card: "", name: "", team: "", year: "", enName: "", photoUrl: "",
    base: ["", "", ""], train: ["", "", ""], spec: ["", "", ""],
    transLv: "", enhLv: "", pohLv: "",
    extra: ["", "", ""],
    synergy: ["", "", ""],
    locker: ["", "", ""],
    skillB: false,
    skills: ["", "", "", ""],
    finalOv: ["", "", ""],
  };
}

export interface Deck {
  id: string;
  name: string;
  updatedAt: number;
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
}

function blankDeck(name: string): Deck {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    updatedAt: Date.now(),
    players: [
      ...BATTER_DEF.map(([r, pos, o]) => blankPlayer(r, "batter", pos, o)),
      ...PITCHER_DEF.map(([r, pos]) => blankPlayer(r, "pitcher", pos, "")),
    ],
    chem: { commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1" },
    flags: flagDefaults(),
    yearInputs: { 33: "", 35: "", 37: "" },
  };
}

function loadDecks(): { decks: Deck[]; activeId: string } {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { decks: Deck[]; activeId: string };
      if (Array.isArray(s.decks) && s.decks.length) {
        const decks = s.decks.map((d) => {
          const base = blankDeck(d.name || "내 덱");
          const norm = (p: PlayerInput): PlayerInput => ({
            ...p,
            enName: p.enName ?? "",
            photoUrl: p.photoUrl ?? "",
            team: p.team ?? "",
            synergy: p.synergy ?? ["", "", ""],
            locker: p.locker ?? ["", "", ""],
          });
          return {
            ...base,
            ...d,
            players: Array.isArray(d.players) && d.players.length === 18
              ? (d.players as PlayerInput[]).map(norm)
              : base.players,
          };
        });
        const activeId = decks.some((d) => d.id === s.activeId) ? s.activeId : decks[0].id;
        return { decks, activeId };
      }
    }
    // 구버전(v2 단일 덱) 이전
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as Partial<Deck>;
      const d = blankDeck("내 덱 1");
      if (Array.isArray(s.players) && s.players.length === 18) d.players = s.players as PlayerInput[];
      if (s.chem) d.chem = { ...d.chem, ...s.chem };
      if (s.flags) d.flags = { ...d.flags, ...s.flags };
      if (s.yearInputs) d.yearInputs = { ...d.yearInputs, ...s.yearInputs };
      return { decks: [d], activeId: d.id };
    }
  } catch {
    // 무시하고 새로 생성
  }
  const d = blankDeck("내 덱 1");
  return { decks: [d], activeId: d.id };
}

function loadTables(): SkillTables {
  try {
    const raw = localStorage.getItem(TABLES_KEY);
    if (raw) return JSON.parse(raw) as SkillTables;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as { tables?: SkillTables };
      if (s.tables) return s.tables;
    }
  } catch {
    // 무시
  }
  return { overrides: {}, customs: [] };
}

export default function App() {
  const [boot] = useState(loadDecks);
  const [decks, setDecks] = useState<Deck[]>(boot.decks);
  const [activeId, setActiveId] = useState(boot.activeId);
  const [tables, setTables] = useState<SkillTables>(loadTables);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"lineup" | "news" | "ranking" | "skills">("lineup");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [photoCache, setPhotoCache] = useState<Record<string, PhotoInfo | null>>(() => {
    try {
      return JSON.parse(localStorage.getItem("rivals-photos-v1") || "{}");
    } catch {
      return {};
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const deck = decks.find((d) => d.id === activeId) ?? decks[0];
  const { players, chem, flags, yearInputs } = deck;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(DECKS_KEY, JSON.stringify({ decks, activeId }));
  }, [decks, activeId]);

  useEffect(() => {
    localStorage.setItem(TABLES_KEY, JSON.stringify(tables));
  }, [tables]);

  useEffect(() => {
    localStorage.setItem("rivals-photos-v1", JSON.stringify(photoCache));
  }, [photoCache]);

  // ESC로 팝업 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 영문명별 사진 조회 (행별 마지막 조회명 추적 → 이름 바뀌면 재조회)
  // 주의: 진행 중 setPhotoQuery가 effect를 재실행해도 루프가 죽으면 안 되므로
  // 마운트 여부만 ref로 보고, 캐시 덮어쓰기는 updater 가드로 막는다.
  const [photoQuery, setPhotoQuery] = useState<Record<number, string>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const targets = players.filter((p) => {
      const name = effectiveQuery(p.enName, p.name);
      if (!name || p.photoUrl.trim()) return false;
      if (photoQuery[p.excelRow] === name) return false;
      if (photoCache[name.toLowerCase()] !== undefined) return false;
      return true;
    });
    if (!targets.length) return;
    (async () => {
      for (const t of targets) {
        const name = effectiveQuery(t.enName, t.name);
        const key = name.toLowerCase();
        setPhotoQuery((q) => (q[t.excelRow] === name ? q : { ...q, [t.excelRow]: name }));
        let hit: PhotoInfo | null;
        try {
          hit = await searchPhoto(name);
        } catch {
          hit = null;
        }
        if (!mounted.current) return;
        setPhotoCache((c) => (c[key] === undefined ? { ...c, [key]: hit } : c));
      }
    })();
  }, [players, photoCache, photoQuery]);

  const retryPhoto = (p: PlayerInput) => {
    const key = effectiveQuery(p.enName, p.name).toLowerCase();
    setPhotoCache((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });
    setPhotoQuery((q) => {
      const n = { ...q };
      delete n[p.excelRow];
      return n;
    });
  };

  const ctx = useMemo(() => {
    const cardByRow: Record<number, string> = {};
    const orderByRow: Record<number, number> = {};
    const enhByRow: Record<number, number> = {};
    const yearByRow: Record<number, number> = {};
    for (const p of players) {
      cardByRow[p.excelRow] = p.card;
      orderByRow[p.excelRow] = typeof p.order === "number" ? p.order : 0;
      enhByRow[p.excelRow] = typeof p.enhLv === "number" ? p.enhLv : 0;
      yearByRow[p.excelRow] = typeof p.year === "number" ? p.year : 0;
    }
    return { flags, yearInputs, cardByRow, orderByRow, enhByRow, yearByRow, chem };
  }, [players, flags, yearInputs, chem]);

  const results = useMemo(
    () => players.map((p) => calcPlayer(p, ctx, tables)),
    [players, ctx, tables],
  );
  const batters = players.slice(0, 9);
  const pitchers = players.slice(9);
  const bRes = results.slice(0, 9);
  const pRes = results.slice(9);

  const patchDeck = (patch: Partial<Deck>) =>
    setDecks(decks.map((d) => (d.id === deck.id ? { ...d, ...patch, updatedAt: Date.now() } : d)));

  // 행별 좌/우 택1: 고른 쪽만 켜고 반대쪽은 끈다. 이미 켜진 쪽을 다시 누르면 둘 다 끈다.
  const pickRowSide = (region: string, row: number, side: "L" | "R") => {
    const next = { ...deck.flags };
    const a = `${row}-${region}-L`;
    const b = `${row}-${region}-R`;
    if (next[`${row}-${region}-${side}`]) {
      next[a] = false;
      next[b] = false;
    } else {
      next[a] = side === "L";
      next[b] = side === "R";
    }
    patchDeck({ flags: next });
  };

  const update = (excelRow: number, p: Partial<PlayerInput>) =>
    patchDeck({ players: players.map((x) => (x.excelRow === excelRow ? { ...x, ...p } : x)) });

  const customNames: Record<Kind, string[]> = useMemo(
    () => ({
      batter: tables.customs.filter((c) => c.kind === "batter").map((c) => c.name),
      pitcher: tables.customs.filter((c) => c.kind === "pitcher").map((c) => c.name),
    }),
    [tables],
  );

  const photosByRow: Record<number, PhotoInfo> = useMemo(() => {
    const out: Record<number, PhotoInfo> = {};
    for (const p of players) {
      if (p.photoUrl.trim()) out[p.excelRow] = { src: p.photoUrl.trim(), page: p.photoUrl.trim() };
      else {
        const q = effectiveQuery(p.enName, p.name);
        if (q) {
          const hit = photoCache[q.toLowerCase()];
          if (hit) out[p.excelRow] = hit;
        }
      }
    }
    return out;
  }, [players, photoCache]);

  const selPlayer = selected === null ? null : players.find((p) => p.excelRow === selected) ?? null;
  const selRes = selPlayer ? results[players.indexOf(selPlayer)] : null;

  const newDeck = () => {
    const d = blankDeck(`내 덱 ${decks.length + 1}`);
    setDecks([...decks, d]);
    setActiveId(d.id);
    setSelected(null);
  };
  const renameDeck = () => {
    const name = prompt("덱 이름", deck.name);
    if (name?.trim()) patchDeck({ name: name.trim() });
  };
  const deleteDeck = () => {
    if (decks.length <= 1) {
      alert("마지막 덱은 삭제할 수 없습니다.");
      return;
    }
    if (!confirm(`'${deck.name}' 삭제할까요?`)) return;
    const rest = decks.filter((d) => d.id !== deck.id);
    setDecks(rest);
    setActiveId(rest[0].id);
    setSelected(null);
  };
  const exportDeck = () => {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${deck.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importDeck = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        addDeckData(JSON.parse(String(rd.result)) as Deck, "가져온 덱");
      } catch {
        alert("덱 파일 형식이 아닙니다.");
      }
    };
    rd.readAsText(f);
  };

  const addDeckData = (d: Deck, fallbackName: string) => {
    if (!d || !Array.isArray(d.players) || d.players.length !== 18) {
      alert("덱 형식이 아닙니다.");
      return;
    }
    const base = blankDeck(d.name || fallbackName);
    const nd: Deck = {
      ...base,
      ...d,
      players: (d.players as PlayerInput[]).map((p) => ({
        ...p,
        enName: p.enName ?? "",
        photoUrl: p.photoUrl ?? "",
        team: p.team ?? "",
        synergy: p.synergy ?? ["", "", ""],
        locker: p.locker ?? ["", "", ""],
      })),
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      updatedAt: Date.now(),
    };
    setDecks((prev) => [...prev, nd]);
    setActiveId(nd.id);
    setSelected(null);
  };

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="11" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
            <path d="M6 4.5c3 3.5 3 13.5 0 17M20 4.5c-3 3.5-3 13.5 0 17" fill="none" stroke="#dc2626" strokeWidth="1.6" strokeDasharray="2.5 1.8" />
          </svg>
          Rivals Deck <small>9이닝스 라이벌즈 덱관리</small>
        </div>
        <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="테마 전환">
          {theme === "dark" ? "☀️ 라이트" : "🌙 다크"}
        </button>
      </header>

      <div className="card toolbar">
        <div className="row">
          <label>내 덱{" "}
            <select value={deck.id} onChange={(e) => { setActiveId(e.target.value); setSelected(null); }}>
              {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <button onClick={newDeck}>+ 새 덱</button>
          <button onClick={renameDeck}>이름변경</button>
          <button onClick={deleteDeck}>삭제</button>
          <button onClick={exportDeck}>내보내기</button>
          <button onClick={() => fileRef.current?.click()}>가져오기</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => { importDeck(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="muted">덱은 이 브라우저에만 저장됩니다 — 남이 내 덱을 볼 수 없고, 나도 남 덱을 못 봅니다. 기기 이동은 내보내기→가져오기로.</p>
      </div>

      <div className="tabs">
        {(["lineup", "news", "ranking", "skills"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ lineup: "라인업", news: "정보", ranking: "랭킹 · 공유", skills: "스킬점수" }[t]}
          </button>
        ))}
      </div>

      {tab === "lineup" && (
        <div className="lineup-layout">
          <div>
            <LineupView
              batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes}
              onSelect={setSelected} photos={photosByRow}
            />
          </div>
          <aside>
            <h2>팀덱코 · 스덱코 · 케미</h2>
            <DeckScorePanel
              flags={flags} toggleFlag={(k) => patchDeck({ flags: { ...flags, [k]: !flags[k] } })}
              setRowSide={(region, row, side) => pickRowSide(region, row, side)}
              yearInputs={yearInputs} setYearInput={(r, v) => patchDeck({ yearInputs: { ...yearInputs, [r]: v } })}
            />
            <ChemPanel
              chem={chem} setChem={(c) => patchDeck({ chem: c })}
            />
          </aside>
        </div>
      )}

      {tab === "news" && <NewsTab />}

      {tab === "ranking" && (
        <>
          <SharePanel
            decks={decks} tables={tables} activeId={deck.id}
            onSelectDeck={(id) => { setActiveId(id); setSelected(null); }}
            onImportDeck={(d) => addDeckData(d, "공유받은 덱")}
          />
          <h2>선수 랭킹 · 스킬 비교</h2>
          <ResultPanel batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes} tables={tables} customNames={customNames} />
        </>
      )}

      {tab === "skills" && (
        <>
          <SkillPanel tables={tables} setTables={setTables} />
          <TableEditor tables={tables} setTables={setTables} />
        </>
      )}

      {selPlayer && selRes && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <PlayerEditor
              p={selPlayer}
              res={selRes}
              update={(patch) => update(selPlayer.excelRow, patch)}
              close={() => setSelected(null)}
              customNames={customNames[selPlayer.kind]}
              photo={photosByRow[selPlayer.excelRow]}
              tables={tables}
              photoPending={
                !!effectiveQuery(selPlayer.enName, selPlayer.name) &&
                !selPlayer.photoUrl.trim() &&
                photoQuery[selPlayer.excelRow] === effectiveQuery(selPlayer.enName, selPlayer.name) &&
                photoCache[effectiveQuery(selPlayer.enName, selPlayer.name).toLowerCase()] === undefined
              }
              photoFailed={
                !!effectiveQuery(selPlayer.enName, selPlayer.name) &&
                !selPlayer.photoUrl.trim() &&
                photoCache[effectiveQuery(selPlayer.enName, selPlayer.name).toLowerCase()] === null
              }
              onRetryPhoto={() => retryPhoto(selPlayer)}
            />
          </div>
        </div>
      )}

      <p className="muted">사진: Wikimedia Commons (CC 라이선스) · 점수는 랭대 공격 기준</p>
    </div>
  );
}
