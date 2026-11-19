import roster from '../data/rivalsSeries-20261119.json';

export interface SeriesPlayer {
  id: string; team: string; name: string; noticeName?: string; english: string;
  year: number; live: boolean; pick: boolean; ovr: number | null;
  grade: string | null; positions: string[];
}
export const seriesData = roster;
export const players: SeriesPlayer[] = roster.players;
export const teams = [...new Set(players.map(p => p.team))];
export const fieldPositions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const slots = [...fieldPositions, 'DH', ...Array.from({length: 5}, (_, i) => `SP${i+1}`), ...Array.from({length: 6}, (_, i) => `RP${i+1}`), 'CP', ...Array.from({length: 5}, (_, i) => `보관${i+1}`)];
export interface Selection { slot: string; player: SeriesPlayer }
export interface SearchOptions { preferredTeam: string; allowCloserInRelief: boolean; seed: number }
export function eligible(p: SeriesPlayer, slot: string, allowCloser: boolean) {
  if (!p.positions.length) return false;
  if (slot === 'DH' || slot.startsWith('보관')) return p.positions.some(pos => [...fieldPositions, 'DH'].includes(pos));
  if (slot.startsWith('SP')) return p.positions.includes('SP');
  if (slot.startsWith('RP')) return p.positions.includes('RP') || (allowCloser && p.positions.includes('CP'));
  return p.positions.includes(slot);
}
export function summarize(lineup: Selection[]) {
  const byTeam: Record<string, number> = {};
  for (const {player:p} of lineup) byTeam[p.team] = (byTeam[p.team] || 0) + 1;
  return {byTeam, live: lineup.filter(x => x.player.live).length, pick: lineup.filter(x => x.player.pick).length,
    s: lineup.filter(x => x.player.grade === 'S').length, a: lineup.filter(x => x.player.grade === 'A').length,
    unknownGrade: lineup.filter(x => !x.player.grade).length, teamsOfThree: Object.values(byTeam).filter(n => n >= 3).length};
}
export function validateLineup(lineup: Selection[], allowCloser: boolean) {
  if (lineup.length !== slots.length || new Set(lineup.map(x => x.slot)).size !== slots.length) return false;
  if (new Set(lineup.map(x => x.player.id)).size !== slots.length) return false;
  return lineup.every(x => slots.includes(x.slot) && players.some(p => p.id === x.player.id) && eligible(x.player, x.slot, allowCloser));
}
export function signature(lineup: Selection[]) { return lineup.map(x => x.player.id).sort().join('|'); }

// Bounded candidate search, not a proof of feasibility or an optimal/verified buff solver.
// The current full buff table is unknown: never derive 19/4/5 from these counts.
export function findCandidates(options: SearchOptions, attempts = 160): Selection[][] {
  let state = options.seed >>> 0;
  const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
  const results = new Map<string, {lineup: Selection[]; score: number}>();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const lineup: Selection[] = []; const used = new Set<string>(); const selectedTeams = new Set<string>();
    const add = (slot: string, p: SeriesPlayer) => {lineup.push({slot, player:p}); used.add(p.id); selectedTeams.add(p.team);};
    // Cover all eight field positions with verified Pick cards first.
    for (const slot of fieldPositions) {
      const choices = players.filter(p => p.pick && eligible(p, slot, false) && !used.has(p.id));
      const preferred = choices.find(p => p.team === options.preferredTeam);
      const p = preferred || choices[Math.floor(random() * choices.length)];
      if (p) add(slot, p);
    }
    if (options.preferredTeam) selectedTeams.add(options.preferredTeam);
    const pool = players.filter(p => selectedTeams.has(p.team) && p.positions.length);
    // Fill scarce pitching slots before unrestricted DH/bench slots.
    const order = ['CP', ...slots.filter(s => s.startsWith('RP')), ...slots.filter(s => s.startsWith('SP')), 'DH', ...slots.filter(s => s.startsWith('보관'))];
    for (const slot of order) {
      const counts = summarize(lineup).byTeam;
      const candidates = pool.filter(p => !used.has(p.id) && eligible(p, slot, options.allowCloserInRelief))
        .map(p => ({p, score: (p.pick ? 12 : 0) + (p.grade === 'S' ? 8 : 0) + Math.max(0, 3 - (counts[p.team] || 0)) * 12 + random()*12}))
        .sort((a,b) => b.score-a.score);
      if (candidates[0]) add(slot, candidates[0].p);
    }
    if (!validateLineup(lineup, options.allowCloserInRelief)) continue;
    if (options.preferredTeam && !lineup.some(x => x.player.team === options.preferredTeam)) continue;
    lineup.sort((a,b) => slots.indexOf(a.slot)-slots.indexOf(b.slot));
    const c = summarize(lineup);
    const score = c.teamsOfThree*100 + c.pick*15 + c.s*10;
    const key = signature(lineup);
    if (!results.has(key)) results.set(key, {lineup, score});
  }
  return [...results.values()].sort((a,b) => b.score-a.score).slice(0,3).map(x => x.lineup);
}
