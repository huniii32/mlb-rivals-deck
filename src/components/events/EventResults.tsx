import { EVENT_MISSIONS, type EventState } from "../../lib/events";
import { time, prizeStatus, auditLabels } from "./eventView";

export default function EventResults({ state }: { state: EventState }) {
  const nameOf = (id: string | null) =>
    state.rankings.find(r => r.id === id)?.deck_name ||
    state.tickets.find(t => t.participant_id === id)?.deck_name ||
    "당첨자 확인 중";
  return (
    <section className="event-panel event-results">
      <div className="eyebrow">WINNERS</div>
      <h3>당첨 결과</h3>
      <p>
        기프티콘은 당첨 덱의 사이트 쪽지함으로 보내드립니다. 별도 게임 덱 인증 자료는 필요하지 않습니다.
        덱랭킹에서 비밀번호로 내 덱을 가져온 뒤 상단 쪽지함을 확인해주세요.
      </p>
      <div className="event-winners">
        <div>
          <span>🏆 스킬 점수 1위</span>
          <strong>
            {state.event.phase !== "open" && state.event.champion_id
              ? nameOf(state.event.champion_id)
              : state.event.phase === "open"
                ? "마감 후 확정"
                : "도전 참가자 없음"}
          </strong>
          <small>커피 기프티콘 1개</small>
          {state.event.champion_id && (
            <span className="event-prize-status">
              {prizeStatus(
                state.event.champion_delivered_at,
              )}
            </span>
          )}
        </div>
        <div>
          <span>🎟 응모권 추첨 당첨자</span>
          <strong>
            {state.event.winner_id
              ? nameOf(state.event.winner_id)
              : state.event.phase === "drawn"
                ? "추첨 대상 없음"
                : "추첨 후 공개"}
          </strong>
          <small>커피 기프티콘 1개 · 점수 1위 제외</small>
          {state.event.winner_id && (
            <span className="event-prize-status">
              {prizeStatus(
                state.event.winner_delivered_at,
              )}
            </span>
          )}
        </div>
      </div>
      {state.event.winning_ticket && (
        <p>당첨 응모권: {state.event.winning_ticket}</p>
      )}
      <details className="event-details">
        <summary>
          전체 응모권 · {state.tickets.length || 0}장 / 추첨 대상{" "}
          {state.tickets.filter((t) => t.eligible).length || 0}장
        </summary>
        <p>
          {state.event.phase === "open"
            ? "마감 시 점수 1위의 응모권을 모두 제외합니다."
            : "점수 1위의 응모권은 추첨 대상에서 제외됐습니다."}
        </p>
        {state.tickets.map((t) => (
          <div className="event-ticket" key={t.id}>
            <strong>{t.deck_name}</strong>
            <span>
              {EVENT_MISSIONS[t.mission]} ·{" "}
              {t.eligible ? "추첨 대상" : "점수 1위 · 제외"}
            </span>
            <small>{t.id}</small>
          </div>
        ))}
      </details>
      {state.audit.length ? (
        <details className="event-details">
          <summary>이벤트 진행 기록</summary>
          {state.audit.map((a, i) => (
            <p key={i}>
              {time(a.at)} · {auditLabels[a.action] || a.action}
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
