import { useMemo, useState } from "react";
import { skillScore, type PlayerInput, type SkillTables } from "../lib/engine";
import { presetFromPlayer } from "../lib/simulatorPreset";
import { createScoreEvaluator } from "../lib/simulatorScore";
import { momentSkills, POSITIONS, slotCount } from "../lib/skillSimulator";
import { SkillPercentile } from "./SkillPercentile";

export default function PlayerSkillPercentile({
  player,
  players,
  tables,
}: {
  player: PlayerInput;
  players: PlayerInput[];
  tables: SkillTables;
}) {
  const [momentChoice, setMomentChoice] = useState("");
  const model = useMemo(() => {
    try {
      const pos = player.pos.trim().toUpperCase().replace(/\d+$/, "");
      if (
        !Object.prototype.hasOwnProperty.call(POSITIONS, pos) ||
        (player.kind === "pitcher") !== ["SP", "RP", "CP"].includes(pos)
      )
        return { message: "선수의 포지션을 확인하세요." };
      const preset = presetFromPlayer(player, tables, "superior", players);
      const { settings, board, choices } = preset;
      const slots = slotCount(settings.card);
      if (board.length !== slots)
        return { message: `확률표와 연결되는 서로 다른 스킬 ${slots}개를 입력하세요.` };
      if (board.some((s) => s.level !== "S"))
        return { message: "등록된 스킬을 모두 S 기준으로 평가할 수 있어야 계산할 수 있습니다." };
      let moments: string[] | undefined;
      if (settings.card === "moment" && !board.some((s) => s.tier === "Moment")) {
        moments = momentSkills(settings.position).map((s) => s.name);
        if (!moments.includes(momentChoice))
          return { moments, message: "이 카드에서 등장할 전용 모먼트 스킬을 선택하세요." };
        settings.momentSkill = momentChoice;
      }
      const scorer = createScoreEvaluator(settings, tables, choices);
      let target = 0;
      for (const skill of board) {
        // A held skill may have come from a different ticket. Use its registered
        // condition for the threshold even if it cannot appear in a new draw.
        const row = choices[skill.id];
        const score = row
          ? skillScore(player.kind, row, tables)
          : scorer.selected.get(skill.id)?.name === "중계 투수 전용 효과 미적용"
            ? 0
            : null;
        if (score === null)
          return { moments, message: `${skill.name}의 등록 조건에 해당하는 S 점수를 확인할 수 없습니다.` };
        target += score;
      }
      return { moments, settings, target, scores: scorer.scores };
    } catch (e) {
      return { message: e instanceof Error ? e.message : "등록한 스킬을 확인하세요." };
    }
  }, [player, players, tables, momentChoice]);
  return (
    <div>
      {model.moments && (
        <label>
          카드 전용 모먼트 스킬{" "}
          <select
            value={model.moments.includes(momentChoice) ? momentChoice : ""}
            onChange={(e) => setMomentChoice(e.target.value)}
          >
            <option value="">선택하세요</option>
            {model.moments.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {model.settings && (
        <SkillPercentile settings={model.settings} scores={model.scores} target={model.target} locked={null} />
      )}
      {model.message && <p>{model.message}</p>}
      <small>
        최고급 변경권 · S 보호 · 잠금 없음 기준입니다. 등록한 S1~S4는 S0로 환산하며, 다른 스킬의 조건은
        시뮬레이터 기본값을 사용합니다.
      </small>
    </div>
  );
}
