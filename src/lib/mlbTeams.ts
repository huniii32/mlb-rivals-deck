export const LEAGUES = { AL:'아메리칸 리그', NL:'내셔널 리그' } as const;
export const DIVISIONS = { ALE:'AL 동부', ALC:'AL 중부', ALW:'AL 서부', NLE:'NL 동부', NLC:'NL 중부', NLW:'NL 서부' } as const;
export type League = keyof typeof LEAGUES;
export type Division = keyof typeof DIVISIONS;
const teamRows = [
  ['NYY','뉴욕 양키스','ALE'],['BOS','보스턴 레드삭스','ALE'],['TB','탬파베이 레이스','ALE'],['TOR','토론토 블루제이스','ALE'],['BAL','볼티모어 오리올스','ALE'],
  ['MIN','미네소타 트윈스','ALC'],['DET','디트로이트 타이거스','ALC'],['CWS','시카고 화이트삭스','ALC'],['CLE','클리블랜드 가디언스','ALC'],['KC','캔자스시티 로열스','ALC'],
  ['LAA','LA 에인절스','ALW'],['TEX','텍사스 레인저스','ALW'],['SEA','시애틀 매리너스','ALW'],['ATH','애슬레틱스','ALW'],['HOU','휴스턴 애스트로스','ALW'],
  ['PHI','필라델피아 필리스','NLE'],['MIA','마이애미 말린스','NLE'],['ATL','애틀랜타 브레이브스','NLE'],['NYM','뉴욕 메츠','NLE'],['WSH','워싱턴 내셔널스','NLE'],
  ['STL','세인트루이스 카디널스','NLC'],['CHC','시카고 컵스','NLC'],['MIL','밀워키 브루어스','NLC'],['PIT','피츠버그 파이리츠','NLC'],['CIN','신시내티 레즈','NLC'],
  ['LAD','LA 다저스','NLW'],['SF','샌프란시스코 자이언츠','NLW'],['SD','샌디에이고 파드리스','NLW'],['ARI','애리조나 다이아몬드백스','NLW'],['COL','콜로라도 로키스','NLW'],
] as const;
export const TEAMS = teamRows.map(([id,name,division])=>({id,name,division,league:division.slice(0,2) as League}));
export type Team = typeof TEAMS[number]['id'];

const aliases: Record<string, string> = { OAK: "ATH", CHW: "CWS", KCR: "KC", SFG: "SF", SDP: "SD", TBR: "TB", WSN: "WSH", WAS: "WSH", AZ: "ARI", ANA: "LAA", FLA: "MIA", MON: "WSH" };
export function findTeam(value?: string) {
  const code = value?.trim().toUpperCase() ?? "";
  return TEAMS.find(team => team.id === (aliases[code] ?? code) || team.name === code);
}
