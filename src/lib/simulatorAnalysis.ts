export interface AnalysisResult { completed: number; requested: number; cap: number; attempts: number; successes: number; within100: number; mean: number | null; median: number | null; stopped: boolean }
/** Independent experiments, each stopping on its first hit. Capped failures stay in the denominator. */
export async function analyzeTrials(makeTrial: ()=>()=>boolean, runs:number, cap:number, signal:AbortSignal, progress:(completed:number,attempts:number)=>void=()=>{}, yieldWork:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,0))):Promise<AnalysisResult> {
  if(!Number.isInteger(runs)||runs<1||runs>1000||!Number.isInteger(cap)||cap<100||cap>10000||runs*cap>2000000)throw new Error('분석은 최대 1,000개 실험·실험당 100~10,000회·총 200만 회까지 가능합니다.');
  const hits:number[]=[];let completed=0,attempts=0;
  for(let i=0;i<runs&&!signal.aborted;i++){
    const trial=makeTrial();let done=false;
    for(let n=1;n<=cap&&!signal.aborted;n++){
      const hit=trial();attempts++;
      if(hit){hits.push(n);completed++;done=true;}
      else if(n===cap){completed++;done=true;}
      if(attempts%2000===0){progress(completed,attempts);await yieldWork();}
      if(done)break;
    }
  }
  hits.sort((a,b)=>a-b);const middle=Math.floor(hits.length/2);
  progress(completed,attempts);
  return {completed,requested:runs,cap,attempts,successes:hits.length,within100:hits.filter(n=>n<=100).length,mean:hits.length?hits.reduce((a,b)=>a+b,0)/hits.length:null,median:hits.length?(hits.length%2?hits[middle]:(hits[middle-1]+hits[middle])/2):null,stopped:signal.aborted};
}
