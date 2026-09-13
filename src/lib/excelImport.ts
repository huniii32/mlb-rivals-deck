import * as XLSX from "xlsx";
import type { Chem, Kind, PlayerInput } from "./engine";
import { flagDefaults } from "./engine";

export interface ExcelDeckData {
  name: string;
  players: PlayerInput[];
  chem: Chem;
  flags: Record<string, boolean>;
  yearInputs: Record<number, number | "">;
}

// 엑셀 '라인업' 시트 열 매핑 (260910 기준)
// C 타순, D 카드, E 선수, F 연도, G/H/I 최종(수동), K-N 스킬1-4,
// S/U 기본, V/X 훈련, Y/AA 특훈, AB 초월Lv, AF 강화Lv, AJ 포훈Lv,
// AN/AP 포지션훈련, AQ 스킬보너스(상시+3라 무시),
// AU/AV 팀덱코 좌/우, AY/AZ 스덱코 좌/우, AZ33/35/37 연도입력, O2-O7 케미
const BATTER_ROWS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
const PITCHER_ROWS = [22, 23, 24, 25, 26, 27, 28, 29, 30];
const FALLBACK_POS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH",
  "SP1", "SP2", "SP3", "SP4", "SP5", "RP1", "RP2", "RP3", "CP1"];

type Cell = { t?: string; v?: unknown; f?: unknown };

function num(c: Cell | undefined, noFormula = false): number | "" {
  if (!c || c.t !== "n" || typeof c.v !== "number") return "";
  if (noFormula && c.f) return "";
  return c.v as number;
}

function str(c: Cell | undefined): string {
  if (!c || c.v === undefined || c.v === null) return "";
  if (c.t === "s" || c.t === "str") return String(c.v);
  if (c.t === "n") return String(c.v);
  return "";
}

function blank(excelRow: number, kind: Kind, pos: string): PlayerInput {
  return {
    excelRow, kind, pos, order: "",
    card: "", name: "", team: "", year: "", enName: "", photoUrl: "",
    base: ["", "", ""], train: ["", "", ""], spec: ["", "", ""],
    transLv: "", enhLv: "", pohLv: "",
    extra: ["", "", ""],
    synergy: ["", "", ""],
    locker: ["", "", ""],
    skillB: true,
    skills: ["", "", "", ""],
    finalOv: ["", "", ""],
  };
}

/** 덱관리 엑셀(.xlsx) → 덱 데이터. 능력치·스킬·덱코입력을 그대로 읽는다. */
export async function parseExcelDeck(file: File): Promise<ExcelDeckData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["라인업"];
  if (!sheet) throw new Error("NO_LINEUP_SHEET");
  const at = (col: string, row: number): Cell | undefined =>
    (sheet[`${col}${row}`] as Cell | undefined) ?? undefined;

  const players: PlayerInput[] = [];
  [...BATTER_ROWS.map((r) => ({ r, kind: "batter" as Kind })),
   ...PITCHER_ROWS.map((r) => ({ r, kind: "pitcher" as Kind }))].forEach(({ r, kind }, i) => {
    const isB = kind === "batter";
    const p = blank(r, kind, str(at("B", r)) || FALLBACK_POS[i]);
    const o = num(at("C", r));
    p.order = isB ? o : "";
    p.card = str(at("D", r));
    p.name = str(at("E", r));
    p.year = num(at("F", r));
    p.base = [num(at("S", r)), num(at("T", r)), isB ? num(at("U", r)) : ""];
    p.train = [num(at("V", r)), num(at("W", r)), isB ? num(at("X", r)) : ""];
    p.spec = [num(at("Y", r)), num(at("Z", r)), isB ? num(at("AA", r)) : ""];
    p.transLv = num(at("AB", r));
    p.enhLv = num(at("AF", r));
    p.pohLv = num(at("AJ", r));
    p.extra = [num(at("AN", r)), num(at("AO", r)), isB ? num(at("AP", r)) : ""];
    p.skills = [str(at("K", r)), str(at("L", r)), str(at("M", r)), str(at("N", r))];
    // G/H/I: 직접 친 숫자만 수동최종으로 (수식은 자동계산 표시라 제외,
    // 전행 1,1,1은 템플릿 기본값이라 제외 — 실제 스탯은 60+라 1이 나올 수 없음)
    const g = num(at("G", r), true);
    const h = num(at("H", r), true);
    const iv = isB ? num(at("I", r), true) : "";
    const placeholder = isB
      ? g === 1 && h === 1 && iv === 1
      : g === 1 && h === 1 && (iv === "" || iv === 1);
    p.finalOv = placeholder ? ["", "", ""] : [g, h, iv];
    players.push(p);
  });

  const chemKeys: (keyof Chem)[] = ["commander", "catcher", "pitchChem", "batChem", "wbcP", "wbcB"];
  const chemFallback: Record<keyof Chem, string> =
    { commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1" };
  const chem = { ...chemFallback };
  chemKeys.forEach((k, i) => {
    const v = str(at("O", 2 + i));
    if (v) chem[k] = v;
  });

  const flags = flagDefaults();
  for (let r = 10; r <= 38; r++) {
    flags[`${r}-team-L`] = str(at("AU", r)) === "O";
    flags[`${r}-team-R`] = str(at("AV", r)) === "O";
    flags[`${r}-spec-L`] = str(at("AY", r)) === "O";
    flags[`${r}-spec-R`] = str(at("AZ", r)) === "O";
  }

  const yearInputs: Record<number, number | ""> = { 33: "", 35: "", 37: "" };
  for (const r of [33, 35, 37]) yearInputs[r] = num(at("AZ", r));

  const name = file.name.replace(/\.(xlsx|xlsm|xls)$/i, "").slice(0, 30) || "엑셀 덱";
  return { name, players, chem, flags, yearInputs };
}
