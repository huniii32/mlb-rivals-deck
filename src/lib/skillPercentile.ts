import { createDrawPlan, skillId, type DrawSkill, type SimSettings } from "./skillSimulator";

export interface PercentileInput {
  settings: SimSettings;
  locked: DrawSkill | null;
  target: number;
  scores: Record<string, number>;
}
export interface ScoreTail {
  atLeast: number;
  unknown: number;
}

/** Enumerate a single change under the simulator's slot/duplicate model.
 * Unscored branches keep their probability mass, including D–A draws. */
export function skillScoreTail({ settings, locked, target, scores }: PercentileInput): ScoreTail {
  const plan = createDrawPlan(settings, locked);
  const protectedS = settings.protectS || settings.card === "moment" || settings.card === "supreme";
  function prepare(rule: typeof plan.afterBlack) {
    const tierTotal = rule.weights.reduce((sum, weight) => sum + weight, 0);
    return rule.tiers.map((tier, index) => {
      const skills = rule.pools[tier]!.map((skill) => {
        const weight = skill.rates.reduce((sum, rate) => sum + rate, 0);
        return {
          name: skill.name,
          weight,
          score: scores[skillId(skill)],
          sProbability: protectedS ? 1 : weight ? skill.rates[4] / weight : 0,
        };
      });
      return { tier, chance: rule.weights[index] / tierTotal, skills };
    });
  }
  const afterBlack = prepare(plan.afterBlack);
  const required = Math.round(target * 100);
  const used = new Set(locked ? [locked.name] : []);
  let atLeast = 0,
    unknown = 0;
  for (const variant of plan.variants) {
    const slots = variant.map(prepare);
    function visit(slot: number, sum: number, mass: number, blackDrawn: boolean) {
      if (slot === slots.length) {
        if (Math.round(sum * 100) >= required) atLeast += mass;
        return;
      }
      const rule = blackDrawn && settings.ticket === "advanced" ? afterBlack : slots[slot];
      for (const { tier, chance, skills } of rule) {
        let remaining = 0;
        for (const skill of skills) if (!used.has(skill.name)) remaining += skill.weight;
        if (remaining <= 0) throw Error("스킬 확률표를 확인해주세요.");
        for (const skill of skills) {
          if (!skill.weight || used.has(skill.name)) continue;
          const probability = (mass * chance * skill.weight) / remaining;
          if (!Number.isFinite(skill.score)) {
            unknown += probability;
            continue;
          }
          unknown += probability * (1 - skill.sProbability);
          if (skill.sProbability === 0) continue;
          used.add(skill.name);
          visit(slot + 1, sum + skill.score, probability * skill.sProbability, blackDrawn || tier === "Black");
          used.delete(skill.name);
        }
      }
    }
    visit(locked ? 1 : 0, 0, 1 / plan.variants.length, false);
  }
  return { atLeast: Math.min(1, atLeast), unknown: Math.min(1, unknown) };
}
