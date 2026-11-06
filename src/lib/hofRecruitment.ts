import data from '../data/hofRecruitment.json';
import {browserRandom,type Random} from './skillSimulator';
import {object,counter,strings} from './simulatorSession';
export const HOF_DATA=data;
export const HOF_PLAYERS=data.players;
export type HofPlayer=typeof HOF_PLAYERS[number];
const ids=new Set(HOF_PLAYERS.map(p=>p.id));
const totalWeight=HOF_PLAYERS.reduce((sum,p)=>sum+p.weight,0);
export interface HofDraw {number:number;id:string}
export interface HofStats {total:number;counts:Record<string,number>;first:Record<string,number>;recent:HofDraw[]}
export interface HofSession {source:string;targets:string[];limit:string;stats:HofStats}
export const emptyHofStats=():HofStats=>({total:0,counts:{},first:{},recent:[]});
export function drawHof(random:Random=browserRandom()):HofPlayer {
  const value=random();
  if(!Number.isFinite(value)||value<0||value>=1)throw new Error('난수 범위가 올바르지 않습니다.');
  let weight=value*totalWeight;
  for(const player of HOF_PLAYERS){weight-=player.weight;if(weight<0)return player;}
  return HOF_PLAYERS[HOF_PLAYERS.length-1];
}
export function hofGoalProbability(targets:readonly string[]):number {
  const selected=new Set(targets);
  return HOF_PLAYERS.reduce((sum,p)=>sum+(selected.has(p.id)?p.weight:0),0)/totalWeight;
}
export function hofGoalStats(stats:HofStats,targets:readonly string[]) {
  const unique=[...new Set(targets)].filter(id=>ids.has(id));
  const firsts=unique.map(id=>stats.first[id]).filter(n=>n>0);
  return {hits:unique.reduce((sum,id)=>sum+(stats.counts[id]??0),0),first:firsts.length?Math.min(...firsts):null};
}
export function recordHof(stats:HofStats,player:HofPlayer):void {
  stats.total++;stats.counts[player.id]=(stats.counts[player.id]??0)+1;stats.first[player.id]??=stats.total;
  stats.recent=[{number:stats.total,id:player.id},...stats.recent].slice(0,12);
}
/** Mutates a private working copy; callers publish snapshots between short chunks. */
export function runHofChunk(stats:HofStats,max:number,targets:readonly string[],random:Random=browserRandom()):{done:number;hit:boolean} {
  if(!Number.isInteger(max)||max<1||max>100000||targets.some(id=>!ids.has(id)))throw new Error('추첨 횟수 또는 희망 선수를 확인하세요.');
  const selected=new Set(targets);
  for(let done=1;done<=max;done++){
    const player=drawHof(random);recordHof(stats,player);
    if(selected.has(player.id))return {done,hit:true};
  }
  return {done:max,hit:false};
}
export function validHofSession(value:unknown):value is HofSession {
  if(!object(value)||value.source!==HOF_DATA.source.sha256||!strings(value.targets)||new Set(value.targets).size!==value.targets.length||value.targets.some(id=>!ids.has(id))||typeof value.limit!=='string'||value.limit.length>12||!object(value.stats))return false;
  const s=value.stats;
  if(!counter(s.total)||!object(s.counts)||!object(s.first)||!Array.isArray(s.recent)||s.recent.length!==Math.min(s.total,12))return false;
  const entries=Object.entries(s.counts);
  if(entries.some(([id,n])=>!ids.has(id)||!counter(n)||n===0)||entries.reduce((sum,[,n])=>sum+(n as number),0)!==s.total)return false;
  if(Object.keys(s.first).length!==entries.length||Object.entries(s.first).some(([id,n])=>!(id in (s.counts as object))||!counter(n)||n<1||n>(s.total as number)))return false;
  const first=s.first as Record<string,number>,counts=s.counts as Record<string,number>;
  if(new Set(Object.values(first)).size!==entries.length)return false;
  const seen:Record<string,number>={};
  for(let i=0;i<s.recent.length;i++){
    const r=s.recent[i];
    if(!object(r)||r.number!==s.total-i||typeof r.id!=='string'||!ids.has(r.id)||!(r.id in counts)||first[r.id]>(r.number as number))return false;
    seen[r.id]=(seen[r.id]??0)+1;if(seen[r.id]>counts[r.id])return false;
  }
  return true;
}
