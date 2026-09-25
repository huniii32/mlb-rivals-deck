import * as XLSX from "xlsx";
import type { Chem, PlayerInput } from "./engine";
import { flagDefaults } from "./engine";
import { DEFAULT_CHEM, LINEUP, YEAR_ANCHOR, blankPlayer } from "./deck";

interface ExcelDeckData {
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
const BATTERS = LINEUP.filter((l) => l.kind === "batter");
const PITCHERS = LINEUP.filter((l) => l.kind === "pitcher");

// 라인업 화면·덱코 규칙·포훈표는 전부 이 18개 라벨을 키로 쓴다. 사용자 엑셀의 B열
// 자유서식 텍스트(우익수/RF(우)/공백 등)를 그대로 pos로 쓰면 다이아몬드·포훈표 매칭이
// 깨져 "포지션이 밀린 것처럼" 보인다 → 정규화만 하고 캐노니컬 라벨은 항상 LINEUP.pos로 고정.
const POS_ALIAS: Record<string, string> = {
  "포수": "C", "1루수": "1B", "2루수": "2B", "3루수": "3B", "유격수": "SS",
  "좌익수": "LF", "중견수": "CF", "우익수": "RF", "지명타자": "DH", "지타": "DH",
  "선발1": "SP1", "선발2": "SP2", "선발3": "SP3", "선발4": "SP4", "선발5": "SP5",
  "구원1": "RP1", "구원2": "RP2", "구원3": "RP3", "마무리": "CP1", "CP": "CP1",
};

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

function canonPos(raw: string): string {
  const k = raw.replace(/\s+/g, "").toUpperCase();
  return POS_ALIAS[raw.replace(/\s+/g, "")] ?? POS_ALIAS[k] ?? k;
}

/** 기대 행에서 라벨이 하나도 안 맞으면, 위/아래로 몇 칸 밀렸는지 찾아본다.
 *  (사용자 엑셀에 행 삽입/삭제가 있어도 실제 스탯은 밀린 행에서 정확히 읽도록) */
function blockOffset(
  at: (col: string, row: number) => Cell | undefined,
  block: typeof LINEUP,
): number {
  const score = (k: number) =>
    block.filter((l) => canonPos(str(at("B", l.row + k))) === l.pos).length;
  if (score(0) === block.length) return 0;
  let best = 0;
  let bestScore = score(0);
  for (const k of [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
    const s = score(k);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  return bestScore >= 5 ? best : 0;
}

/** 시트명 변형(공백·대소문자·한영)까지 잡는 라인업 시트 탐색. */
function findLineupSheetName(wb: XLSX.WorkBook): string | undefined {
  const names = wb.SheetNames ?? [];
  const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();
  return names.find((n) => norm(n) === "라인업")
    ?? names.find((n) => norm(n).includes("라인업"))
    ?? names.find((n) => norm(n) === "lineup")
    ?? names.find((n) => norm(n).includes("lineup"));
}

/** 덱관리 엑셀(.xlsx) → 덱 데이터. 능력치·스킬·덱코입력을 그대로 읽는다. */
export async function parseExcelDeck(file: File): Promise<ExcelDeckData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const lineupName = findLineupSheetName(wb);
  if (!lineupName) throw new Error(`NO_LINEUP_SHEET:${(wb.SheetNames ?? []).join(",")}`);
  const sheet = wb.Sheets[lineupName];
  const at = (col: string, row: number): Cell | undefined =>
    (sheet[`${col}${row}`] as Cell | undefined) ?? undefined;

  // 사용자 엑셀에 행 삽입/삭제가 있어도(라벨이 기대 행과 안 맞으면) 실제 데이터가
  // 있는 행을 찾아 읽는다. 정상 파일이면 오프셋 0으로 기존과 동일하게 동작.
  const bOff = blockOffset(at, BATTERS);
  const pOff = blockOffset(at, PITCHERS);
  if (bOff || pOff) console.warn(`라인업 행 오프셋 보정: 타자 ${bOff}, 투수 ${pOff}`);

  const players: PlayerInput[] = [];
  LINEUP.forEach(({ row, pos, kind }) => {
    const isB = kind === "batter";
    const r = row + (isB ? bOff : pOff);
    // pos는 항상 캐노니컬 라벨 고정 — 다이아몬드 배치·포훈표 매칭이 B열 자유서식 텍스트에
    // 흔들리지 않도록 한다 (그게 "포지션이 밀려 보이는" 증상의 실제 원인이었음).
    const p = blankPlayer(row, kind, pos, "", true);
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
  const chem = { ...DEFAULT_CHEM };
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

  const yearInputs: Record<number, number | ""> = {};
  for (const r of Object.values(YEAR_ANCHOR)) yearInputs[r] = num(at("AZ", r));

  const name = file.name.replace(/\.(xlsx|xlsm|xls)$/i, "").slice(0, 30) || "엑셀 덱";
  return { name, players, chem, flags, yearInputs };
}
