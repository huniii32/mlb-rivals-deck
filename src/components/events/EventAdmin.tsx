import { useEffect, useRef, useState } from "react";
import {
  EVENT_MISSIONS,
  type EventMission,
  type EventState,
  type EventTicket,
} from "../../lib/events";
import { auditLabels, prizeStatus, score, time } from "./eventView";
import "./EventAdmin.css";

type Action = (
  action: string,
  args?: Record<string, unknown>,
  success?: string,
) => Promise<EventState | undefined>;
const SHORT_MISSIONS: Record<EventMission, string> = {
  deck: "덱",
  skills: "스킬",
  moment: "모먼트",
  hof: "HOF",
};

function DrawStage({
  tickets,
  drawing,
  winner,
  finished,
}: {
  tickets: EventTicket[];
  drawing: boolean;
  winner?: string;
  finished: boolean;
}) {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!drawing || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    let step = 0;
    const timer = setInterval(() => setCursor(++step), 110);
    return () => clearInterval(timer);
  }, [drawing]);
  const card = tickets[cursor % Math.max(1, tickets.length)];
  return (
    <div
      className={`event-draw-stage${drawing ? " is-drawing" : ""}${finished ? " is-revealed" : ""}`}
      aria-busy={drawing}
    >
      <div className="event-draw-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="event-draw-copy">
        <span className="eyebrow">LUCKY TICKET</span>
        <h3>
          {drawing
            ? "행운의 주인공을 찾고 있어요"
            : finished
              ? "추첨 결과가 확정됐습니다"
              : "한 장의 응모권, 한 명의 주인공"}
        </h3>
        <p>
          {drawing
            ? "응모권을 섞는 중입니다…"
            : finished
              ? "확정된 결과는 다시 뽑을 수 없습니다."
              : "점수 1위의 응모권을 제외하고 추첨합니다."}
        </p>
      </div>
      <div className="event-draw-ticket" aria-hidden={drawing}>
        <span>
          {drawing ? "SHUFFLING" : finished ? "WINNER" : "COFFEE TICKET"}
        </span>
        <strong key={drawing ? cursor : "result"}>
          {drawing
            ? card?.deck_name || "응모권 확인 중"
            : finished
              ? winner || "추첨 대상 없음"
              : "당신에게 찾아올 행운"}
        </strong>
        <small>
          {drawing
            ? `응모권 ${String((cursor % Math.max(1, tickets.length)) + 1).padStart(3, "0")}`
            : finished
              ? winner
                ? "커피 기프티콘 1개"
                : "발급된 추첨 대상 응모권이 없습니다"
              : "☕  ONE COFFEE, ONE WINNER"}
        </small>
      </div>
      <span className="event-sr-only" role="status" aria-live="polite">
        {drawing
          ? "응모권을 추첨하고 있습니다."
          : finished
            ? `추첨 완료. ${winner || "당첨 대상 없음"}`
            : "추첨 대기"}
      </span>
    </div>
  );
}

export default function EventAdmin({
  state,
  busy,
  error,
  message,
  onAction,
  onRefresh,
  onLogout,
}: {
  state: EventState;
  busy: boolean;
  error: string;
  message: string;
  onAction: Action;
  onRefresh: () => void;
  onLogout?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false),
    mounted = useRef(true),
    revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(revealTimer.current);
    };
  }, []);
  const e = state.event,
    participants = state.participants || [],
    phase = e.phase;
  const disabled = busy || drawing;
  const eligible = state.tickets.filter((t) => t.eligible);
  const ranks = new Map(state.rankings.map((r) => [r.id, r]));
  const ticketsByPerson = new Map<string, Set<EventMission>>();
  for (const t of state.tickets) {
    if (!ticketsByPerson.has(t.participant_id))
      ticketsByPerson.set(t.participant_id, new Set());
    ticketsByPerson.get(t.participant_id)!.add(t.mission);
  }
  const filtered = participants.filter((p) =>
    p.deck_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const nameOf = (id: string | null) =>
    participants.find((p) => p.id === id)?.deck_name ||
    state.rankings.find((r) => r.id === id)?.deck_name ||
    state.tickets.find((t) => t.participant_id === id)?.deck_name ||
    "해당 없음";
  const ended =
    !!e.ends_at && Date.parse(state.server_now) >= Date.parse(e.ends_at);
  const status = drawing
    ? "추첨 중"
    : phase === "drawn"
      ? "추첨 완료"
      : phase === "closed" || ended
        ? "참여 마감"
        : e.published && Date.parse(state.server_now) >= Date.parse(e.opens_at)
          ? "참여 접수 중"
          : "오픈 준비 중";
  async function draw() {
    if (disabled || drawingRef.current || phase !== "closed") return;
    if (
      !confirm(
        eligible.length
          ? "점수 1위를 제외한 응모권에서 1명을 추첨할까요? 결과는 변경할 수 없습니다."
          : "추첨 가능한 응모권이 없습니다. 대상 없음으로 마무리할까요?",
      )
    )
      return;
    drawingRef.current = true;
    setDrawing(true);
    const started = performance.now();
    const duration =
      eligible.length && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 2600
        : 0;
    const next = await onAction("admin", { p_action: "draw" });
    if (!mounted.current) return;
    const finish = () => {
      drawingRef.current = false;
      setDrawing(false);
    };
    if (!next || next.event.phase !== "drawn") {
      finish();
      return;
    }
    // The server selects once. Animation only delays revealing that saved result.
    revealTimer.current = setTimeout(
      finish,
      Math.max(0, duration - (performance.now() - started)),
    );
  }
  return (
    <div className="event-page event-admin-page">
      <section className="event-panel event-admin">
        <div className="event-admin-title">
          <div>
            <div className="eyebrow">EVENT CONTROL ROOM</div>
            <h2>이벤트 운영 관리</h2>
            <p>{e.title}</p>
          </div>
          <div className="event-status-bar">
            <span>{status}</span>
            <button disabled={disabled} onClick={onRefresh}>
              새로고침
            </button>
            {onLogout && (
              <button disabled={disabled} onClick={onLogout}>
                로그아웃
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="event-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="event-message" role="status">
            {message}
          </p>
        )}
        <div className="event-admin-stats">
          <div>
            <span>참가 덱</span>
            <strong>
              {participants.length}
              <small>명</small>
            </strong>
          </div>
          <div>
            <span>5회 도전 완료</span>
            <strong>
              {participants.filter((p) => p.attempts_used === 5).length}
              <small>명</small>
            </strong>
          </div>
          <div>
            <span>발급한 응모권</span>
            <strong>
              {state.tickets.length}
              <small>장</small>
            </strong>
          </div>
          <div>
            <span>
              {phase === "open" ? "마감 전 응모권" : "추첨 대상 응모권"}
            </span>
            <strong>
              {eligible.length}
              <small>장</small>
            </strong>
          </div>
        </div>
        <div className="event-admin-actions">
          {!e.published && (
            <button
              disabled={disabled || phase !== "open"}
              onClick={() => {
                if (confirm("예약된 시작 시각부터 이벤트 접수를 허용할까요?"))
                  void onAction("admin", { p_action: "publish" });
              }}
            >
              참여 접수 활성화
            </button>
          )}
          <button
            disabled={
              disabled ||
              phase !== "open" ||
              !e.published ||
              Date.parse(state.server_now) < Date.parse(e.opens_at)
            }
            onClick={() => {
              if (
                confirm(
                  "이벤트를 마감하고 점수 1위와 추첨 대상을 확정할까요? 이후에는 참여할 수 없습니다.",
                )
              )
                void onAction("admin", { p_action: "close" });
            }}
          >
            ① 이벤트 마감 · 1위 확정
          </button>
          <button
            className="primary"
            disabled={disabled || phase !== "closed"}
            onClick={() => void draw()}
          >
            ② 당첨자 추첨
          </button>
          <span className="event-admin-period">
            {time(e.opens_at)} 시작 ·{" "}
            {e.ends_at ? `${time(e.ends_at)} 종료` : "운영자가 마감"}
          </span>
        </div>
        <DrawStage
          tickets={eligible}
          drawing={drawing}
          finished={phase === "drawn" && !drawing}
          winner={e.winner_id ? nameOf(e.winner_id) : undefined}
        />
        {!drawing && phase !== "open" && (
          <div className="event-winners">
            {(["champion", "winner"] as const).map((prize) => {
              const id = e[`${prize}_id`],
                verified = e[`${prize}_verified_at`],
                delivered = e[`${prize}_delivered_at`];
              const title = prize === "champion" ? "점수 1위" : "추첨 당첨자";
              const registered = state.verification_decks.find(
                (d) => d.id === id,
              );
              return (
                <div key={prize} className="event-prize-review">
                  <span>
                    {prize === "champion" ? "🏆" : "🎟"} {title}
                  </span>
                  <strong>
                    {id
                      ? nameOf(id)
                      : prize === "winner" && phase !== "drawn"
                        ? "추첨 후 공개"
                        : "대상 없음"}
                  </strong>
                  {id && (
                    <>
                      <span className="event-prize-status">
                        {prizeStatus(verified, delivered)}
                      </span>
                      <details className="event-details">
                        <summary>참가 당시 덱 확인</summary>
                        {Array.isArray(registered?.deck?.players) ? (
                          <>
                            <p>{time(registered.joined_at)} 등록</p>
                            <ul>
                              {registered.deck.players
                                .filter((p) => p?.name)
                                .map((p, i) => (
                                  <li key={i}>
                                    {[p.pos, p.name, p.card]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </li>
                                ))}
                            </ul>
                          </>
                        ) : (
                          <p>
                            덱 사본이 없는 이전 참가 기록입니다. 등록 덱을
                            별도로 확인해주세요.
                          </p>
                        )}
                      </details>
                      <div className="event-admin-actions">
                        <button
                          disabled={disabled || !!verified}
                          onClick={() => {
                            if (
                              confirm(
                                `${nameOf(id)} 님의 실제 게임 덱을 확인했나요?`,
                              )
                            )
                              void onAction("admin", {
                                p_action: `verify_${prize}`,
                              });
                          }}
                        >
                          {title} · 게임 덱 인증 완료
                        </button>
                        <button
                          disabled={disabled || !verified || !!delivered}
                          onClick={() => {
                            if (
                              confirm(
                                `${nameOf(id)} 님에게 기프티콘을 실제로 보냈나요? 지급 완료를 기록합니다.`,
                              )
                            )
                              void onAction("admin", {
                                p_action: `deliver_${prize}`,
                              });
                          }}
                        >
                          {title} · 지급 완료 기록
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {phase !== "open" && !drawing && (
          <p className="event-admin-footnote">
            게임 덱 인증 후 경품을 보내고 지급 완료를 기록하세요. 기프티콘은
            자동 발송되지 않습니다.
          </p>
        )}
      </section>
      <div className="event-admin-overview">
        <section className="event-panel event-admin-ranking">
          <div className="eyebrow">LEADERBOARD</div>
          <h3>스킬 점수 랭킹</h3>
          <p>5회 중 최고점 · 동점은 먼저 달성한 순서</p>
          <ol className="event-rankings">
            {state.rankings.map((r) => (
              <li key={r.id}>
                <b>{r.rank}</b>
                <div>
                  <strong>{r.deck_name}</strong>
                  <small>{time(r.achieved_at)}</small>
                </div>
                <strong>
                  {score(r.score)}
                  <small>점</small>
                </strong>
              </li>
            ))}
          </ol>
          {!state.rankings.length && (
            <p className="event-empty">아직 도전 기록이 없습니다.</p>
          )}
        </section>
        <section className="event-panel event-admin-participants">
          <div className="event-section-heading">
            <div>
              <div className="eyebrow">PARTICIPANTS</div>
              <h3>참가자 활동 · 응모권</h3>
            </div>
            <span>
              {filtered.length} / {participants.length}명
            </span>
          </div>
          <label className="event-admin-search">
            <span className="event-sr-only">참가 덱 검색</span>
            <input
              type="search"
              placeholder="참가 덱 이름 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="event-activity-legend">
            <span>대기: 미참여</span>
            <span>완료: 참여 후 응모권 미수령</span>
            <span>발급: 응모권 수령</span>
          </p>
          <div
            className="event-participant-table"
            role="table"
            aria-label="참가자 활동 및 응모권"
          >
            <div role="row" className="event-participant-head">
              <span role="columnheader">참가 덱</span>
              <span role="columnheader">도전</span>
              <span role="columnheader">최고점</span>
              <span role="columnheader">참여 이력</span>
              <span role="columnheader">응모권</span>
            </div>
            {filtered.map((p) => {
              const best = ranks.get(p.id),
                claims = ticketsByPerson.get(p.id);
              return (
                <div role="row" className="event-participant-row" key={p.id}>
                  <div role="cell" className="event-participant-name">
                    <strong>{p.deck_name}</strong>
                    <small>{time(p.joined_at)} 참여</small>
                    {e.champion_id === p.id && (
                      <small className="event-excluded">
                        점수 1위 · 추첨 제외
                      </small>
                    )}
                  </div>
                  <div role="cell" data-label="도전">
                    <span>{p.attempts_used} / 5회</span>
                  </div>
                  <div role="cell" data-label="최고점">
                    <span>{best ? `${score(best.score)}점` : "미도전"}</span>
                  </div>
                  <div
                    role="cell"
                    className="event-participant-activities"
                    data-label="참여 이력"
                  >
                    {(Object.keys(EVENT_MISSIONS) as EventMission[]).map(
                      (m) => {
                        const status = claims?.has(m)
                          ? "issued"
                          : p.evidence[m]
                            ? "completed"
                            : "pending";
                        const label =
                          status === "issued"
                            ? "발급"
                            : status === "completed"
                              ? "완료"
                              : "대기";
                        return (
                          <span
                            className="event-activity-chip"
                            data-state={status}
                            key={m}
                            title={`${EVENT_MISSIONS[m]} ${label}${p.evidence[m] ? ` · ${time(p.evidence[m]!)}` : ""}`}
                          >
                            {SHORT_MISSIONS[m]} {label}
                          </span>
                        );
                      },
                    )}
                  </div>
                  <div
                    role="cell"
                    className="event-participant-tickets"
                    data-label="응모권"
                  >
                    <strong>{p.ticket_count}장</strong>
                    <small>
                      {phase === "open"
                        ? "최대 4장"
                        : `추첨 ${p.eligible_ticket_count}장`}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
          {!filtered.length && (
            <p className="event-empty">
              {query
                ? "검색 결과가 없습니다."
                : "아직 이벤트 참가자가 없습니다."}
            </p>
          )}
          <p className="event-admin-footnote">
            {phase === "open"
              ? "마감하면 점수 1위의 응모권은 모두 추첨에서 제외됩니다."
              : "제외된 응모권도 발급 이력에 보관됩니다."}
          </p>
        </section>
      </div>
      {!!state.audit.length && (
        <details className="event-panel event-admin-audit">
          <summary>운영 기록 · {state.audit.length}건</summary>
          {state.audit.map((a, i) => (
            <p key={i}>
              {time(a.at)} · {auditLabels[a.action] || a.action}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
