import {findCandidates, type SeriesPlayer, type SearchOptions} from './rivalsSeries';
import {forecastRoster} from './rivalPickForecastRoster';

self.onmessage = (event: MessageEvent<SearchOptions & {forecastBatter?: string; roster?: SeriesPlayer[]}>) => {
  try { self.postMessage({results:findCandidates(event.data, 160, event.data.forecastBatter ? forecastRoster(event.data.forecastBatter) : event.data.roster)}); }
  catch { self.postMessage({error:'조합을 계산하지 못했습니다. 다시 시도해주세요.'}); }
};
