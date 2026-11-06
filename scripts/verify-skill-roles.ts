import assert from "node:assert/strict";
import { blankPlayer, LINEUP, resizeBullpen, type Deck } from "../src/lib/deck";
import { BULLPEN_ROLES, bullpenRole } from "../src/lib/bullpen";
import { deckPlayerResults, skillScore } from "../src/lib/engine";
import { NEW_SKILLS } from "../src/lib/skillUpdates";
const tables = { overrides: {}, customs: [] };
let players = LINEUP.map(l => ({ ...blankPlayer(l.row, l.kind, l.pos, l.order), name: l.pos }));
players = resizeBullpen(players, "winning", 3);
players = resizeBullpen(players, "chasing", 2);
const names = [
  "[S0] 신속한 처리 (중계, 3아웃 평균)",
  "[S4] 신속한 처리 (중계, 3아웃 평균)",
  "[S0] 레버리지 릴리퍼 (중계, 첫 3아웃 O)",
  "[S0] 레버리지 릴리퍼 (중계, 첫 3아웃 X)",
  "[S2] 승리 공식 (중계, 동점·리드 O)",
  "[S2] 승리 공식 (중계, 동점·리드 X)",
  "[S0] 컴백 플래그 (중계, 동점·열세 O, 팀버프 X)",
  "[S0] 컴백 플래그 (중계, 동점·열세 X, 팀버프 X)",
  "[s0] 신속한\u200b처리(중계,3아웃평균)",
  ...NEW_SKILLS.filter(s => s.rpOnly).map(s => s.name),
];
let count = 0;
for (const skill of names) {
  const deck: Deck = { id: "role", name: "역할 검증", updatedAt: 1, chem: {}, flags: {}, yearInputs: {},
    players: players.map(p => ({ ...p, skills: [skill, "", "", ""] })) };
  const results = deckPlayerResults(deck, tables);
  for (let i = 9; i < players.length; i++) {
    const role = bullpenRole(players[i]);
    const allowed = role && role !== "closer";
    assert.equal(results[i].skill, allowed ? skillScore("pitcher", skill, tables) : 0, `${players[i].pos}: ${skill}`);
    assert.equal(results[i].warnings.some(w => w.includes("중계 투수 전용")), !allowed);
    count += 2;
  }
}
// 슬롯 번호가 같아도 역할을 마무리로 바꾸면 즉시 비활성화한다.
for (const role of BULLPEN_ROLES) {
  const deck: Deck = { id: "role", name: "역할 변경", updatedAt: 1, chem: {}, flags: {}, yearInputs: {},
    players: players.map(p => p.excelRow === 31 ? { ...p, bullpenRole: role, skills: [names[0], "", "", ""] } : p) };
  const i = deck.players.findIndex(p => p.excelRow === 31);
  assert.equal(deckPlayerResults(deck, tables)[i].skill, role === "closer" ? 0 : 30.55);
  count++;
}
console.log(`skill role eligibility: ${count} passed`);
