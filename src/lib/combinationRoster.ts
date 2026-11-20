import data from '../data/combinationPlayers.json';
import { browserRandom, type Random } from './skillSimulator';
import { TEAMS, LEAGUES, DIVISIONS, type Team, type League, type Division } from "./mlbTeams";
export { TEAMS, LEAGUES, DIVISIONS, type Team, type League, type Division } from "./mlbTeams";
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
