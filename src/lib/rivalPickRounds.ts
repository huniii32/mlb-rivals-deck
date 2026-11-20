export interface OfficialRound { round: number; effectiveAt: string; version: string }
export interface PickPage { key: string; title: string; period: string; release?: OfficialRound; forecast?: boolean }

const dateFormat = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const displayTime = (value: string) => dateFormat.format(new Date(value)).replace(/-/g, '.');

export function pickPages(releases: OfficialRound[], now: number) {
  const ordered = [...releases].sort((a,b)=>Date.parse(a.effectiveAt)-Date.parse(b.effectiveAt));
  const current = ordered.filter(r=>Date.parse(r.effectiveAt)<=now).at(-1);
  const pages: PickPage[] = ordered.map((release,i)=>{
    const start = Date.parse(release.effectiveAt);
    const end = ordered[i+1]?.effectiveAt;
    const label = release===current ? '현재' : start>now ? '다음' : '이전';
    const until = end ? displayTime(end)+' 전' : release.version==='2026-11-19-live18' ? '20차 업데이트 전' : '다음 라이벌픽 적용 전';
    return {key:release.version,release,title:`${label} ${release.round}차 라이벌픽`,period:`(${displayTime(release.effectiveAt)} KST ~ ${until})`};
  });
  if (ordered.at(-1)?.version==='2026-11-19-live18') {
    pages.push({key:'forecast20',forecast:true,title:'다음 20차 라이벌픽',period:'(20차 업데이트부터 · 일정 미정)'});
  } else {
    pages.push({key:'pending',title:'다음 라이벌픽',period:'(예고 대기)'});
  }
  return {pages,currentKey:current?.version ?? pages[0].key};
}
