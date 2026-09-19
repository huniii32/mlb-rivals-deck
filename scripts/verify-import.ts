import * as XLSX from "xlsx";
import { parseExcelDeck } from "../src/lib/excelImport";

// 라인업 시트 B열(포지션 텍스트)이 자유서식이거나, 사용자가 행을 밀어 넣은 경우에도
// 캐노니컬 포지션·정확한 excelRow로 읽히는지 확인. 버그사항3(포지션 밀림) 회귀 방지용.
const BATTER_ROWS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
const PITCHER_ROWS = [22, 23, 24, 25, 26, 27, 28, 29, 30];
const CANON = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH",
  "SP1", "SP2", "SP3", "SP4", "SP5", "RP1", "RP2", "RP3", "CP1"];

function buildFile(labels: string[], nameAt: (i: number) => string, offset = 0): File {
  const ws: XLSX.WorkSheet = { "!ref": "A1:AZ40" };
  const rows = [...BATTER_ROWS, ...PITCHER_ROWS];
  rows.forEach((row, i) => {
    ws[`B${row + offset}`] = { t: "s", v: labels[i] };
    ws[`E${row + offset}`] = { t: "s", v: nameAt(i) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "라인업");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([buf]);
  return Object.assign(blob, { name: "t.xlsx" }) as unknown as File;
}

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) pass++;
  else { fail++; console.log("FAIL:", label); }
};

async function main() {
  // 1) 정상 캐노니컬 라벨: 그대로 매칭
  {
    const f = buildFile(CANON, (i) => `P${i}`);
    const d = await parseExcelDeck(f);
    check("canonical pos", d.players.map((p) => p.pos).join(",") === CANON.join(","));
    check("canonical RF name (row18=idx7)", d.players[7].name === "P7" && d.players[7].excelRow === 18);
  }
  // 2) 한글 자유서식 라벨(버그 재현): 캐노니컬 라벨로 정규화되어야 함
  {
    const KOR = ["포수", "1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수", "지타",
      "선발1", "선발2", "선발3", "선발4", "선발5", "구원1", "구원2", "구원3", "마무리"];
    const f = buildFile(KOR, (i) => `P${i}`);
    const d = await parseExcelDeck(f);
    check("korean labels -> canonical pos", d.players.map((p) => p.pos).join(",") === CANON.join(","));
    check("korean labels: RF row still row18", d.players[7].name === "P7" && d.players[7].excelRow === 18);
  }
  // 3) 사용자가 행을 2칸 밀어 넣은 경우: 오프셋을 찾아 데이터가 제자리로
  {
    const f = buildFile(CANON, (i) => `P${i}`, 2);
    const d = await parseExcelDeck(f);
    check("shifted rows: RF still excelRow 18 with right name", d.players[7].excelRow === 18 && d.players[7].name === "P7");
  }
  console.log(`pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
}

main();
