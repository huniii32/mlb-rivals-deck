import { useEffect, useMemo, useRef, useState } from "react";
import type { Chem, Kind, PlayerInput, SkillTables } from "./lib/engine";
import { calcPlayer, flagDefaults, migrateSkillName } from "./lib/engine";
import { LineupView } from "./components/LineupView";
import { PlayerEditor } from "./components/PlayerEditor";
import { ChemPanel, DeckScorePanel } from "./components/DeckPanel";
import { SkillCompare, SkillPanel } from "./components/SkillPanel";
import { TableEditor } from "./components/TableEditor";
import { NewsTab } from "./components/NewsTab";
import { SharePanel } from "./components/SharePanel";
import { ResultPanel } from "./components/ResultPanel";
import { InquiryModal, PatchNotesModal } from "./components/SiteModals";
import { DeckPreviewModal } from "./components/DeckPreview";
import { parseExcelDeck } from "./lib/excelImport";
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
            skills: (p.skills ?? ["", "", "", ""]).map((s) =>
              migrateSkillName(p.kind, s)) as [string, string, string, string],
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

function migrateTables(t: SkillTables): SkillTables {
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.overrides || {})) {
    const m = k.match(/^(batter|pitcher):(.*)$/);
    overrides[m ? `${m[1]}:${migrateSkillName(m[1] as Kind, m[2])}` : k] = v;
  }
  const customs = (t.customs || []).map((c) => ({ ...c, name: migrateSkillName(c.kind, c.name) }));
  return { ...t, overrides, customs };
}

function loadTables(): SkillTables {
  try {
    const raw = localStorage.getItem(TABLES_KEY);
    if (raw) return migrateTables(JSON.parse(raw) as SkillTables);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as { tables?: SkillTables };
      if (s.tables) return migrateTables(s.tables);
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
  const [tab, setTab] = useState<"lineup" | "skills" | "ranking" | "news">("lineup");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [modal, setModal] = useState<"inquiry" | "notices" | null>(null);
  const [preview, setPreview] = useState<Deck | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const xlRef = useRef<HTMLInputElement>(null);

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

  // ESC로 팝업 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setModal(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 카드 그림: 수동 이미지 URL만 사용, 없으면 자체 일러스트
  const artByRow: Record<number, string> = useMemo(() => {
    const out: Record<number, string> = {};
    for (const p of players) {
      if (p.photoUrl.trim()) out[p.excelRow] = p.photoUrl.trim();
    }
    return out;
  }, [players]);

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
      if (!confirm(`마지막 덱이라 삭제 대신 '${deck.name}' 내용을 비웁니다. 계속할까요?`)) return;
      const fresh = blankDeck(deck.name);
      patchDeck({ players: fresh.players, chem: fresh.chem, flags: fresh.flags, yearInputs: fresh.yearInputs });
      setSelected(null);
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

  const importExcel = async (f: File | undefined) => {
    if (!f) return;
    // 흔한 오선택 먼저 걸러내기 (엑셀 잠금파일·JSON을 엑셀 버튼으로 여는 경우)
    if (f.name.startsWith("~$")) {
      alert("엑셀 잠금파일(~$)입니다. 엑셀이 열려 있을 때 생기는 임시파일이니, 원본 .xlsx 파일을 닫지 않은 채로 다시 선택해주세요.");
      return;
    }
    if (/\.json$/i.test(f.name)) {
      alert("JSON 덱 파일은 '가져오기'로 여세요. '엑셀 가져오기'는 덱관리 .xlsx/.xlsm 전용입니다.");
      return;
    }
    try {
      const d = await parseExcelDeck(f);
      addDeckData(
        { id: "", name: d.name, updatedAt: 0, players: d.players, chem: d.chem, flags: d.flags, yearInputs: d.yearInputs },
        d.name,
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("NO_LINEUP_SHEET")) {
        const sheets = e.message.slice("NO_LINEUP_SHEET:".length);
        alert(sheets
          ? `라인업 시트를 못 찾았습니다. 이 파일의 시트: ${sheets}\n덱관리 엑셀 원본(.xlsx)의 '라인업' 시트가 있는 파일을 선택해주세요.`
          : "라인업 시트가 없는 파일입니다. 덱관리 엑셀 원본을 선택해주세요.");
      } else {
        alert("엑셀을 읽지 못했습니다.");
      }
    }
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
        skills: (p.skills ?? ["", "", "", ""]).map((s) =>
          migrateSkillName(p.kind, s)) as [string, string, string, string],
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
        <div className="topbar-actions">
          <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="테마 전환">
            {theme === "dark" ? "☀️ 라이트" : "🌙 다크"}
          </button>
          <button onClick={() => setModal("inquiry")}>✉️ 문의하기</button>
          <button onClick={() => setModal("notices")}>📢 공지사항</button>
        </div>
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
          <button onClick={() => xlRef.current?.click()}>엑셀 가져오기</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => { importDeck(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={xlRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }}
            onChange={(e) => { importExcel(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="muted">덱은 이 브라우저에만 저장됩니다 — 남이 내 덱을 볼 수 없고, 나도 남 덱을 못 봅니다. 기기 이동은 내보내기→가져오기로.</p>
      </div>

      <div className="tabs">
        {(["lineup", "skills", "ranking", "news"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ lineup: "라인업", skills: "스킬비교", ranking: "덱랭킹", news: "정보글" }[t]}
          </button>
        ))}
      </div>

      {tab === "lineup" && (
        <div className="lineup-layout">
          <div>
            <LineupView
              batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes}
              onSelect={setSelected} art={artByRow}
            />
            <ChemPanel
              chem={chem} setChem={(c) => patchDeck({ chem: c })}
            />
          </div>
          <aside>
            <DeckScorePanel
              flags={flags} toggleFlag={(k) => patchDeck({ flags: { ...flags, [k]: !flags[k] } })}
              setRowSide={(region, row, side) => pickRowSide(region, row, side)}
              yearInputs={yearInputs} setYearInput={(r, v) => patchDeck({ yearInputs: { ...yearInputs, [r]: v } })}
            />
          </aside>
        </div>
      )}

      {tab === "news" && <NewsTab />}

      {tab === "skills" && (
        <>
          <SkillCompare tables={tables} />
          <SkillPanel tables={tables} setTables={setTables} />
          <TableEditor tables={tables} setTables={setTables} />
        </>
      )}

      {tab === "ranking" && (
        <>
          <SharePanel
            decks={decks} tables={tables} activeId={deck.id}
            onSelectDeck={(id) => { setActiveId(id); setSelected(null); }}
            onImportDeck={(d) => addDeckData(d, "공유받은 덱")}
            onPreviewDeck={(d) => setPreview(d)}
          />
          <ResultPanel batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes} />
        </>
      )}

      {modal === "inquiry" && <InquiryModal close={() => setModal(null)} />}
      {modal === "notices" && <PatchNotesModal close={() => setModal(null)} />}
      {preview && <DeckPreviewModal deck={preview} tables={tables} close={() => setPreview(null)} />}

      {selPlayer && selRes && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <PlayerEditor
              p={selPlayer}
              res={selRes}
              update={(patch) => update(selPlayer.excelRow, patch)}
              close={() => setSelected(null)}
              tables={tables}
            />
          </div>
        </div>
      )}

      <p className="muted">카드 일러스트: 자체 제작 · 점수는 랭대 공격 기준</p>
    </div>
  );
}
