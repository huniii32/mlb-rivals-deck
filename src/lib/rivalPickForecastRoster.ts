import forecast from '../data/rivalPickForecast20.json';
import {players, type SeriesPlayer} from './rivalsSeries';

export const arizonaBatters = forecast.ARI.batters;

// Use the last published card positions and grades for the projected round.
export function forecastRoster(arizonaBatter: string): SeriesPlayer[] {
  const picks = new Map<string, string>();
  for (const row of Object.values(forecast)) {
    const index = row.batters.length === 1 ? 0 : row.batters.indexOf(arizonaBatter);
    if (index >= 0) picks.set(row.batterCardIds[index], row.batters[index]);
    picks.set(row.pitcherCardId, row.pitcher);
  }
  return players.map(player => ({
    ...player,
    pick: picks.has(player.id),
    noticeName: picks.get(player.id),
    ovr: null,
  }));
}
