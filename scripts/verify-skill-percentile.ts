import assert from "node:assert/strict";
import { availableSkills, momentSkills, skillId, type SimSettings } from "../src/lib/skillSimulator";
import { createScoreEvaluator } from "../src/lib/simulatorScore";
import { skillScoreTail } from "../src/lib/skillPercentile";

const base: SimSettings = {
  card: "normal",
  position: "SP",
  ticket: "superior",
  protectS: true,
  momentSkill: "",
};
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} vs ${expected}`);
const simulator = createScoreEvaluator(base, { customs: [], overrides: {} });
const example = skillScoreTail({ settings: base, scores: simulator.scores, target: 42.81, locked: null });
close(example.atLeast, 0.001461038961038946);
close(example.unknown, 0);
for (const [card, tier, expected] of [
  ["normal", "Moment", 0],
  ["moment", "Moment", 0.06],
  ["supreme", "Moment", 0.3],
  ["hof", "HOF", 1 - 0.9 ** 3],
  ["black", "Black", 1],
  ["wbcBlack", "Black", 1],
] as const) {
  const settings = { ...base, card, momentSkill: momentSkills(base.position)[0].name };
  const scores = Object.fromEntries(
    availableSkills(settings).map((s) => [skillId(s), s.tier === tier ? 1 : 0]),
  );
  const result = skillScoreTail({ settings, scores, locked: null, target: 1 });
  close(result.atLeast, expected);
  close(result.unknown, 0);
}
const advanced = { ...base, card: "black", ticket: "advanced" } as const;
const blackScores = Object.fromEntries(
  availableSkills(advanced).map((s) => [skillId(s), s.tier === "Black" ? 1 : 0]),
);
close(skillScoreTail({ settings: advanced, scores: blackScores, locked: null, target: 2 }).atLeast, 0);
close(
  skillScoreTail({ settings: advanced, scores: blackScores, locked: null, target: 1 }).atLeast,
  1 - 0.95 ** 4,
);
const held = { ...availableSkills(base).find((s) => s.tier === "Gold")!, level: "D" as const };
const locked = { ...held, id: skillId(held) };
const scores = Object.fromEntries(availableSkills(base).map((s) => [skillId(s), 1]));
close(skillScoreTail({ settings: base, locked, scores, target: 2 }).atLeast, 1);
close(skillScoreTail({ settings: base, locked, scores, target: 3 }).atLeast, 0);
close(skillScoreTail({ settings: base, locked: null, scores: {}, target: 0 }).unknown, 1);
const unprotected = skillScoreTail({ settings: { ...base, protectS: false }, locked: null, scores, target: 3 });
assert.ok(unprotected.unknown > 0 && unprotected.atLeast > 0);
close(unprotected.unknown + unprotected.atLeast, 1);
console.log(
  "Skill rarity: score tail, card-exclusive rates, Black cap, first-slot lock, ties and missing mass passed.",
);
