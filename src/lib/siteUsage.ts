import {useEffect} from 'react';

export const pageNames = {
  lineup:'내 라인업', skills:'스킬 비교', ranking:'덱랭킹', news:'정보글',
  simulator:'시뮬레이터 목록', 'sim-skills':'스킬 시뮬레이터', 'sim-combination':'모먼트 조합',
  'sim-hof':'명예의 전당', 'sim-event':'이벤트', 'rivals-series':'라이벌 시리즈',
  'deck-score':'덱스코어 데모', 'event-demo':'이벤트 데모', 'admin-login':'관리자 로그인',
  'admin-event':'이벤트 관리', 'admin-messages':'쪽지 관리', 'admin-usage':'이용 통계'
} as const;
export type UsagePage = keyof typeof pageNames;
let temporaryId: string | undefined;
function browserId() {
  const key='rivals-usage-browser';
  try {
    const saved=localStorage.getItem(key);
    if (saved && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved)) return saved;
    const id=crypto.randomUUID();
    localStorage.setItem(key,id);
    return id;
  } catch { return temporaryId ??= crypto.randomUUID(); }
}

export function useSiteUsage(page: UsagePage | null) {
  useEffect(()=>{
    // Cloudflare serves the same-origin collector on both production and branch previews.
    if (!page || !location.hostname.endsWith('.pages.dev') || !crypto.randomUUID) return;
    const view=crypto.randomUUID();
    const browser=browserId();
    let seq=0, milliseconds=0, last=performance.now(), active=false, started=false;
    function report(next:boolean) {
      const now=performance.now();
      if (active) milliseconds+=Math.min(35000, Math.max(0, now-last));
      last=now;
      if (!active && !next) return;
      started=true;
      active=next;
      const body=JSON.stringify({view,browser,page,seq:++seq,active,seconds:Math.floor(milliseconds/1000)});
      void fetch('/api/usage',{method:'POST',body,keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>{});
    }
    function sync() {report(document.visibilityState==='visible' && document.hasFocus());}
    function stop() {report(false);}
    // Deferring the first observation also skips React StrictMode's discarded mount.
    const first=setTimeout(sync,0);
    const timer=setInterval(sync,30000);
    document.addEventListener('visibilitychange',sync);
    window.addEventListener('focus',sync);
    window.addEventListener('blur',stop);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',sync);
    return ()=>{
      clearTimeout(first); clearInterval(timer);
      document.removeEventListener('visibilitychange',sync);
      window.removeEventListener('focus',sync); window.removeEventListener('blur',stop);
      window.removeEventListener('pagehide',stop); window.removeEventListener('pageshow',sync);
      if(started) stop();
    };
  },[page]);
}
