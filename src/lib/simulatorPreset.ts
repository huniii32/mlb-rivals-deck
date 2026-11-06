import type {PlayerInput,SkillTables} from './engine';
import {availableSkills,canLockFirst,momentSkills,skillId,slotCount,TICKETS,POSITIONS,type SimSettings,type DrawSkill,type Board,type SimCard,type SimPosition,type Level} from './skillSimulator';
import {createScoreEvaluator,type ScoreChoices} from './simulatorScore';
export interface SkillPreset {settings:SimSettings;board:Board;locked:DrawSkill|null;choices:ScoreChoices;message:string}
const nameKey=(name:string)=>name.replace(/^\[[^\]]+\]\s*/,'').split('(')[0].replace(/\s/g,'').toLowerCase().replace(/^worldbaseballclassic/,'wbc').replace(/^파워피처$/,'파워피쳐');
export function presetSkills(settings:SimSettings){
  const all=new Map<string,ReturnType<typeof availableSkills>[number]>();
  for(const ticket of Object.keys(TICKETS) as (keyof typeof TICKETS)[])for(const s of availableSkills({...settings,ticket}))all.set(skillId(s),s);
  return [...all.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
export function lockedPreset(settings:SimSettings,id:string,level:Level):SkillPreset {
  const skill=presetSkills(settings).find(s=>skillId(s)===id);
  if(!skill)throw new Error('선택한 스킬을 찾을 수 없습니다.');
  const held={id,name:skill.name,tier:skill.tier,level};
  if(!canLockFirst(settings,held))throw new Error('이 카드에서 잠글 수 없는 스킬입니다.');
  return {settings,board:[held],locked:held,choices:{},message:`${held.name} ${level} 잠금으로 시작합니다. 변경되는 2개 스킬만 점수에 합산합니다.`};
}
function playerCard(card:string):SimCard|null {
  const key=card.replace(/\s/g,'');
  if(/WBC/.test(key)&&/블랙/.test(key))return 'wbcBlack';
  if(/블랙/.test(key))return 'black';
  if(/슈프림/.test(key))return 'supreme';
  if(/모먼트/.test(key))return 'moment';
  if(/명예의전당|HOF/.test(key))return 'hof';
  if(/WBC/.test(key))return 'wbc';
  if(/일반|라이브|시즌|임팩트|프라임|시그니처/.test(key))return 'normal';
  return null;
}
export function presetFromPlayer(player:PlayerInput,tables:SkillTables,ticket:SimSettings['ticket']='superior'):SkillPreset {
  const card=playerCard(player.card);if(!card)throw new Error('선수의 카드 종류를 먼저 지정하세요.');
  const rawPos=player.pos.replace(/\d+$/,'').toUpperCase();
  const position:SimPosition=player.kind==='pitcher'?(player.bullpenRole==='closer'||rawPos==='CP'?'CP':player.bullpenRole||rawPos==='RP'?'RP':'SP'):Object.prototype.hasOwnProperty.call(POSITIONS,rawPos)&&!['SP','RP','CP'].includes(rawPos)?rawPos as SimPosition:'DH';
  const moment=momentSkills(position).find(s=>player.skills.some(n=>nameKey(n)===nameKey(s.name)));
  const settings:SimSettings={card,position,ticket,protectS:true,momentSkill:moment?.name??momentSkills(position)[0]?.name??''};
  const pool=presetSkills(settings),choices:ScoreChoices={},warnings:string[]=[];
  const mapped=player.skills.slice(0,slotCount(card)).map((source,i)=>{
    if(!source.trim())return null;
    const matched=pool.filter(s=>nameKey(s.name)===nameKey(source));
    const prefix=source.match(/^\[([^\]]+)\]/)?.[1];
    const level:Level|undefined=prefix&&/^S[0-4]?$/.test(prefix)?'S':['A','B','C','D'].includes(prefix??'')?prefix as Level:undefined;
    if(matched.length!==1||!level){warnings.push(`${i+1}번째 스킬은 직접 확인 필요`);return null;}
    const skill=matched[0],id=skillId(skill),draw={id,name:skill.name,tier:skill.tier,level};
    const evaluator=createScoreEvaluator(settings,tables,{},draw);
    const original=source.replace(/^\[S[0-4]?\]/,'[S0]');
    const option=evaluator.options.get(id)?.find(o=>o.name===original);
    if(option)choices[id]=option.name;
    return draw;
  });
  const complete=mapped.every((s):s is DrawSkill=>!!s)&&new Set(mapped.map(s=>s.id)).size===slotCount(card);
  const board:Board=complete?mapped:mapped[0]?[mapped[0]]:[];
  if(!complete)warnings.push('전체 조합을 확인할 수 없어 확인된 첫 슬롯만 유지합니다');
  settings.protectS=board.length>0&&board.every(s=>s.level==='S')||['moment','supreme','wbc','wbcBlack'].includes(card);
  if(card==='moment'&&!moment)warnings.push('전용 모먼트 스킬 선택을 확인하세요');
  return {settings,board,locked:null,choices,message:`${player.name}의 카드·포지션·스킬을 불러왔습니다. S0~S4는 추첨 레벨 S로 표시합니다.${warnings.length?' '+warnings.join(' · '):''} 덱 원본은 변경하지 않습니다.`};
}
