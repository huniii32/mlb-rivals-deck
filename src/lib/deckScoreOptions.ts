import { allThresholds, referencedFlags } from "./engine";
import { DECADE_TARGET_ROWS, YEAR_ANCHOR, type DeckScoreRegion, type DeckScoreSide } from "./deckScoreTargets";

interface DeckScoreOptionRow {
  region: DeckScoreRegion;
  row: number;
  threshold: number | null;
  sides: DeckScoreSide[];
  yearRow?: number;
  targetRow?: number;
}

/** 설정과 읽기 전용 미리보기가 같은 순서·선택지를 사용한다. 규칙은 빌드마다 고정이다. */
function buildRows(region: DeckScoreRegion): DeckScoreOptionRow[] {
  const rows = new Map<number, DeckScoreOptionRow>();
  for (const f of referencedFlags()) {
    if (f.region !== region) continue;
    const row = rows.get(f.row) ?? { region, row: f.row, threshold: f.threshold, sides: [] };
    if (!row.sides.includes(f.side as DeckScoreSide)) row.sides.push(f.side as DeckScoreSide);
    row.threshold ??= f.threshold;
    rows.set(f.row, row);
  }
  // 팀 330/345는 점수 가산 없이 선택만 보존. 스페셜 680은 연도만 입력한다.
  for (const { row, threshold } of allThresholds(region)) {
    if (!rows.has(row)) rows.set(row, { region, row, threshold, sides: region === "spec" && YEAR_ANCHOR[threshold] !== undefined ? [] : ["L", "R"] });
  }
  return [...rows.values()]
    .map(row => ({
      ...row,
      yearRow: region === "spec" && row.threshold !== null ? YEAR_ANCHOR[row.threshold] : undefined,
      targetRow: region === "spec" && row.threshold !== null ? DECADE_TARGET_ROWS[row.threshold] : undefined,
    }))
    .sort((a, b) => (a.threshold ?? 9999) - (b.threshold ?? 9999) || a.row - b.row);
}

export const DECK_SCORE_OPTIONS = { team: buildRows("team"), spec: buildRows("spec") };
