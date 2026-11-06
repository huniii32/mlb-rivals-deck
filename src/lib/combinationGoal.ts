import type {CombinationPlayer} from './combinationRoster';
export type CombinationGoal = {mode:'supreme'} | {mode:'wishlist';ids:string[]};
export function matchesCombinationGoal(player:CombinationPlayer,goal:CombinationGoal){return goal.mode==='supreme'?player.grade==='supreme':goal.ids.includes(player.id);}
export function validCombinationGoal(pool:CombinationPlayer[],goal:CombinationGoal){return goal.mode==='supreme'||goal.ids.length>0&&goal.ids.every(id=>pool.some(p=>p.id===id));}
