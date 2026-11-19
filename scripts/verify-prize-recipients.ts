import assert from 'node:assert/strict';
import { findPrizeRecipients, listAllMessageRecipients, PRIZE_LABELS, type MessageRecipient, type mailboxRequest } from '../src/lib/privateMessages';
async function main() {
  const ordinary: MessageRecipient[] = Array.from({length:50},(_,i)=>({id:`ordinary-${i}`,deck_name:`Other ${i}`}));
  const champion={id:'rank-champion',deck_name:'Renamed champion',award:PRIZE_LABELS.champion};
  const winner={id:'rank-winner',deck_name:'Current winner',award:PRIZE_LABELS.winner};
  const calls:number[]=[];
  const request = (async(action:string,args:Record<string,unknown>)=>{
    assert.equal(action,'operator_recipients');assert.equal(args.p_session,'operator');assert.equal(args.p_event,'event-id');
    calls.push(args.p_offset as number);return args.p_offset===0?ordinary:[champion,winner];
  }) as typeof mailboxRequest;
  assert.deepEqual(await findPrizeRecipients('operator','event-id',['champion','winner'],request),{champion,winner});
  assert.deepEqual(calls,[0,50]);
  calls.length=0;
  assert.deepEqual(await listAllMessageRecipients('operator','event-id','',request),[...ordinary,champion,winner]);
  assert.deepEqual(calls,[0,50]);
  const hundred=Array.from({length:100},(_,i)=>({id:`rank-${i}`,deck_name:`Deck ${i}`}));
  const offsets:number[]=[];
  const exactPages=(async(_action:string,args:Record<string,unknown>)=>{
    assert.equal(args.p_query,'Deck'); const offset=Number(args.p_offset); offsets.push(offset); return hundred.slice(offset,offset+50);
  }) as typeof mailboxRequest;
  assert.deepEqual(await listAllMessageRecipients('operator','event-id','Deck',exactPages),hundred);
  assert.deepEqual(offsets,[0,50,100]);
  assert.deepEqual(await listAllMessageRecipients('operator','event-id','missing',(async()=>[]) as typeof mailboxRequest),[]);
  await assert.rejects(listAllMessageRecipients('operator','event-id','',(async()=>ordinary) as typeof mailboxRequest),/pagination_failed/);
  await assert.rejects(listAllMessageRecipients('operator','event-id','',async()=>{throw Error('session_expired')}),/session_expired/);
  // A same-name deck without the server award is never substituted for a removed winner.
  const removed=(async()=>[{id:'different-rank',deck_name:'Renamed champion'},winner]) as typeof mailboxRequest;
  assert.deepEqual(await findPrizeRecipients('operator','event-id',['champion','winner'],removed),{winner});
  assert.deepEqual(await findPrizeRecipients('operator','event-id',[],async()=>{throw Error('no call expected')}),{});
  await assert.rejects(findPrizeRecipients('operator','event-id',['champion'],(async()=>ordinary) as typeof mailboxRequest),/pagination_failed/);
  await assert.rejects(findPrizeRecipients('expired','event-id',['winner'],async()=>{throw Error('session_expired')}),/session_expired/);
  console.log('Winner recipients: pagination, authoritative awards, renamed/deleted decks, no name fallback and auth failure PASS');
}
void main();
