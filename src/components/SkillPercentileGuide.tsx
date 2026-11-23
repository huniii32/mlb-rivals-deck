import { useRef } from "react";
import { CARD_TYPES, POSITIONS, PROBABILITY_DATA, TICKETS, ruleSummary, type DrawSkill, type SimSettings } from "../lib/skillSimulator";

export function SkillPercentileGuide({ settings, locked }: { settings: SimSettings; locked: DrawSkill | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { card, position, ticket = "superior" } = settings;
  return (
    <div className="skill-percentile-guide">
      <button type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        상위 % 계산 방법
      </button>
      <dialog ref={dialog} aria-labelledby="skill-percentile-guide-title"
        onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div>
          <header className="dialog-header">
            <h2 id="skill-percentile-guide-title">상위 % 계산 방법</h2>
            <button type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
          </header>
          <p><strong>같은 조건에서 변경권 한 장을 썼을 때, 현재 점수 이상이 나올 확률</strong>입니다.
            다른 스킬 조합으로 같은 점수를 얻는 경우도 포함합니다.</p>
          <h3>현재 추첨 조건</h3>
          <p>{CARD_TYPES[card]} · {POSITIONS[position]} · {TICKETS[ticket]} 변경권 · {settings.protectS || ["moment","supreme","wbc","wbcBlack"].includes(card) ? "S 레벨 유지" : "D~S 레벨 추첨"} · {locked ? `첫 줄 잠금 (${locked.name})` : "잠금 없음"}
            {card === "moment" && ticket === "superior" && ` · 전용 스킬 ${settings.momentSkill}`}</p>
          <p>{ruleSummary(card, ticket, locked)}</p>
          <h3>확률을 더하는 방법</h3>
          <ol>
            <li>슬롯 순서대로 가능한 결과를 살펴봅니다. 시뮬레이터는 공식 확률표로 등급을 먼저 정하고, 이미 나온 이름을 제외한 뒤 남은 스킬의 상대 확률을 적용합니다.</li>
            <li>변경되는 슬롯의 S0 점수를 더합니다. 선택한 스킬 조건과 점수표 수정값을 반영하며, 첫 줄을 잠그면 나머지 슬롯의 합계만 비교합니다.</li>
            <li>합계를 소수 둘째 자리로 반올림합니다. 현재 합계와 같거나 높은 모든 결과에 대해 슬롯별 확률을 곱하고, 그 값을 전부 더해 백분율로 표시합니다.</li>
          </ol>
          <h3>계산 예시</h3>
          <p>시그니처 선발 · 최고급 변경권 · S 보호 · 잠금 없음 · 기본 점수 조건에서 결속력, 도전자, 도전정신의 합계는 42.81점입니다. 이 조건에서 42.81점 이상이 나올 확률은 <strong>약 0.15%</strong>입니다.</p>
          <p>변경되는 슬롯에 S 미만 레벨이나 점수 미등록 스킬이 있으면 그 결과의 확률을 ‘평가 불가’로 표시합니다. 이때 ‘최소’는 전체 결과 중 기준 점수 이상으로 확인된 확률입니다.</p>
          <a href={PROBABILITY_DATA.overview.url} target="_blank" rel="noreferrer">공식 변경권 확률표 ↗</a>
        </div>
      </dialog>
    </div>
  );
}
