import { browserRandom, createSimulator, type Board, type Random, type SimSettings } from '../lib/skillSimulator';
import { createScoreEvaluator } from '../lib/simulatorScore';
export const SETTINGS: SimSettings = { card:'normal',ticket:'superior',position:'SP',protectS:true,momentSkill:'' };
export const EVALUATOR=createScoreEvaluator(SETTINGS,{customs:[],overrides:{}});
export const MISSIONS={deck:'덱 등록',skills:'스킬 시뮬레이터',moment:'슈프림 모먼트 조합',hof:'일반 HOF 영입'} as const;
export type Mission=keyof typeof MISSIONS;
export interface Attempt {number:number;board:Board;score:number;at:string}
export interface Entry {id:string;owner:string;name:string;mission:Mission;at:string}
export interface Rank {id:string;name:string;score:number;sample?:boolean}
export interface EventState {version:2;name:string;registered:boolean;attempts:Attempt[];evidence:Partial<Record<Mission,string>>;entries:Entry[];phase:'open'|'closed';snapshot:Entry[];excluded:Entry[];champion:Rank|null;winner:Entry|null;closedAt:string|null;drawnAt:string|null}
export const SAMPLE_RANKS:Rank[]=[{id:'demo-a',name:'핀스트라이프',score:42.68,sample:true},{id:'demo-b',name:'다저블루',score:40.12,sample:true},{id:'demo-c',name:'그린몬스터',score:37.85,sample:true}];
export const SAMPLE_ENTRIES:Entry[]=SAMPLE_RANKS.flatMap((r,i)=>(Object.keys(MISSIONS) as Mission[]).slice(0,4-i).map((m,j)=>({id:`DEMO-${i+1}${j+1}`,owner:r.id,name:r.name,mission:m,at:'데모 예시'})));
export const freshEvent=():EventState=>({version:2,name:'나의 드림팀',registered:false,attempts:[],evidence:{},entries:[],phase:'open',snapshot:[],excluded:[],champion:null,winner:null,closedAt:null,drawnAt:null});
export function ranks(s:EventState):Rank[]{return [...SAMPLE_RANKS,...(s.attempts.length?[{id:'me',name:s.name,score:Math.max(...s.attempts.map(a=>a.score))}]:[])].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'ko'));}
export function register(s:EventState,name:string,at=new Date().toISOString()):EventState{if(s.phase!=='open'||s.registered||!name.trim())return s;return {...s,name:name.trim().slice(0,24),registered:true,evidence:{...s.evidence,deck:at}};}
export function challenge(s:EventState,random:Random=browserRandom(),at=new Date().toISOString()):EventState{
 if(!s.registered||s.phase!=='open'||s.attempts.length>=5)return s;
 const board=createSimulator(SETTINGS,random)();const result=EVALUATOR.board(board);
 if(result.total===null)throw new Error('점수표에 없는 스킬입니다. 도전 횟수를 사용하지 않았습니다.');
 return {...s,attempts:[...s.attempts,{number:s.attempts.length+1,board,score:Math.round(result.total*100)/100,at}],evidence:{...s.evidence,skills:s.evidence.skills??at}};
}
export function record(s:EventState,mission:'moment'|'hof',at=new Date().toISOString()):EventState{if(!s.registered||s.phase!=='open')return s;return {...s,evidence:{...s.evidence,[mission]:s.evidence[mission]??at}};}
export function claim(s:EventState,mission:Mission,at=new Date().toISOString()):EventState{
 if(!s.registered||s.phase!=='open'||!s.evidence[mission]||s.entries.some(e=>e.mission===mission))return s;
 return {...s,entries:[...s.entries,{id:`MY-${String(s.entries.length+1).padStart(3,'0')}`,owner:'me',name:s.name,mission,at}]};
}
function choose<T>(rows:T[],random:Random):T{const n=random();if(!Number.isFinite(n)||n<0||n>=1||!rows.length)throw new Error('추첨 대상을 확인하세요.');return rows[Math.floor(n*rows.length)];}
export function closeEvent(s:EventState,random:Random=browserRandom(),at=new Date().toISOString()):EventState{
 if(s.phase!=='open')return s;const ordered=ranks(s);const top=ordered.filter(r=>r.score===ordered[0].score);
 const champion=choose(top,random);
 const all=[...SAMPLE_ENTRIES,...s.entries];
 return {...s,phase:'closed',closedAt:at,champion,
  snapshot:all.filter(e=>e.owner!==champion.id).map(e=>({...e})),
  excluded:all.filter(e=>e.owner===champion.id).map(e=>({...e}))};
}
export function drawRaffle(s:EventState,random:Random=browserRandom(),at=new Date().toISOString()):EventState{
 if(s.phase!=='closed'||!s.champion||s.winner)return s;
 const eligible=s.snapshot.filter(e=>e.owner!==s.champion!.id);
 if(!eligible.length)return s;
 return {...s,winner:{...choose(eligible,random)},drawnAt:at};
}
