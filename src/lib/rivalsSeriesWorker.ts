import {findCandidates, type SearchOptions} from './rivalsSeries';
self.onmessage = (event: MessageEvent<SearchOptions>) => {
  try { self.postMessage({results:findCandidates(event.data)}); }
  catch { self.postMessage({error:'조합을 계산하지 못했습니다. 다시 시도해주세요.'}); }
};
