import data from '../data/combinationPlayers.json';
import { browserRandom, type Random } from './skillSimulator';
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
export type CombinationScope = {type:'all'} | {type:'team';value:Team} | {type:'division';value:Division} | {type:'league';value:League};
export interface CombinationPlayer { id:string; grade:'supreme'|'moment'; team:Team; name:string; enName:string; theme:string; position?:string; ovr?:number }
export const ROSTER = data.players as CombinationPlayer[];
export const ROSTER_METADATA = {asOf:data.asOf,sources:data.sources,excluded:data.excludedHistoricalSupremeCards};
// Supreme theme Korean titles come from the official player-list headers.
// Moment themes keep the official English emblem name rather than guessing a translated skill name.
const THEME_LABELS:Record<string,string> = {'FIRST SPURT':'퍼스트 스퍼트','SUMMER MONSTER':'서머 몬스터','OCTOBER LEGEND':'옥토버 레전드','SLOW STARTER':'슬로우 스타터'};
export const themeLabel=(theme:string)=>THEME_LABELS[theme]??theme;
export const teamLabel=(team:Team)=>TEAMS.find(t=>t.id===team)?.name??team;
export function scopeLabel(scope:CombinationScope):string {
  return scope.type==='all'?'전체 구단':scope.type==='team'?teamLabel(scope.value):scope.type==='division'?DIVISIONS[scope.value]:LEAGUES[scope.value];
}
export function rosterForScope(scope:CombinationScope):CombinationPlayer[] {
  const teams=TEAMS.filter(t=>scope.type==='all'||(scope.type==='team'?t.id===scope.value:scope.type==='division'?t.division===scope.value:t.league===scope.value));
  if(!teams.length)throw new Error('확정권의 대상 구단·지구·리그를 확인하세요.');
  const allowed=new Set<string>(teams.map(t=>t.id));
  return ROSTER.filter(p=>allowed.has(p.team));
}
export const PROTECTED_RATES = {supreme:15,moment:85} as const;
function unit(random:Random){const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw new Error('난수는 0 이상 1 미만이어야 합니다.');return n;}
/** Protected grade rate confirmed by the user; cards are uniformly sampled within the filtered grade pool. */
export function createProtectedCombination(scope:CombinationScope,random:Random=browserRandom()):()=>CombinationPlayer[] {
  const pool=rosterForScope(scope);
  const supreme=pool.filter(p=>p.grade==='supreme'),moment=pool.filter(p=>p.grade==='moment');
  if(!supreme.length||!moment.length)throw new Error('선택 범위의 선수 명단을 확인하세요.');
  return ()=>Array.from({length:5},()=>{
    const eligible=unit(random)<PROTECTED_RATES.supreme/100?supreme:moment;
    return {...eligible[Math.floor(unit(random)*eligible.length)]};
  });
}
