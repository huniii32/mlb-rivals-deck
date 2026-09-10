import { useEffect, useMemo, useState } from "react";
import type { Chem, Kind, PlayerInput, SkillTables } from "./lib/engine";
import { calcPlayer, flagDefaults } from "./lib/engine";
import type { PhotoInfo } from "./lib/photos";
import { searchPhoto } from "./lib/photos";
import { PlayerTable } from "./components/PlayerTable";
import { LineupView } from "./components/LineupView";
import { DeckPanel } from "./components/DeckPanel";
import { SkillPanel } from "./components/SkillPanel";
import { PhotoSettings } from "./components/PhotoSettings";
import { ResultPanel } from "./components/ResultPanel";
import "./styles.css";

const KEY = "rivals-deck-v2";

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
    card: "", name: "", year: "", enName: "", photoUrl: "",
    base: ["", "", ""], train: ["", "", ""], spec: ["", "", ""],
    transLv: "", enhLv: "", pohLv: "",
    extra: ["", "", ""],
    skillB: false,
    skills: ["", "", "", ""],
    finalOv: ["", "", ""],
  };
}

interface State {
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
  tables: SkillTables;
}

function defaultState(): State {
  return {
    players: [
      ...BATTER_DEF.map(([r, pos, o]) => blankPlayer(r, "batter", pos, o)),
      ...PITCHER_DEF.map(([r, pos]) => blankPlayer(r, "pitcher", pos, "")),
    ],
    chem: { commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1" },
    flags: flagDefaults(),
    yearInputs: { 33: "", 35: "", 37: "" },
    tables: { overrides: {}, customs: [] },
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw) as State;
    const d = defaultState();
    return {
      players: Array.isArray(s.players) && s.players.length === 18
        ? s.players.map((p) => ({ ...p, enName: p.enName ?? "", photoUrl: p.photoUrl ?? "" }))
        : d.players,
      chem: { ...d.chem, ...(s.chem || {}) },
      flags: { ...d.flags, ...(s.flags || {}) },
      yearInputs: { ...d.yearInputs, ...(s.yearInputs || {}) },
      tables: s.tables || d.tables,
    };
  } catch {
    return defaultState();
  }
}

type Tab = "lineup" | "batter" | "pitcher" | "deck" | "skills" | "result";

export default function App() {
  const [boot] = useState(load);
  const [players, setPlayers] = useState(boot.players);
  const [chem, setChem] = useState(boot.chem);
  const [flags, setFlags] = useState(boot.flags);
  const [yearInputs, setYearInputs] = useState(boot.yearInputs);
  const [tables, setTables] = useState(boot.tables);
  const [tab, setTab] = useState<Tab>("lineup");
  const [photoCache, setPhotoCache] = useState<Record<string, PhotoInfo | null>>(() => {
    try {
      return JSON.parse(localStorage.getItem("rivals-photos-v1") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ players, chem, flags, yearInputs, tables }));
  }, [players, chem, flags, yearInputs, tables]);

  useEffect(() => {
    localStorage.setItem("rivals-photos-v1", JSON.stringify(photoCache));
  }, [photoCache]);

  // 영문명이 있는데 캐시에 없으면 Commons 조회
  useEffect(() => {
    const targets = players.filter(
      (p) => !p.photoUrl.trim() && p.enName.trim() && photoCache[p.enName.trim().toLowerCase()] === undefined,
    );
    if (!targets.length) return;
    let alive = true;
    (async () => {
      for (const t of targets) {
        const key = t.enName.trim().toLowerCase();
        try {
          const hit = await searchPhoto(t.enName);
          if (alive) setPhotoCache((c) => (c[key] === undefined ? { ...c, [key]: hit } : c));
        } catch {
          if (alive) setPhotoCache((c) => (c[key] === undefined ? { ...c, [key]: null } : c));
        }
      }
    })();
    return () => { alive = false; };
  }, [players, photoCache]);

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

  const update = (excelRow: number, patch: Partial<PlayerInput>) =>
    setPlayers(players.map((p) => (p.excelRow === excelRow ? { ...p, ...patch } : p)));

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
      else if (p.enName.trim()) {
        const hit = photoCache[p.enName.trim().toLowerCase()];
        if (hit) out[p.excelRow] = hit;
      }
    }
    return out;
  }, [players, photoCache]);

  return (
    <div className="wrap">
      <h1>Rivals Deck <span className="muted">— 9이닝스 라이벌즈 덱관리 (랭대 공격 기준)</span></h1>
      <div className="tabs">
        {(["lineup", "batter", "pitcher", "deck", "skills", "result"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ lineup: "라인업", batter: "타자입력", pitcher: "투수입력", deck: "케미·덱코", skills: "스킬점수", result: "결과" }[t]}
          </button>
        ))}
      </div>
      {tab === "lineup" && (
        <LineupView batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes} gotoInput={setTab} photos={photosByRow} />
      )}
      {tab === "batter" && (
        <>
          <PlayerTable title="타자 (최종 육성값: 파워·정확·선구)" kind="batter" rows={batters} results={bRes} update={update} customNames={customNames.batter} />
          <PhotoSettings rows={batters} update={update} photos={photosByRow} />
        </>
      )}
      {tab === "pitcher" && (
        <>
          <PlayerTable title="투수 (최종 육성값: 변화·구위)" kind="pitcher" rows={pitchers} results={pRes} update={update} customNames={customNames.pitcher} />
          <PhotoSettings rows={pitchers} update={update} photos={photosByRow} />
        </>
      )}
      {tab === "deck" && (
        <DeckPanel
          chem={chem} setChem={setChem}
          flags={flags} toggleFlag={(k) => setFlags({ ...flags, [k]: !flags[k] })}
          yearInputs={yearInputs} setYearInput={(r, v) => setYearInputs({ ...yearInputs, [r]: v })}
        />
      )}
      {tab === "skills" && <SkillPanel tables={tables} setTables={setTables} />}
      {tab === "result" && (
        <ResultPanel batters={batters} pitchers={pitchers} bRes={bRes} pRes={pRes} tables={tables} customNames={customNames} />
      )}
    </div>
  );
}
