import { useEffect, useMemo, useRef, useState } from "react";
import type { Kind, PlayerInput, SkillTables } from "./lib/engine";
import { deckPlayerResults, flagDefaults, migrateSkillName } from "./lib/engine";
import type { Deck } from "./lib/deck";
import { DEFAULT_CHEM, LINEUP, YEAR_ANCHOR, blankPlayer, newId, normalizeDeck, normalizeRoster, resizeBullpen } from "./lib/deck";
import { DEFAULT_TACTICS, ROLE_LIMITS, bullpenCounts, bullpenRole } from "./lib/bullpen";
import type { BullpenRole } from "./lib/bullpen";
import { BullpenControls } from "./components/BullpenControls";
import { readStoredDecks } from "./lib/deckStorage";
import { applyDeckUpdate } from "./lib/playerUpdates";
import { DeckSaveModal } from "./components/DeckSaveModal";
import { passwordError, passwordResult, validDeckName, type PasswordCredential } from "./lib/deckPassword";
import { getClientId, supabase } from "./lib/supabase";
import { LineupTable } from "./components/LineupTable";
import { LineupView } from "./components/LineupView";
import { PlayerEditor } from "./components/PlayerEditor";
import { ChemPanel, DeckScorePanel } from "./components/DeckPanel";
import { SkillCompare, SkillPanel } from "./components/SkillPanel";
import { TableEditor } from "./components/TableEditor";
import { NewsTab } from "./components/NewsTab";
import { SharePanel } from "./components/SharePanel";
import { ResultPanel } from "./components/ResultPanel";
import { InquiryModal } from "./components/InquiryModal";
import { PatchNotesModal } from "./components/PatchNotesModal";
import { ScoreGuideModal } from "./components/ScoreGuideModal";
import { DeckPreviewModal } from "./components/DeckPreview";
import { parseExcelDeck } from "./lib/excelImport";
import { deckSig, rankArgs, useRankSync } from "./lib/rankSync";
import { buildBundle, parseDeckFile, withRank } from "./lib/deckFile";
import "./styles.css";

const DECKS_KEY = "rivals-decks-v1";
const RECOVERY_KEY = "rivals-decks-recovery-v1";
const TABLES_KEY = "rivals-tables-v1";
const THEME_KEY = "rivals-theme";
const LEGACY_KEY = "rivals-deck-v2";

function blankDeck(name: string, legacyDefaults = false): Deck {
  return {
    id: newId(),
    name,
    updatedAt: Date.now(),
    players: LINEUP.map((l) => blankPlayer(l.row, l.kind, l.pos, l.order)),
    chem: legacyDefaults ? { ...DEFAULT_CHEM } : { commander: "X", catcher: "X", pitchChem: "X", batChem: "X", wbcP: "X", wbcB: "X" },
    flags: legacyDefaults ? flagDefaults() : {},
    yearInputs: Object.fromEntries(Object.values(YEAR_ANCHOR).map((r) => [r, ""])) as Deck["yearInputs"],
    bullpenTactics: { ...DEFAULT_TACTICS },
  };
}

function loadDecks(): { decks: Deck[]; activeId: string; recovery: string | null } {
  let recovery: string | null = null;
  try {
    recovery = localStorage.getItem(RECOVERY_KEY);
    const raw = localStorage.getItem(DECKS_KEY);
    const legacy = raw === null ? localStorage.getItem(LEGACY_KEY) : null;
    const source = raw ?? legacy;
    if (source) {
      const restored = readStoredDecks(source, raw === null);
      if (restored.damaged) recovery = source;
      if (restored.decks.length) {
        const activeId = restored.decks.some(d => d.id === restored.activeId) ? restored.activeId! : restored.decks[0].id;
        return { decks: restored.decks, activeId, recovery };
      }
    }
  } catch {
    // 저장소 접근 실패 시에도 빈 덱으로 화면은 열 수 있다.
  }
  const d = blankDeck("");
  return { decks: [d], activeId: d.id, recovery };
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
  const [recovery, setRecovery] = useState(boot.recovery);
  const [storageError, setStorageError] = useState("");
  const [decks, setDecks] = useState<Deck[]>(boot.decks);
  const [activeId, setActiveId] = useState(boot.activeId);
  const [tables, setTables] = useState<SkillTables>(loadTables);
  const [selected, setSelected] = useState<number | null>(null);
  const [lineupMode, setLineupMode] = useState<"illustration" | "table">("illustration");
  const [tab, setTab] = useState<"lineup" | "skills" | "ranking" | "news">(() => /#d=([A-Za-z0-9\-_]+)/.test(window.location.hash) ? "ranking" : "lineup");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [modal, setModal] = useState<"inquiry" | "patch" | "guide" | null>(null);
  const [preview, setPreview] = useState<Deck | null>(null);
  const { links, setLinks, status, code } = useRankSync(decks, tables);
  const [saveOpen, setSaveOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const xlRef = useRef<HTMLInputElement>(null);

  const deck = decks.find((d) => d.id === activeId) ?? decks[0];
  const { players, chem, flags, yearInputs } = deck;
  const activeLink = Object.values(links).some((l) => l.deckId === deck.id);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* 덱 저장 경고에서 안내 */ }
  }, [theme]);

  useEffect(() => {
    try {
      // 백업에 실패하면 현재 저장본을 덮어쓰지 않는다.
      if (recovery !== null) localStorage.setItem(RECOVERY_KEY, recovery);
      localStorage.setItem(DECKS_KEY, JSON.stringify({ decks: decks.filter((d) => validDeckName(d.name)), activeId }));
      setStorageError("");
    } catch {
      setStorageError("기기 저장 공간에 기록하지 못했습니다. 덱 파일을 내보내 변경 내용을 보관하세요.");
    }
  }, [decks, activeId, recovery]);

  useEffect(() => {
    try { localStorage.setItem(TABLES_KEY, JSON.stringify(tables)); }
    catch { setStorageError("스킬 점수 설정을 기기에 저장하지 못했습니다. 저장 공간을 확인하세요."); }
  }, [tables]);

  // ESC로 팝업 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setModal(null);
        setPreview(null);
        setSaveOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => deckPlayerResults(deck, tables), [deck, tables]);

  const patchDeck = (patch: Partial<Deck>) =>
    setDecks((prev) => prev.map((d) => (d.id === deck.id ? { ...applyDeckUpdate(d, patch, tables), updatedAt: Date.now() } : d)));

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

  const update = (excelRow: number, p: Partial<PlayerInput>) => {
    const current = players.find((x) => x.excelRow === excelRow);
    if (p.bullpenRole && current && p.bullpenRole !== bullpenRole(current) && bullpenCounts(players)[p.bullpenRole] >= ROLE_LIMITS[p.bullpenRole]) return;
    patchDeck({ players: normalizeRoster(players.map((x) => (x.excelRow === excelRow ? { ...x, ...p } : x))) });
  };

  const setBullpenCount = (role: BullpenRole, count: number) => {
    const next = resizeBullpen(players, role, count);
    const removed = players.filter((p) => p.name.trim() && !next.some((n) => n.excelRow === p.excelRow));
    if (removed.length && !confirm(`${removed.map((p) => p.name).join(", ")} 선수를 불펜에서 제외할까요?`)) return;
    patchDeck({ players: next });
    if (selected !== null && !next.some((p) => p.excelRow === selected)) setSelected(null);
  };

  const selPlayer = selected === null ? null : players.find((p) => p.excelRow === selected) ?? null;
  const selRes = selPlayer ? results[players.indexOf(selPlayer)] : null;

  const newDeck = () => {
    const draft = decks.find((d) => !validDeckName(d.name));
    if (draft) { setActiveId(draft.id); setSaveOpen(true); return; }
    const d = blankDeck("");
    setDecks([...decks, d]);
    setActiveId(d.id);
    setSelected(null);
    setSaveOpen(true);
  };
  const renameDeck = () => {
    setSaveOpen(true);
  };
  const saveDeck = async (name: string, password: string, publish: boolean) => {
    if (!validDeckName(name)) throw new Error("덱 이름을 입력하세요.");
    const named = { ...deck, name: name.trim(), updatedAt: Date.now() };
    setDecks((prev) => prev.map((d) => d.id === named.id ? named : d));
    if (!supabase || !publish) return;
    const existing = Object.entries(links).find(([, l]) => l.deckId === named.id);
    try {
      const { args } = rankArgs(named, tables);
      if (existing?.[1].password) {
        const { data, error } = await supabase.rpc("update_ranking_password", { p_id: existing[0], p_token: existing[1].token, ...args });
        if (error) throw error;
        if (!data) throw new Error("ownership_required");
        setLinks((prev) => ({ ...prev, [existing[0]]: { ...existing[1], sig: deckSig(args) } }));
      } else {
        const { data, error } = await supabase.rpc("save_ranking_password", {
          p_client_id: getClientId(), p_deck_id: named.id, p_password: password, ...args,
          p_existing_id: existing?.[0] ?? null, p_token: existing?.[1].token ?? null, p_code: existing?.[1].owned ? code : null,
        });
        if (error) throw error;
        const r = passwordResult(data);
        setLinks((prev) => ({ ...prev, [r.id]: { deckId: named.id, token: r.token, password: true, sig: deckSig(args) } }));
      }
      window.dispatchEvent(new Event("rivals:ranking-updated"));
    } catch (e) { throw new Error(`이 기기에 저장했습니다. ${passwordError(e)}`); }
  };
  const deleteDeck = () => {
    if (decks.length <= 1) {
      if (!confirm(`마지막 덱이라 삭제 대신 '${deck.name}' 내용을 비웁니다. 계속할까요?`)) return;
      const fresh = blankDeck(deck.name);
      patchDeck({ players: fresh.players, chem: fresh.chem, flags: fresh.flags, yearInputs: fresh.yearInputs, bullpenTactics: fresh.bullpenTactics });
      setSelected(null);
      return;
    }
    if (!confirm(`'${deck.name}' 삭제할까요?`)) return;
    const rest = decks.filter((d) => d.id !== deck.id);
    setDecks(rest);
    setActiveId(rest[0].id);
    setSelected(null);
  };
  const download = (name: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // 랭킹 연동 덱은 다른 기기에서 같은 행을 갱신할 수 있게 id·토큰을 파일에만 담는다
  const exportDeck = () => { if (!validDeckName(deck.name)) { setSaveOpen(true); return; } download(deck.name, withRank(deck, links)); };
  const exportAll = () => { if (!validDeckName(deck.name)) { setSaveOpen(true); return; } download("내 덱 전체", buildBundle(decks.filter((d) => validDeckName(d.name)), links)); };
  const importDeck = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let entries: ReturnType<typeof parseDeckFile> = [];
      try {
        entries = parseDeckFile(JSON.parse(String(rd.result)));
      } catch {
        // 아래에서 형식 오류로 안내
      }
      if (!entries.length) {
        alert("덱 파일 형식이 아닙니다.");
        return;
      }
      const added = entries.map(({ deck: d, rank }) => ({ nd: buildDeck(d, "가져온 덱"), rank }));
      setDecks((prev) => [...prev, ...added.map((a) => a.nd)]);
      setActiveId(added[0].nd.id);
      setSelected(null);
      const linked = added.filter((a) => a.rank);
      if (linked.length) {
        // 가져온 상태를 이미 반영된 것으로 표시(옛 파일이 서버 최신본을 덮지 않게) — 이후 로컬 수정만 반영
        setLinks((prev) => {
          const next = { ...prev };
          for (const { nd, rank } of linked) {
            next[rank!.id] = { token: rank!.token, ...(rank!.password ? { password: true } : {}), deckId: nd.id, sig: deckSig(rankArgs(nd, tables).args) };
          }
          return next;
        });
      }
      if (added.length > 1 || linked.length) {
        alert(`덱 ${added.length}개를 가져왔습니다${linked.length ? ` (랭킹 연동 ${linked.length}개)` : ""}.`);
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

  // 가져온 덱 데이터로 새 덱 만들기 (새 id, 선수 정규화). rank 같은 파일 전용 키는 parseDeckFile에서 이미 제거됨
  const buildDeck = (d: Deck, fallbackName: string): Deck => normalizeDeck({
    ...blankDeck(d.name || fallbackName),
    ...d,
    players: d.players,
    id: newId(),
    updatedAt: Date.now(),
  });
  // 내 덱 코드로 서버에서 불러온 글: 새 로컬 덱 + 소유 연결 (sig 선반영 → 복원만으로는 서버에 쓰지 않음)
  const restoreDeck = (d: Deck, rowId: string, credential: PasswordCredential) => {
    const nd = buildDeck(d, "불러온 덱");
    const currentId = links[rowId]?.deckId;
    if (currentId && decks.some((x) => x.id === currentId)) nd.id = currentId;
    setDecks((prev) => prev.some((x) => x.id === nd.id) ? prev.map((x) => x.id === nd.id ? nd : x) : [...prev, nd]);
    setActiveId(nd.id);
    setLinks((prev) => ({ ...prev, [rowId]: { deckId: nd.id, ...credential, sig: deckSig(rankArgs(nd, tables).args) } }));
  };
  const addDeckData = (d: unknown, fallbackName: string) => {
    const entry = parseDeckFile(d)[0];
    if (!entry) {
      alert("덱 형식이 아닙니다.");
      return;
    }
    const nd = buildDeck(entry.deck, fallbackName);
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
          <button onClick={() => setModal("guide")}>🧮 산정방식</button>
          <button onClick={() => setModal("patch")}>📢 공지사항</button>
        </div>
      </header>

      {recovery !== null && <div className="card" role="status">
        <p>읽을 수 없는 저장 항목이 있어 정상 덱만 복원했습니다. 원본은 별도로 보관하며 아래에서 내려받을 수 있습니다.</p>
        <div className="row"><button onClick={() => {
          const url = URL.createObjectURL(new Blob([recovery], { type: "application/json" }));
          const a = document.createElement("a"); a.href = url; a.download = "덱-복구용-원본.json"; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>복구용 원본 다운로드</button><button onClick={() => {
          if (!confirm("복구용 원본 백업을 삭제할까요? 필요한 경우 먼저 다운로드하세요.")) return;
          try { localStorage.removeItem(RECOVERY_KEY); setRecovery(null); } catch { setStorageError("백업을 삭제하지 못했습니다."); }
        }}>백업 삭제</button></div>
      </div>}
      {storageError && <p className="bad" role="alert">{storageError}</p>}
      <div className="card toolbar">
        <div className="row">
          <label>내 덱{" "}
            <select value={deck.id} onChange={(e) => { setActiveId(e.target.value); setSelected(null); }}>
              {decks.map((d) => <option key={d.id} value={d.id}>{d.name || "이름 없는 덱 · 저장 전"}</option>)}
            </select>
          </label>
          <button onClick={newDeck}>+ 새 덱</button>
          <button className="primary" onClick={() => setSaveOpen(true)}>덱 저장</button>
          <button onClick={renameDeck}>이름변경</button>
          <button onClick={deleteDeck}>삭제</button>
          <button onClick={exportDeck}>내보내기</button>
          <button onClick={exportAll} title="모든 덱을 파일 하나로 (랭킹 연동 정보 포함)">전체 내보내기</button>
          <button onClick={() => fileRef.current?.click()}>가져오기</button>
          <button onClick={() => xlRef.current?.click()}>엑셀 가져오기</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => { importDeck(e.target.files?.[0]); e.target.value = ""; }} />
          {activeLink && (
            <span className={`pill ${status === "error" ? "bad-pill" : status === "ok" ? "" : "pill-idle"}`}>
              🏆 랭킹 연동{status === "syncing" ? " · 반영 중…" : status === "ok" ? " · 방금 반영됨" : status === "error" ? " · 반영 실패(다음 수정 때 재시도)" : ""}
            </span>
          )}
          <input ref={xlRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }}
            onChange={(e) => { importExcel(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="muted">{validDeckName(deck.name) ? "변경사항은 자동 저장되며, 랭킹에 연결된 덱은 수정 즉시 같은 글에 반영됩니다." : "덱 이름을 정하고 ‘덱 저장’을 눌러야 저장됩니다. 이름 없는 덱은 새로고침하면 사라집니다."} 다른 기기에서는 덱랭킹의 가져오기에서 비밀번호를 입력하세요.</p>
        <p className="muted">내보낸 파일에는 랭킹 수정 권한(비밀 토큰)이 들어 있어요 — 다른 사람에게 보내지 마세요.</p>
      </div>

      <div className="tabs">
        {(["lineup", "skills", "ranking", "news"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ lineup: "라인업", skills: "스킬비교", ranking: "덱랭킹", news: "정보글" }[t]}
          </button>
        ))}
      </div>

      {tab === "lineup" && <>
        <div className="lineup-view-bar"><span>라인업 보기</span><div role="group" aria-label="라인업 보기 방식">
          <button aria-pressed={lineupMode === "illustration"} onClick={() => setLineupMode("illustration")}>일러스트</button>
          <button aria-pressed={lineupMode === "table"} onClick={() => setLineupMode("table")}>표 보기</button>
        </div></div>
        {lineupMode === "table" ? <>
          <LineupTable deck={deck} results={results} onSelect={setSelected} />
          <details className="card sheet-settings"><summary>불펜 배치 · 투수 전술 변경</summary>
            <BullpenControls players={players} tactics={deck.bullpenTactics} setCount={setBullpenCount}
              setTactics={(bullpenTactics) => patchDeck({ bullpenTactics })} />
          </details>
          <div className="sheet-settings-grid">
            <details className="card sheet-settings"><summary>팀 버프 · 케미스트리 변경</summary><ChemPanel chem={chem} setChem={chem => patchDeck({ chem })} /></details>
            <details className="card sheet-settings"><summary>팀덱코 · 스페셜 덱코 변경</summary><DeckScorePanel flags={flags}
              toggleFlag={k => patchDeck({ flags: { ...flags, [k]: !flags[k] } })} setRowSide={pickRowSide}
              yearInputs={yearInputs} setYearInput={(r, v) => patchDeck({ yearInputs: { ...yearInputs, [r]: v } })} /></details>
          </div>
        </> : <div className="lineup-layout"><div>
          <LineupView players={players} results={results} onSelect={setSelected}
            bullpenControls={<BullpenControls players={players} tactics={deck.bullpenTactics} setCount={setBullpenCount}
              setTactics={(bullpenTactics) => patchDeck({ bullpenTactics })} />} />
          <ChemPanel chem={chem} setChem={chem => patchDeck({ chem })} />
        </div><aside><DeckScorePanel flags={flags}
          toggleFlag={k => patchDeck({ flags: { ...flags, [k]: !flags[k] } })} setRowSide={pickRowSide}
          yearInputs={yearInputs} setYearInput={(r, v) => patchDeck({ yearInputs: { ...yearInputs, [r]: v } })} /></aside></div>}
        <details className="card"><summary>선수별 점수와 덱코 상세 보기</summary><ResultPanel players={players} results={results} /></details>
      </>}

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
            links={links} setLinks={setLinks} code={code} onRestoreDeck={(d, id, credential) => { restoreDeck(d, id, credential); setTab("lineup"); }} onSaveDeck={() => setSaveOpen(true)}
            onImportDeck={(d) => { addDeckData(d, "공유받은 덱"); setTab("lineup"); }}
            onPreviewDeck={(d) => setPreview(d)}
          />
        </>
      )}

      {modal === "inquiry" && <InquiryModal close={() => setModal(null)} />}
      {modal === "guide" && <ScoreGuideModal close={() => setModal(null)} />}
      {modal === "patch" && <PatchNotesModal close={() => setModal(null)} />}
      {preview && <DeckPreviewModal deck={preview} tables={tables} close={() => setPreview(null)} />}
      {saveOpen && <DeckSaveModal key={deck.id} initialName={deck.name} remote={!!supabase} linked={activeLink}
        needsPassword={!!supabase && !Object.values(links).some((l) => l.deckId === deck.id && l.password)}
        save={saveDeck} close={() => setSaveOpen(false)} />}

      {selPlayer && selRes && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <PlayerEditor
              p={selPlayer}
              res={selRes}
              update={(patch) => update(selPlayer.excelRow, patch)}
              close={() => setSelected(null)}
              tables={tables}
              bullpenCounts={bullpenCounts(players)}
            />
          </div>
        </div>
      )}

      <p className="muted">카드 일러스트: 자체 제작 · 점수는 랭대 공격 기준</p>
    </div>
  );
}
