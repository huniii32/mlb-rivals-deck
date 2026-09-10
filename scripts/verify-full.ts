import { calcPlayer, calcDeckTotal } from "../src/lib/engine";
import type { PlayerInput, Chem } from "../src/lib/engine";
import { flagDefaults } from "../src/lib/engine";

// 엑셀 실데이터 (data_only 캐시에서 추출, 2026-09-10)
type Row = [
  row: number, kind: "batter" | "pitcher", pos: string, order: number | "",
  card: string, year: number,
  s1: number | "", s2: number | "", s3: number | "",
  t1: number | "", t2: number | "", t3: number | "",
  p1: number | "", p2: number | "", p3: number | "",
  transLv: number | "", enhLv: number | "", pohLv: number | "",
  e1: number | "", e2: number | "", e3: number | "",
  skillB: boolean, skills: [string, string, string, string],
  wantBB: number, wantBC: number, wantBD: number | null,
];
const B = "[S0] 5툴 플레이어 (주수 200-249)";
const P = "[S0] 결속력 (스덱코 500-599)";
const W = "WBC 시그니처 블랙";
const ROWS: Row[] = [
  [11, "batter", "C", 9, W, 2026, 65, 63, 61, 15, 13, 14, 3, "", "", 0, 18, 16, "", 2, "", true, [B, B, B, B], 35, 34, 33],
  [12, "batter", "1B", 5, W, 2026, 83, 82, 75, 25, 11, 17, 5, 1, 2, 0, 14, 20, 1, 6, 1, true, [B, B, B, B], 36, 36, 33],
  [13, "batter", "2B", 2, W, 2026, 72, 89, 87, 23, 17, 10, 10, 1, 1, 1, 18, 20, 4, "", 5, true, [B, B, B, B], 36, 36, 33],
  [14, "batter", "3B", 6, W, 2026, 82, 83, 85, 18, 18, 11, 3, 1, 3, 0, 14, 20, 4, 2, "", true, [B, B, B, B], 37, 34, 33],
  [15, "batter", "SS", 7, W, 2026, 74, 86, 77, 21, 21, 21, 8, 6, 2, 1, 20, 20, 5, 4, "", true, [B, B, B, B], 36, 35, 34],
  [16, "batter", "LF", 4, W, 2026, 81, 78, 72, 25, 18, 15, 10, 2, 2, 3, 20, 20, 2, 5, 1, true, [B, B, B, B], 33, 36, 32],
  [17, "batter", "CF", 8, W, 2026, 70, 75, 73, 19, 15, 14, 3, "", "", 9, 20, 20, 2, 4, "", true, [B, B, B, B], 34, 34, 32],
  [18, "batter", "RF", 1, W, 2026, 78, 83, 81, 20, 20, 11, 10, 5, "", 0, 20, 20, 2, 2, "", true, [B, B, B, B], 34, 35, 31],
  [19, "batter", "DH", 3, W, 2026, 78, 74, 71, 21, 15, 10, 3, "", "", 9, 20, 20, 2, 7, "", true, [B, B, B, B], 33, 36, 32],
  [22, "pitcher", "SP1", "", W, 2026, 70, 79, "", 16, 18, "", "", 3, "", 9, 20, 20, 5, 1, "", true, [P, P, P, P], 24, 23, null],
  [23, "pitcher", "SP2", "", W, 2026, 77, 83, "", 17, 20, "", 2, 7, "", 0, 18, 20, 5, 6, "", true, [P, P, P, P], 24, 23, null],
  [24, "pitcher", "SP3", "", W, 2026, 88, 73, "", 14, 18, "", 0, 3, "", 0, 20, 20, 0, 7, "", true, [P, P, P, P], 24, 23, null],
  [25, "pitcher", "SP4", "", W, 2026, 82, 76, "", 12, 23, "", 0, 3, "", 9, 20, 20, 1, 4, "", true, [P, P, P, P], 24, 23, null],
  [26, "pitcher", "SP5", "", W, 2026, 80, 72, "", 15, 18, "", 0, 3, "", 4, 20, 20, 0, 4, "", true, [P, P, P, P], 24, 23, null],
  [27, "pitcher", "RP1", "", W, 2026, 67, 72, "", 18, 17, "", 0, 8, "", 9, 20, 16, 2, 0, "", true, [P, P, P, P], 24, 24, null],
  [28, "pitcher", "RP2", "", W, 2026, 68, 69, "", 16, 20, "", 0, 3, "", 3, 20, 7, 1, 0, "", true, [P, P, P, P], 24, 24, null],
  [29, "pitcher", "RP3", "", W, 2026, 68, 68, "", 17, 15, "", 0, 3, "", 3, 20, 7, 0, 0, "", true, [P, P, P, P], 24, 24, null],
  [30, "pitcher", "CP1", "", W, 2026, 73, 69, "", 16, 16, "", 0, 3, "", 9, 20, 20, 0, 0, "", true, [P, P, P, P], 24, 24, null],
];

const CHEM: Chem = { commander: "S", catcher: "S", pitchChem: "S", batChem: "S", wbcP: "S", wbcB: "S1" };
const TABLES = { overrides: {}, customs: [] };
const CTX = {
  flags: flagDefaults(), yearInputs: {} as Record<number, number | "">,
  cardByRow: {} as Record<number, string>, orderByRow: {} as Record<number, number>,
  enhByRow: {} as Record<number, number>, yearByRow: {} as Record<number, number>,
  chem: CHEM,
};
for (const r of ROWS) {
  CTX.cardByRow[r[0]] = r[4];
  CTX.orderByRow[r[0]] = typeof r[3] === "number" ? r[3] : 0;
  CTX.enhByRow[r[0]] = typeof r[16] === "number" ? r[16] : 0;
  CTX.yearByRow[r[0]] = r[5];
}

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

function toPlayer(r: Row): PlayerInput {
  const n = r[1] === "batter" ? 3 : 2;
  return {
    excelRow: r[0], kind: r[1], pos: r[2], order: r[3], card: r[4], name: `T${r[0]}`, year: r[5],
    enName: "", team: "", photoUrl: "",
    base: [r[6], r[7], n === 3 ? r[8] : ""],
    train: [r[9], r[10], n === 3 ? r[11] : ""],
    spec: [r[12], r[13], n === 3 ? r[14] : ""],
    transLv: r[15], enhLv: r[16], pohLv: r[17],
    extra: [r[18], r[19], n === 3 ? r[20] : ""],
    synergy: ["", "", ""], locker: ["", "", ""],
    skillB: r[21], skills: r[22], finalOv: ["", "", ""],
  };
}

// 1) 덱코합 전행 (엑셀 BB/BC/BD 캐시)
for (const r of ROWS) {
  const res = calcPlayer(toPlayer(r), CTX, TABLES);
  const want = [r[23], r[24], r[25] === null ? 0 : r[25]];
  eq(`deck row${r[0]}`, res.deck.map(Math.round), want);
}
// 2) J/O 전행 (최종수동 0 → 엑셀 G공란과 동일 조건)
for (const r of ROWS) {
  const p = toPlayer(r);
  p.finalOv = [0, 0, 0];
  const res = calcPlayer(p, CTX, TABLES);
  const wantJ = r[1] === "batter" ? 5.1 : 9.4;
  const wantO = r[1] === "batter" ? 32 : 68.6;
  eq(`J row${r[0]}`, Math.round(res.ability * 100) / 100, wantJ);
  eq(`O row${r[0]}`, Math.round((res.skill ?? -1) * 100) / 100, wantO);
}
// 3) 포훈 적중값 (AK 캐시: 11→4, 19→8, 27→4, 28→1)
for (const [row, want] of [[11, 4], [19, 8], [27, 4], [28, 1]] as const) {
  const r = ROWS.find((x) => x[0] === row)!;
  const res = calcPlayer(toPlayer(r), CTX, TABLES);
  eq(`pohoon row${row}`, res.poh[0], want);
}
// 4) 초월/강화 WBC 미스로 경고 (AC/AG #N/A)
{
  const res = calcPlayer(toPlayer(ROWS[0]), CTX, TABLES);
  eq("warn transcend", res.warnings.some((w) => w.includes("초월표")), true);
  eq("warn enhance", res.warnings.some((w) => w.includes("강화표")), true);
}
// 5) 총점 (최종수동 0 → P=O+J 엑셀 동일 → D4=780 D5=780 D6=371 D7=575.5)
{
  const players = ROWS.map((r) => {
    const p = toPlayer(r);
    p.finalOv = [0, 0, 0];
    return p;
  });
  const t = calcDeckTotal({ players, chem: CHEM, flags: flagDefaults(), yearInputs: {} }, TABLES);
  eq("totals", [t.sp, t.rp, t.bt, Math.round(t.total * 10) / 10], [780, 780, 371, 575.5]);
}

console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
