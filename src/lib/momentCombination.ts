import { browserRandom, type Random } from "./skillSimulator";
export const MATERIALS = { moment: "모먼트 · 모먼트 조합 카드", S: "시즌/라이브 S", A: "시즌/라이브 A", B: "시즌/라이브 B", C: "시즌/라이브 C" } as const;
export type Material = keyof typeof MATERIALS;
export const RESULTS = { supreme: "슈프림 모먼트", moment: "모먼트", S: "시즌/라이브 S", A: "시즌/라이브 A", B: "시즌/라이브 B", C: "시즌/라이브 C" } as const;
export type CombinationGrade = keyof typeof RESULTS;
export const GRADE_ORDER = Object.keys(RESULTS) as CombinationGrade[];
export const COMBINATION_SOURCE = "https://hive-fn.qpyou.cn/markup/img/tf/mlbrv/mlb9irivals_ko.html";
// Current official overview (2026-11-06). S material is now 1% Moment, not the old announcement's .5%.
export const MATERIAL_RATES: Record<Material, readonly number[]> = {
  moment: [5,29,66,0,0,0], S: [0,1,34,66,0,0], A: [0,0,1,34,65,0], B: [0,0,0,10,34,56], C: [0,0,0,0,10,90],
};
export function combinationRates(materials: readonly Material[]): Record<CombinationGrade, number> {
  if (materials.length !== 3 || materials.some(m => !Object.prototype.hasOwnProperty.call(MATERIAL_RATES,m))) throw new Error("재료 카드 3장을 선택하세요.");
  let remaining = 100;
  return Object.fromEntries(GRADE_ORDER.map((grade,i) => {
    const rate = Math.min(remaining, materials.reduce((sum,m) => sum+MATERIAL_RATES[m][i],0));
    remaining -= rate;
    return [grade,rate];
  })) as Record<CombinationGrade,number>;
}
function index(random: Random, length: number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("난수는 0 이상 1 미만이어야 합니다.");
  return Math.floor(value*length);
}
export function drawCombinationCandidates(materials: readonly Material[], random: Random = browserRandom()): CombinationGrade[] {
  const rates = combinationRates(materials);
  return Array.from({length:5}, () => {
    // Keep full uint32 precision, rather than quantizing to integer percentages.
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("난수는 0 이상 1 미만이어야 합니다.");
    let left=roll*100;
    for (const grade of GRADE_ORDER) { left-=rates[grade]; if(left<0)return grade; }
    return "C";
  });
}
export function shuffleCandidates<T>(candidates: readonly T[], random: Random = browserRandom()): T[] {
  const result=[...candidates];
  for(let i=result.length-1;i>0;i--){const j=index(random,i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function pickCombination<T>(candidates: readonly T[], random: Random = browserRandom()): { chosen: T; slot: number } {
  if(candidates.length!==5)throw new Error("후보 카드가 5장이어야 합니다.");
  const slot=index(random,5);
  return { chosen:candidates[slot], slot };
}
export function hasSpecialCandidate(candidates: readonly CombinationGrade[]): boolean {
  return candidates.some(g=>g==='supreme'||g==='moment');
}
