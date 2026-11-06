import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { RankRef } from "../lib/deckFile";
import { supabase } from "../lib/supabase";
import {
  EVENT_ID,
  EVENT_MISSIONS,
  eventAccepting,
  eventError,
  eventRequest,
  type EventMission,
  type EventState,
  type EventPlayer,
} from "../lib/events";
import "./EventPage.css";
import EventAdmin from "./events/EventAdmin";
import { time, score, prizeStatus, auditLabels } from "./events/eventView";

function PlayerResult({ player }: { player: EventPlayer }) {
  return (
    <div className="event-player-result">
      <strong>{player.name}</strong>
      <span>
        {player.grade === "supreme"
          ? "슈프림 모먼트"
          : player.grade === "moment"
            ? "모먼트"
            : "HOF"}
        {player.team ? ` · ${player.team}` : ""}
      </span>
      {player.theme && <small>{player.theme}</small>}
    </div>
  );
}
export default function EventPage({
  deck,
  onRegisterDeck,
  onViewRankings,
  preview,
}: {
  deck?: RankRef;
  onRegisterDeck?: () => void;
  onViewRankings?: () => void;
  preview?: { request: typeof eventRequest; storageKey: string };
}) {
  const [state, setState] = useState<EventState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [flipped, setFlipped] = useState(false);
  const busyRef = useRef(false),
    version = useRef(0),
    mounted = useRef(true);
  const requestEvent = preview?.request || eventRequest;
  const pendingKey = `rivals-event-request:${preview?.storageKey || EVENT_ID}:${deck?.id || "guest"}`;
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const request = ++version.current;
    try {
      const next = await requestEvent(
        "get",
        {},
        deck?.password ? deck : undefined,
      );
      if (mounted.current && request === version.current) {
        setState(next);
        setError("");
      }
    } catch (e) {
      if (mounted.current && request === version.current)
        setError(eventError(e));
    } finally {
      if (mounted.current && request === version.current) setLoading(false);
    }
  }, [deck?.id, deck?.token, deck?.password, requestEvent]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    setState(null);
    setLoading(true);
    void refresh();
    if (!preview)
      void supabase?.auth.getSession().then(({ data }) => {
        if (mounted.current) setSession(data.session);
      });
    const subscription = preview
      ? undefined
      : supabase?.auth.onAuthStateChange((_event, next) => {
          if (!mounted.current) return;
          ++version.current;
          setSession(next);
          setState(null);
          // Avoid calling another SDK request while Supabase's auth lock is held.
          setTimeout(() => {
            if (mounted.current) void refresh();
          }, 0);
        });
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      ++version.current;
      subscription?.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh, preview]);
  useEffect(() => {
    try {
      const pending = localStorage.getItem(pendingKey);
      if (pending && state?.me?.attempts.some((a) => a.request_id === pending))
        localStorage.removeItem(pendingKey);
    } catch {
      /* The challenge action explains blocked storage before sending a request. */
    }
  }, [state, pendingKey]);
  useEffect(() => setFlipped(false), [state?.me?.id]);
  async function act(
    action: string,
    args: Record<string, unknown> = {},
    success = "",
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const request = ++version.current;
    try {
      const next = await requestEvent(action, args, deck);
      if (mounted.current && request === version.current) {
        setState(next);
        setMessage(success);
        return next;
      }
    } catch (e) {
      if (mounted.current && request === version.current)
        setError(eventError(e));
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        if (request !== version.current) void refreshRef.current();
      }
    }
  }
  function challenge() {
    if (busyRef.current) return;
    try {
      let id = localStorage.getItem(pendingKey);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(pendingKey, id);
      }
      void act(
        "attempt",
        { p_request_id: id },
        "이번 도전 결과가 서버에 저장됐습니다.",
      );
    } catch {
      setError(
        "도전 요청을 보관할 수 없습니다. 브라우저 저장소 사용을 허용한 뒤 다시 시도해주세요.",
      );
    }
  }
  async function login() {
    if (!supabase || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const target = new URL(import.meta.env.BASE_URL, location.origin);
      target.searchParams.set("event", "1");
      target.hash = "simulator";
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: target.href },
      });
      if (error) throw error;
      setMessage(
        "운영자 로그인 링크를 이메일로 보냈습니다. 메일의 링크를 누르면 이벤트 관리 화면으로 돌아옵니다.",
      );
    } catch {
      setError(
        "인증 메일을 보내지 못했습니다. 이메일 주소를 확인하고 잠시 후 다시 시도해주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const me = state?.me,
    accepting = state ? eventAccepting(state) : false;
  const attempts = me?.attempts || [],
    latest = attempts[attempts.length - 1];
  const myTickets =
    state?.tickets.filter((t) => t.participant_id === me?.id) || [];
  const nameOf = (id: string | null) =>
    state?.rankings.find((r) => r.id === id)?.deck_name ||
    state?.tickets.find((t) => t.participant_id === id)?.deck_name ||
    "해당 없음";
  const phase = state?.event.phase,
    moment = me?.experiences.moment;
  const ended =
    !!state?.event.ends_at &&
    Date.parse(state.server_now) >= Date.parse(state.event.ends_at);
  if (state?.is_admin) {
    return (
      <EventAdmin
        state={state}
        busy={busy}
        error={error}
        message={message}
        onAction={act}
        onRefresh={() => void refresh()}
        onLogout={preview ? undefined : () => void supabase?.auth.signOut()}
      />
    );
  }
  return (
    <div className="event-page">
      {import.meta.env.DEV && import.meta.env.VITE_EVENT_PILOT === "1" && (
        <div className="event-notice">
          서버 동작 검증용입니다. 가상 참가자와 테스트 DB를 사용하며 실제 경품은
          지급되지 않습니다.{" "}
          <a href="/demo/event-pilot.html">테스트 참가자 전환 →</a>
        </div>
      )}
      <section className="event-hero-live">
        <div>
          <div className="eyebrow">RIVALS DECK · COMMUNITY EVENT</div>
          <h2>{state?.event.title || "스킬 챌린지 & 커피 이벤트"}</h2>
          <p>5번의 도전, 가장 높은 스킬 점수에 도전하세요.</p>
          <div className="event-rule-tags">
            <span>시그니처 선발 투수</span>
            <span>최고급 변경권 · S 레벨</span>
            <span>스킬 3개 합계</span>
          </div>
        </div>
        <div className="event-prizes">
          <strong>☕ × 2</strong>
          <span>점수 1위 1명 + 응모권 추첨 1명</span>
          <small>점수 1위는 응모권 추첨에서 제외</small>
        </div>
      </section>
      <div className="event-status-bar">
        <span>
          {loading
            ? "이벤트 확인 중…"
            : phase === "drawn"
              ? "추첨 완료"
              : phase === "closed" || ended
                ? "참여 마감"
                : accepting
                  ? "참여 접수 중"
                  : "오픈 준비 중"}
        </span>
        {state && (
          <span>
            {time(state.event.opens_at)} 시작 ·{" "}
            {state.event.ends_at
              ? `${time(state.event.ends_at)} 종료`
              : "운영자 마감 시 종료"}{" "}
            · 한국 시간
          </span>
        )}
        <button disabled={busy} onClick={() => void refresh()}>
          새로고침
        </button>
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
      {state && !accepting && phase === "open" && (
        <p className="event-notice">
          {ended
            ? "참여 기간이 끝났습니다. 운영자가 최종 순위와 추첨 결과를 확정하면 여기에서 확인할 수 있습니다."
            : state.event.published
              ? "시작 시간이 되면 참여할 수 있습니다."
              : "이벤트를 준비하고 있습니다. 아직 참여 횟수는 사용되지 않습니다."}
        </p>
      )}
      <section className="event-panel event-registration">
        <div>
          <h3>내 참여 정보</h3>
          <p>
            등록한 덱과 기존 비밀번호로 바로 참여합니다. 이메일 인증이나 참가
            승인은 필요하지 않습니다. 덱당 5회이며, 같은 덱을 다시 가져와도 남은
            횟수는 유지됩니다.
          </p>
        </div>
        {me ? (
          <p className="event-joined">
            <strong>{me.deck_name}</strong> 덱으로 참여 중 · 남은 도전{" "}
            {5 - attempts.length}회
          </p>
        ) : deck?.password ? (
          <button
            className="primary"
            disabled={busy || loading || !accepting}
            onClick={() =>
              void act(
                "join",
                {},
                "등록한 덱을 확인했습니다. 5회 도전을 시작하세요.",
              )
            }
          >
            현재 등록 덱으로 이벤트 참여
          </button>
        ) : (
          <div className="event-register-actions">
            <p>
              {deck
                ? "이전 방식으로 등록한 덱입니다. 덱 저장에서 비밀번호를 설정한 뒤 참여해주세요."
                : "내 덱을 먼저 등록하거나, 덱랭킹에서 내 덱을 비밀번호로 가져와주세요."}
            </p>
            <button disabled={!onRegisterDeck} onClick={onRegisterDeck}>
              내 덱 등록
            </button>
            <button disabled={!onViewRankings} onClick={onViewRankings}>
              덱랭킹에서 가져오기
            </button>
          </div>
        )}
        <p className="event-entry-note">
          참가 덱명·기록·응모권·당첨 결과는 공개됩니다. 당첨자만 실제 게임 덱
          인증 후 경품을 받습니다.
        </p>
      </section>
      <div className="event-competition">
        <section className="event-panel event-challenge">
          <div className="event-section-heading">
            <div>
              <div className="eyebrow">EVENT 01</div>
              <h3>5회 스킬 챌린지</h3>
            </div>
            <strong>{attempts.length} / 5회</strong>
          </div>
          <p>
            5회 중 최고 점수로 순위를 결정합니다. 동점이면 같은 점수를 먼저
            달성한 참가자가 앞섭니다.
          </p>
          <div className="event-skill-cards">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <small>스킬 {i + 1} · S</small>
                <strong>{latest?.board[i].name || "도전 대기"}</strong>
                <span>
                  {latest ? `${score(latest.board[i].score)}점` : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="event-score-line">
            <span>
              이번 점수 <strong>{latest ? score(latest.score) : "—"}</strong>
            </span>
            <span>
              내 최고 점수{" "}
              <strong>
                {attempts.length
                  ? score(Math.max(...attempts.map((a) => a.score)))
                  : "—"}
              </strong>
            </span>
          </div>
          <button
            className="primary event-challenge-button"
            disabled={busy || !me || !accepting || attempts.length >= 5}
            onClick={challenge}
          >
            {busy
              ? "서버에서 처리 중…"
              : attempts.length === 5
                ? "5회 도전 완료"
                : "스킬 점수에 도전하기"}
          </button>
          <details className="event-details">
            <summary>내 도전 기록 · {attempts.length}회</summary>
            {attempts.map((a) => (
              <div className="event-attempt" key={a.number}>
                <strong>
                  {a.number}회 · {score(a.score)}점
                </strong>
                <span>{a.board.map((s) => s.name).join(" / ")}</span>
                <small>{time(a.achieved_at)}</small>
              </div>
            ))}
            {!attempts.length && <p>아직 도전 기록이 없습니다.</p>}
          </details>
          <details className="event-details">
            <summary>확률과 점수 기준</summary>
            <p>
              첫 슬롯 골드 100%, 나머지 두 슬롯은 브론즈 35% / 실버 40% / 골드
              25%입니다. 같은 스킬은 중복되지 않습니다.
            </p>
            <p>
              전원 S 레벨, 시그니처 선발 투수 기준으로 계산하며 조건부 스킬은
              고정된 기본 조건을 사용합니다. 개인 수정 점수표는 반영되지
              않습니다.
            </p>
            {latest && (
              <ul>
                {latest.board.map((s) => (
                  <li key={s.id}>
                    {s.name}: {s.basis} · {score(s.score)}점
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
        <section className="event-panel">
          <div className="eyebrow">LEADERBOARD</div>
          <h3>스킬 점수 순위</h3>
          <p>최고점 ↓ · 최고점 달성 시각 ↑</p>
          <ol className="event-rankings">
            {state?.rankings.map((r) => (
              <li className={r.id === me?.id ? "mine" : ""} key={r.id}>
                <b>{r.rank}</b>
                <div>
                  <strong>
                    {r.deck_name}
                    {r.id === me?.id ? " · 내 덱" : ""}
                  </strong>
                  <small>{time(r.achieved_at)}</small>
                </div>
                <strong>
                  {score(r.score)}
                  <small>점</small>
                </strong>
              </li>
            ))}
          </ol>
          {!state?.rankings.length && (
            <p className="event-empty">첫 도전을 기다리고 있어요.</p>
          )}
        </section>
      </div>
      <section className="event-panel">
        <div className="event-section-heading">
          <div>
            <div className="eyebrow">EVENT 02</div>
            <h3>참여하고 응모권 받기</h3>
          </div>
          <strong>내 응모권 {myTickets.length} / 4장</strong>
        </div>
        <p>
          각 항목의 참여 완료 후 응모권을 받아주세요. 아래 이벤트 전용 체험의
          기록을 확인하며, 평소 시뮬레이터 기록과 사용량은 별도로 유지됩니다.
        </p>
        <div className="event-missions">
          {(Object.keys(EVENT_MISSIONS) as EventMission[]).map((m) => {
            const earned = myTickets.some((t) => t.mission === m),
              ready = !!me?.evidence[m];
            return (
              <article key={m}>
                <h4>{EVENT_MISSIONS[m]}</h4>
                <p>
                  {earned
                    ? "응모권 발급 완료"
                    : ready
                      ? "참여 이력 확인 완료"
                      : m === "deck"
                        ? "등록 덱으로 이벤트에 참여하세요"
                        : m === "skills"
                          ? "위 챌린지에 1회 도전하세요"
                          : "이벤트 전용 체험을 완료하세요"}
                </p>
                {(m === "moment" || m === "hof") && !ready && (
                  <button
                    disabled={busy || !me || !accepting || !!me.experiences[m]}
                    onClick={() => void act("experience", { p_mission: m })}
                  >
                    {m === "moment"
                      ? "조합 후보 5장 확인"
                      : "HOF 1회 영입 체험"}
                  </button>
                )}
                <button
                  className={ready && !earned ? "primary" : ""}
                  disabled={busy || !ready || earned || !accepting}
                  onClick={() =>
                    void act(
                      "claim",
                      { p_mission: m },
                      "응모권 1장이 발급됐습니다.",
                    )
                  }
                >
                  {earned ? "✓ 응모권 받음" : "이벤트 참여하기 · 응모권 받기"}
                </button>
              </article>
            );
          })}
        </div>
        {moment && (
          <div className="event-experience">
            <h4>슈프림 모먼트 조합 체험</h4>
            <p>
              모먼트 1장 + 등급 보호권 사용 · 구단 제한 없음 · 슈프림 15% /
              모먼트 85%
            </p>
            {moment.result ? (
              <PlayerResult player={moment.result} />
            ) : (
              <>
                {!flipped ? (
                  <>
                    <div className="event-candidates">
                      {moment.preview?.map((p, i) => (
                        <PlayerResult key={i} player={p} />
                      ))}
                    </div>
                    <button
                      disabled={!accepting || busy}
                      onClick={() => setFlipped(true)}
                    >
                      카드 뒤집고 섞기
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      뒷면 카드 1장을 선택하세요. 선택이 끝나면 참여가
                      인정됩니다.
                    </p>
                    <div className="event-hidden-cards">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <button
                          key={i}
                          disabled={busy || !accepting}
                          onClick={() => void act("pick_moment", { p_slot: i })}
                          aria-label={`조합 카드 ${i + 1} 선택`}
                        >
                          R<small>{i + 1}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {me?.experiences.hof?.result && (
          <div className="event-experience">
            <h4>일반 HOF 영입 체험 결과</h4>
            <PlayerResult player={me.experiences.hof.result} />
          </div>
        )}
        <details className="event-details">
          <summary>내 응모권과 참여 시각 확인</summary>
          {myTickets.map((t) => (
            <div className="event-ticket" key={t.id}>
              <strong>{EVENT_MISSIONS[t.mission]}</strong>
              <span>{time(t.issued_at)}</span>
              <small>{t.id}</small>
              {!t.eligible && <span>점수 1위 경품 대상 · 추첨 제외</span>}
            </div>
          ))}
          {!myTickets.length && <p>발급된 응모권이 없습니다.</p>}
        </details>
      </section>
      <section className="event-panel event-results">
        <div className="eyebrow">WINNERS</div>
        <h3>당첨 결과</h3>
        <p>
          당첨자는 커뮤니티 쪽지로 운영자에게 실제 게임 속 덱과 참가 덱명을
          보내주세요. 참가 당시 등록한 덱과 대조한 뒤 경품을 지급합니다. 인증
          자료를 공개 댓글에 올릴 필요는 없습니다.
        </p>
        <div className="event-winners">
          <div>
            <span>🏆 스킬 점수 1위</span>
            <strong>
              {phase !== "open" && state?.event.champion_id
                ? nameOf(state.event.champion_id)
                : phase === "open" || !state
                  ? "마감 후 확정"
                  : "도전 참가자 없음"}
            </strong>
            <small>커피 기프티콘 1개</small>
            {state?.event.champion_id && (
              <span className="event-prize-status">
                {prizeStatus(
                  state.event.champion_verified_at,
                  state.event.champion_delivered_at,
                )}
              </span>
            )}
          </div>
          <div>
            <span>🎟 응모권 추첨 당첨자</span>
            <strong>
              {state?.event.winner_id
                ? nameOf(state.event.winner_id)
                : phase === "drawn"
                  ? "추첨 대상 없음"
                  : "추첨 후 공개"}
            </strong>
            <small>커피 기프티콘 1개 · 점수 1위 제외</small>
            {state?.event.winner_id && (
              <span className="event-prize-status">
                {prizeStatus(
                  state.event.winner_verified_at,
                  state.event.winner_delivered_at,
                )}
              </span>
            )}
          </div>
        </div>
        {state?.event.winning_ticket && (
          <p>당첨 응모권: {state.event.winning_ticket}</p>
        )}
        <details className="event-details">
          <summary>
            전체 응모권 · {state?.tickets.length || 0}장 / 추첨 대상{" "}
            {state?.tickets.filter((t) => t.eligible).length || 0}장
          </summary>
          <p>
            {phase === "open"
              ? "마감 시 점수 1위의 응모권을 모두 제외합니다."
              : "점수 1위의 응모권은 추첨 대상에서 제외됐습니다."}
          </p>
          {state?.tickets.map((t) => (
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
        {state?.audit.length ? (
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
      {!preview && (
        <details className="event-panel event-admin-login">
          <summary>운영자 로그인</summary>
          <p>
            이메일 로그인은 이벤트 운영자만 사용합니다. 참가자는 위에서 등록
            덱으로 참여해주세요.
          </p>
          {session ? (
            <div className="event-account">
              <span>
                {session.user.email}
                {state?.is_admin ? " · 운영자" : " · 운영 권한 없음"}
              </span>
              <button
                disabled={busy}
                onClick={() => void supabase?.auth.signOut()}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <label>
                운영자 이메일
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="운영자 이메일 주소"
                />
              </label>
              <button disabled={busy || !state}>운영자 로그인 링크 받기</button>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
