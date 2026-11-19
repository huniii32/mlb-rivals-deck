// Transcribed from the four in-game screenshots supplied on 2026-11-19.
// Thresholds stack; team thresholds apply independently to each club.
export interface Buff { all: number; batter: number; pitcher: number; box: number }
export interface BuffCounts { byTeam: Record<string, number>; live: number; pick: number; s: number; a: number; unknownGrade: number }
export interface BuffRule { at: number; effect: Buff }
const effect = (all=0,batter=0,pitcher=0,box=0): Buff => ({all,batter,pitcher,box});
export const buffRules: Record<'team'|'live'|'pick'|'s'|'a', BuffRule[]> = {
  team: [{at:3,effect:effect(1)}, {at:6,effect:effect(0,1)}, {at:8,effect:effect(0,0,1)}],
  live: [{at:2,effect:effect(2)}, {at:5,effect:effect(0,0,0,10)}, {at:8,effect:effect(0,1)}, {at:11,effect:effect(0,0,1)}, {at:14,effect:effect(0,0,0,10)}, {at:17,effect:effect(2)}, {at:20,effect:effect(2)}],
  pick: [{at:2,effect:effect(1)}, {at:5,effect:effect(0,1)}, {at:8,effect:effect(0,0,0,10)}, {at:10,effect:effect(0,0,1)}, {at:13,effect:effect(1)}, {at:15,effect:effect(1)}],
  s: [{at:6,effect:effect(0,0,2)}, {at:12,effect:effect(0,2)}, {at:20,effect:effect(2)}],
  a: [{at:6,effect:effect(0,0,1)}, {at:12,effect:effect(0,1)}, {at:20,effect:effect(1)}],
};
export const buffTarget = {all:19,batter:4,pitcher:5};
export const buffLabels = {team:'구단별 인원',live:'라이브 선수',pick:'라이벌 Pick',s:'S등급',a:'A등급'};
export function calculateBuffs(counts: BuffCounts) {
  const total=effect();
  const breakdown: {category: keyof typeof buffRules; team?: string; count:number; at:number; effect:Buff; active:boolean}[]=[];
  for(const category of Object.keys(buffRules) as (keyof typeof buffRules)[]) {
    const groups: [string|undefined,number][] = category==='team' ? Object.entries(counts.byTeam) : [[undefined,counts[category]]];
    for(const [team,count] of groups) for(const rule of buffRules[category]) {
      const active=count>=rule.at;
      breakdown.push({category,team,count,...rule,active});
      if(active) for(const key of Object.keys(total) as (keyof Buff)[]) total[key]+=rule.effect[key];
    }
  }
  const exact=total.all===19 && total.batter===4 && total.pitcher===5;
  const atLeast=total.all>=19 && total.batter>=4 && total.pitcher>=5;
  // Unknown grades could activate additional thresholds. Don't certify an exact total.
  return {total,breakdown,complete:counts.unknownGrade===0,match:counts.unknownGrade ? 'unknown' : exact ? 'exact' : atLeast ? 'above' : 'below'} as const;
}
export function buffText(buff: Buff) {
  return [buff.all && `전체 +${buff.all}`,buff.batter && `타자 +${buff.batter}`,buff.pitcher && `투수 +${buff.pitcher}`,buff.box && `상자 +${buff.box}%`].filter(Boolean).join(' · ');
}
