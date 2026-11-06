import assert from 'node:assert/strict';
import { EVENT_OPENS_AT, isEventOpen } from '../src/demo/eventAvailability';
assert.equal(EVENT_OPENS_AT, Date.parse('2026-11-08T15:00:00Z'));
assert.equal(isEventOpen(EVENT_OPENS_AT - 1), false);
assert.equal(isEventOpen(EVENT_OPENS_AT), true);
assert.equal(isEventOpen(EVENT_OPENS_AT + 1), true);
import { freshEvent, register, challenge, record, claim, closeEvent, drawRaffle, ranks, SAMPLE_ENTRIES, SETTINGS, EVALUATOR } from '../src/demo/eventModel';
let state = freshEvent();
assert.equal(challenge(state), state);
assert.equal(claim(state, 'deck'), state);
assert.equal(record(state, 'hof'), state);
state = register(state, '검증 덱');
state = claim(state, 'deck');
assert.equal(claim(state, 'deck'), state);
assert.equal(claim(state, 'skills'), state);
for (let i = 0; i < 8; i++) state = challenge(state);
assert.equal(state.attempts.length, 5);
assert.equal(ranks(state).find(row => row.id === 'me')!.score, Math.max(...state.attempts.map(row => row.score)));
state = claim(state, 'skills');
for (const kind of ['moment', 'hof'] as const) state = claim(record(state, kind), kind);
assert.equal(state.entries.length, 4);
assert.equal(new Set(state.entries.map(entry => entry.mission)).size, 4);
const closed = closeEvent(state, () => 0);
assert.equal(SETTINGS.position, 'SP');
assert.equal(SETTINGS.protectS, true);
for (const attempt of state.attempts) {
  assert(attempt.board.every(skill => skill.level === 'S'));
  assert.equal(attempt.score, Math.round(EVALUATOR.board(attempt.board).total! * 100) / 100);
}
assert.equal(closed.snapshot.length + closed.excluded.length, SAMPLE_ENTRIES.length + 4);
assert(closed.snapshot.every(entry => entry.owner !== closed.champion!.id));
assert(closed.excluded.every(entry => entry.owner === closed.champion!.id));
assert.equal(challenge(closed), closed);
assert.equal(claim(closed, 'deck'), closed);
assert.equal(closeEvent(closed), closed);
const first = drawRaffle(closed, () => 0);
assert.equal(first.winner!.id, closed.snapshot[0].id);
assert.equal(drawRaffle(first), first);
const last = drawRaffle(closed, () => 0.999999);
assert.equal(last.winner!.id, closed.snapshot[closed.snapshot.length - 1].id);
assert.equal(drawRaffle(state), state);
// Exclude every ticket of the point winner, including when the current user wins.
const myWin = closeEvent({...state, attempts: [{...state.attempts[0], score: 100}]}, () => 0);
assert.equal(myWin.champion!.id, 'me');
assert.equal(myWin.excluded.length, 4);
assert.equal(myWin.snapshot.length, SAMPLE_ENTRIES.length);
for (let i = 0; i < myWin.snapshot.length; i++) {
  const result = drawRaffle(myWin, () => (i + .5) / myWin.snapshot.length);
  assert.equal(result.winner!.id, myWin.snapshot[i].id);
  assert.notEqual(result.winner!.owner, myWin.champion!.id);
}
// A score winner who did not claim tickets does not remove other participants.
const noOwnTickets = closeEvent({...state, entries: [], attempts: [{...state.attempts[0], score: 100}]}, () => 0);
assert.equal(noOwnTickets.excluded.length, 0);
assert.equal(noOwnTickets.snapshot.length, SAMPLE_ENTRIES.length);
// Resolve the first-place tie first; only the selected prize winner is excluded.
const tied = {...state, attempts: [{...state.attempts[0], score: 42.68}]};
const tiedFirst = closeEvent(tied, () => 0), tiedLast = closeEvent(tied, () => .999999);
assert.notEqual(tiedFirst.champion!.id, tiedLast.champion!.id);
for (const outcome of [tiedFirst, tiedLast]) {
  assert(outcome.snapshot.every(e => e.owner !== outcome.champion!.id));
  const other = outcome.champion!.id === 'me' ? 'demo-a' : 'me';
  assert(outcome.snapshot.some(e => e.owner === other));
}
const empty = {...myWin, snapshot: []};
assert.equal(drawRaffle(empty), empty);
const onlyChampion = {...myWin, snapshot: myWin.excluded};
assert.equal(drawRaffle(onlyChampion), onlyChampion);
console.log('Event demo: pitcher S scores, five attempts, unique tickets, champion exclusion, ties, eligible-ticket draw and one prize per participant passed.');
