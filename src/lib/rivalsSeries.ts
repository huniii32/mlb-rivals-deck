import roster from '../data/rivalsSeries-20261119.json';
import {calculateBuffs} from './rivalsSeriesBuffs';

export interface SeriesPlayer {
  id: string; team: string; name: string; noticeName?: string; english: string;
  year: number | null; requirement?: boolean; live: boolean; pick: boolean; ovr: number | null;
  grade: string | null; positions: string[];
}
export const seriesData = roster;
export const players: SeriesPlayer[] = roster.players;
export const teams = [...new Set(players.map(p => p.team))];
export const fieldPositions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export interface Formation { starters: 4|5|6; closers: 1|2 }
export const defaultFormation: Formation = {starters:5,closers:1};
export function formationSlots(f: Formation = defaultFormation) {
  if (![4,5,6].includes(f.starters) || ![1,2].includes(f.closers)) throw new Error('Invalid pitcher formation');
  return [...fieldPositions,'DH',...Array.from({length:f.starters},(_,i)=>`SP${i+1}`),...Array.from({length:12-f.starters-f.closers},(_,i)=>`RP${i+1}`),...Array.from({length:f.closers},(_,i)=>`CP${i+1}`),...Array.from({length:5},(_,i)=>`후보${i+1}`)];
}
export const slots=formationSlots();
export interface Selection { slot: string; player: SeriesPlayer }
export interface SearchOptions extends Formation { preferredTeam: string; seed: number; nonLiveCount?: number }
export function eligible(p: SeriesPlayer, slot: string) {
  if (!p.positions.length) return false;
  if (slot === 'DH' || slot.startsWith('후보')) return p.positions.some(pos => [...fieldPositions, 'DH'].includes(pos));
  if (slot.startsWith('SP')) return p.positions.includes('SP');
  if (slot.startsWith('RP')) return p.positions.includes('RP');
  if (slot.startsWith('CP')) return p.positions.includes('CP');
  return p.positions.includes(slot);
}
export function summarize(lineup: Selection[]) {
  const byTeam: Record<string, number> = {};
  for (const {player:p} of lineup) byTeam[p.team] = (byTeam[p.team] || 0) + 1;
  return {byTeam, live: lineup.filter(x => x.player.live).length, pick: lineup.filter(x => x.player.pick).length,
    s: lineup.filter(x => x.player.grade === 'S').length, a: lineup.filter(x => x.player.grade === 'A').length,
    unknownGrade: lineup.filter(x => !x.player.grade).length, teamsOfThree: Object.values(byTeam).filter(n => n >= 3).length};
}
export function makeRequirement(slot: string, team: string, grade: 'S'|'A', live=true): SeriesPlayer {
  if(!teams.includes(team) || !['S','A'].includes(grade)) throw new Error('Invalid card requirement');
  const position=slot.startsWith('SP')?'SP':slot.startsWith('RP')?'RP':slot.startsWith('CP')?'CP':slot.startsWith('후보')||slot==='DH'?'BAT':slot;
  if(![...fieldPositions,'SP','RP','CP','BAT'].includes(position)) throw new Error('Invalid requirement slot');
  return {id:`requirement:${slot}:${team}:${grade}:${live?'live':'season'}`,team,grade,live,requirement:true,pick:false,name:`${team} ${grade}등급`,english:'',year:null,ovr:null,positions:position==='BAT'?[...fieldPositions,'DH']:[position]};
}
export function editRequirement(lineup: Selection[], slot: string, patch: {team?:string;grade?:'S'|'A';live?:boolean}): Selection[] {
  const item=lineup.find(x=>x.slot===slot);
  if(!item?.player.requirement) throw new Error('Only ordinary card requirements can be edited');
  return lineup.map(x=>x.slot===slot?{slot,player:makeRequirement(slot,patch.team??x.player.team,patch.grade??x.player.grade as 'S'|'A',patch.live??x.player.live)}:x);
}
export function validateLineup(lineup: Selection[], formation: Formation = defaultFormation) {
  const slots=formationSlots(formation);
  if (lineup.length !== slots.length || new Set(lineup.map(x => x.slot)).size !== slots.length) return false;
  if (new Set(lineup.map(x => x.player.id)).size !== slots.length) return false;
  return lineup.every(({slot,player:p})=>{
    if(!slots.includes(slot)) return false;
    if(p.requirement) {
      if(!teams.includes(p.team)||!['S','A'].includes(p.grade||'')||typeof p.live!=='boolean'||p.pick||p.ovr!==null) return false;
      const expected=makeRequirement(slot,p.team,p.grade as 'S'|'A',p.live);
      return p.id===expected.id && JSON.stringify(p.positions)===JSON.stringify(expected.positions);
    }
    const source=players.find(x=>x.id===p.id);
    return !!source && source.team===p.team && source.grade===p.grade && source.pick===p.pick && source.live===p.live && eligible(source,slot);
  });
}
export function signature(lineup: Selection[]) {
  return lineup.map(({slot,player:p})=>p.requirement?`free:${slot.replace(/\d+$/,'')}:${p.team}:${p.grade}:${p.live}`:p.id).sort().join('|');
}

// Bounded candidate search, not a proof of feasibility or an optimal/verified buff solver.
// Buffs and CP exclusion follow user-provided game evidence. Search is bounded.
export function findCandidates(options: SearchOptions, attempts = 160): Selection[][] {
  const slots=formationSlots(options);
  const nonLiveCount=options.nonLiveCount??6;
  if(!Number.isInteger(nonLiveCount)||nonLiveCount<0||nonLiveCount>6) throw new Error('Search supports 0–6 non-live requirements');
  let state = options.seed >>> 0;
  const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
  const results = new Map<string, {lineup: Selection[]; score: number}>();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const lineup: Selection[] = []; const used = new Set<string>(); const selectedTeams = new Set<string>();
    const add = (slot: string, p: SeriesPlayer) => {lineup.push({slot, player:p}); used.add(p.id); selectedTeams.add(p.team);};
    // Cover all eight field positions with verified Pick cards first.
    for (const slot of fieldPositions) {
      const choices = players.filter(p => p.pick && eligible(p, slot) && !used.has(p.id));
      const preferred = choices.find(p => p.team === options.preferredTeam);
      const p = preferred || choices[Math.floor(random() * choices.length)];
      if (p) add(slot, p);
    }
    if (options.preferredTeam) selectedTeams.add(options.preferredTeam);
    // Include the verified relief Pick's club in some attempts, plus optional extra
    // clubs for batter reserves. This avoids limiting every candidate to eight clubs.
    if (attempt%2===0) for (const p of players.filter(p=>p.pick && p.positions.includes('RP'))) selectedTeams.add(p.team);
    const pool = players.filter(p => p.positions.length);
    // Fill scarce pitching slots before unrestricted DH/bench slots.
    const order = [...slots.filter(s=>s.startsWith('CP')), ...slots.filter(s => s.startsWith('RP')), ...slots.filter(s => s.startsWith('SP')), 'DH', ...slots.filter(s => s.startsWith('후보'))];
    for (const slot of order) {
      const summary = summarize(lineup);
      const counts = summary.byTeam;
      const candidates = pool.filter(p => !used.has(p.id) && eligible(p, slot) && (selectedTeams.has(p.team) || slot==='DH' || slot.startsWith('후보')))
        .map(p => ({p, score: (p.pick ? 24 : 0) + (p.grade === 'S' && summary.s < 20 ? 9 : p.grade === 'A' && summary.a < 6 ? 9 : 0) - (!p.grade ? 60 : 0) + (counts[p.team] ? Math.max(0,3-counts[p.team])*12 : selectedTeams.has(p.team) ? 24 : -10) + random()*12}))
        .sort((a,b) => b.score-a.score);
      if (candidates[0]) add(slot, candidates[0].p);
    }
    if (!validateLineup(lineup, options)) continue;
    if (options.preferredTeam && !lineup.some(x => x.player.team === options.preferredTeam)) continue;
    lineup.sort((a,b) => slots.indexOf(a.slot)-slots.indexOf(b.slot));
    // Repair within the same club/slot: retain team composition and prefer actual buff totals.
    for (let pass=0; pass<2; pass++) {
      let changed=false;
      for (const item of lineup) {
        let best=item.player, bestScore=candidateScore(lineup);
        for(const p of pool) {
          if(p.team!==item.player.team || used.has(p.id) || !eligible(p,item.slot)) continue;
          const old=item.player; item.player=p; const next=candidateScore(lineup); item.player=old;
          if(next>bestScore) {best=p;bestScore=next;}
        }
        if(best.id!==item.player.id) {used.delete(item.player.id);used.add(best.id);item.player=best;changed=true;}
      }
      if(!changed) break;
    }
    const score = candidateScore(lineup);
    const key = signature(lineup);
    if (!results.has(key)) results.set(key, {lineup, score});
  }
  // Improve the best bounded candidates across clubs too. Slot eligibility is
  // unchanged; this can complete a three-player club or reach a Pick threshold.
  for(const candidate of [...results.values()].sort((a,b)=>b.score-a.score).slice(0,8)) {
    const lineup=candidate.lineup.map(x=>({...x}));
    const used=new Set(lineup.map(x=>x.player.id));
    for(let pass=0;pass<2;pass++) {
      let changed=false;
      for(const item of lineup) {
        let best=item.player,bestScore=candidateScore(lineup);
        const ordinary=teams.flatMap(team=>['S','A'].map(grade=>makeRequirement(item.slot,team,grade as 'S'|'A')));
        for(const p of [...players,...ordinary]) {
          if(used.has(p.id) || !eligible(p,item.slot)) continue;
          if(item.player.team===options.preferredTeam && p.team!==options.preferredTeam && lineup.filter(x=>x.player.team===options.preferredTeam).length===1) continue;
          const old=item.player;item.player=p;const score=candidateScore(lineup);item.player=old;
          if(score>bestScore) {best=p;bestScore=score;}
        }
        if(best.id!==item.player.id) {used.delete(item.player.id);used.add(best.id);item.player=best;changed=true;}
      }
      if(!changed) break;
    }
    if(validateLineup(lineup,options)) results.set(signature(lineup),{lineup,score:candidateScore(lineup)});
  }
  // Diversify a found target with legal same-club/same-grade replacements.
  // Player sets must differ; merely shuffling bench/pitching order is not a new result.
  const exact=[...results.values()].find(x=>calculateBuffs(summarize(x.lineup)).match==='exact');
  if(exact) {
    let added=0;
    for(const item of exact.lineup) {
      for(const p of players) {
        if(added>=3) break;
        if(p.team!==item.player.team || p.grade!==item.player.grade || p.pick!==item.player.pick || p.live!==item.player.live || exact.lineup.some(x=>x.player.id===p.id) || !eligible(p,item.slot)) continue;
        const lineup=exact.lineup.map(x=>x===item ? {...x,player:p} : {...x});
        const key=signature(lineup);
        if(!results.has(key) && validateLineup(lineup,options) && calculateBuffs(summarize(lineup)).match==='exact') {results.set(key,{lineup,score:candidateScore(lineup)});added++;}
      }
      if(added>=3) break;
    }
  }
  const designs=new Map<string,Selection[]>();
  for(const {lineup:original} of [...results.values()].sort((a,b)=>b.score-a.score)) {
    let remaining=nonLiveCount;
    const lineup=original.map(({slot,player:p})=>{
      if(p.pick) return {slot,player:p};
      const live=remaining<=0; if(!live) remaining--;
      return {slot,player:makeRequirement(slot,p.team,p.grade==='A'?'A':'S',live)};
    });
    if(remaining>0 || !validateLineup(lineup,options)) continue;
    designs.set(signature(lineup),lineup);
  }
  return [...designs.values()].sort((a,b)=>candidateScore(b)-candidateScore(a)).slice(0,3);
}

function candidateScore(lineup: Selection[]) {
  const c=summarize(lineup), b=calculateBuffs(c);
  const distance=Math.abs(19-b.total.all)+Math.abs(4-b.total.batter)+Math.abs(5-b.total.pitcher);
  return (b.match==='exact'?10000:0)-distance*500-c.unknownGrade*200 + Math.min(c.pick,15)*8 + Math.min(c.s,20)*2 + Math.min(c.a,6)*2;
}

export function targetFeasibility() {
  const picks=players.filter(p=>p.pick);
  const batters=picks.filter(p=>p.positions.some(pos=>[...fieldPositions,'DH'].includes(pos)));
  const uniqueBatterClubs=new Set(batters.map(p=>p.team)).size===batters.length;
  const sp=picks.filter(p=>p.positions.includes('SP')).length;
  const rp=picks.filter(p=>p.positions.includes('RP')).length;
  if(uniqueBatterClubs && sp===0 && rp===1) return {
    possible:false as const,
    reason:'현재 공지에는 구단별 Pick 타자 1명, 선발 Pick 0명, 중계 Pick 1명(AZ), 나머지 Pick 투수는 CP입니다. 19/4/5에는 8개 구단 각 3명 이상과 Pick 15명이 필요합니다. 26자리에서 이 구단 조건을 유지하면 최대 10개 구단을 쓸 수 있어 Pick 타자는 최대 10명, Pick 투수는 CP 2명과 RP 1명을 합쳐 최대 3명입니다. 합계 13명으로 Pick 15명에 미달합니다. 일반 S/A 카드를 자유롭게 채우거나 시즌 카드를 섞어도 Pick 인원 상한은 달라지지 않습니다.',
  };
  return {possible:null,reason:'전체 조합의 가능 여부는 아직 증명하지 않았습니다.'};
}
