import type { Kind, PlayerInput } from "./engine";

export const WBC_SOURCE = "https://community.withhive.com/MLB9IRIVALS/ko/board/9/18420";
export const WBC_COUNTRIES: Record<string, string> = {
  KOR: "대한민국", JPN: "일본", TPE: "대만", AUS: "호주", CZE: "체코",
  USA: "미국", MEX: "멕시코", ITA: "이탈리아", GBR: "영국", BRA: "브라질",
  CAN: "캐나다", PUR: "푸에르토리코", CUB: "쿠바", PAN: "파나마", COL: "콜롬비아",
  DOM: "도미니카 공화국", VEN: "베네수엘라", NED: "네덜란드", ISR: "이스라엘", NCA: "니카라과",
};
export const isWbcCard = (card: string) => /WBC|WORLD\s*BASEBALL\s*CLASSIC/i.test(card);
const skillKey = (name: string) => name.normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]/g, "").toLowerCase();
const country = (p: PlayerInput) => WBC_COUNTRIES[p.wbcCountry ?? ""] ? p.wbcCountry : undefined;
export const WBC_SKILLS: { kind: Kind; name: string; score: number }[] = [];
for (let level = 0; level <= 2; level++) {
  const add = (kind: Kind, name: string, score: number) => WBC_SKILLS.push({kind, name: `[S${level}] WBC ${name}`, score: Math.round(score * 100) / 100});
  for (const [name, condition] of [["키스톤", "SS·2B"], ["사령관", "포수"]]) {
    for (const active of [false, true]) add("batter", `${name} (${condition} ${active ? "O" : "X"})`, (6 + level) * 2.35 + (active ? (9 + level) * 2.4 : 0));
  }
  for (const kind of ["batter", "pitcher"] as const) {
    for (const [label, gain] of [["1명", 0], ["2~3명", 5], ["4명 이상", 12]] as const) {
      add(kind, `하모니 (동일 국가 ${label})`, (6 + level) * (kind === "batter" ? 2.35 : 2) + gain * (kind === "batter" ? 2.4 : 2.35));
    }
  }
}

/** 비교 화면의 조건 이름은 유지하되 실제 덱은 카드·배치·국가 정보로 판정한다. */
export function resolveWbcSkill(p: PlayerInput, name: string, players?: PlayerInput[]): {name: string | null; note: string; inactive?: boolean} | undefined {
  const entry = WBC_SKILLS.find(s => s.kind === p.kind && skillKey(s.name) === skillKey(name));
  if (!entry) return;
  if (!isWbcCard(p.card)) return {name: null, note: "WBC 카드 전용 스킬 미적용", inactive: true};
  const prefix = entry.name.slice(0, 4);
  if (entry.name.includes("키스톤") || entry.name.includes("사령관")) {
    const keystone = entry.name.includes("키스톤");
    const active = (keystone ? ["SS", "2B"] : ["C"]).includes(p.pos.trim().toUpperCase());
    const resolved = `${prefix} WBC ${keystone ? "키스톤 (SS·2B" : "사령관 (포수"} ${active ? "O" : "X"})`;
    return {name: resolved, note: `실제 포지션 ${p.pos} · 추가 효과 ${active ? "적용" : "미적용"}`};
  }
  const own = country(p);
  if (!own || !players) return {name: null, note: "하모니 조건 미확인: WBC 카드 국가와 라인업을 확인하세요."};
  // 현재 등록된 라인업만 센다. 빈 슬롯, 일반 카드의 구단명·선수 이름으로 국적을 추정하지 않는다.
  const members = players.filter(q => q.name.trim() && isWbcCard(q.card));
  const count = members.filter(q => country(q) === own).length;
  const unknown = members.filter(q => !country(q)).length;
  const bucket = (n: number) => n >= 4 ? "4명 이상" : n >= 2 ? "2~3명" : "1명";
  if (!p.name.trim() || count === 0 || bucket(count) !== bucket(count + unknown)) {
    return {name: null, note: `하모니 조건 미확인: 동일 국가 ${count}명 확인 · 국가 미입력 ${unknown}명`};
  }
  return {name: `${prefix} WBC 하모니 (동일 국가 ${bucket(count)})`, note: `${WBC_COUNTRIES[own]} ${count}명 · 자신 포함${unknown ? ` · 국가 미입력 ${unknown}명은 현재 점수 구간에 영향 없음` : ""}`};
}
