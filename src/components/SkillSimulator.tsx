import { fmtScore, type SkillTables } from "../lib/engine";
import { createScoreEvaluator, meetsScoreGoal, type ScoreChoices } from "../lib/simulatorScore";
import { useEffect, useMemo, useRef, useState } from "react";
import { availableSkills, browserRandom, CARD_TYPES, createSimulator, canLockFirst, newlyDrawnSkills, hasNewDedicatedSkill, dedicatedTiers, runTrialChunk, TICKETS, goalPossible, LEVELS, matchesGoal, momentSkills, POSITIONS, PROBABILITY_DATA, ruleSummary, skillId, slotCount, TIERS, type Board, type DrawSkill, type Level, type SimSettings, type Tier } from "../lib/skillSimulator";

interface Trial { number: number; board: Board; hit: boolean; score: number | null }
interface Stats { total: number; samples: number; hits: number; firstHit: Trial | null; recent: Trial[]; tiers: Partial<Record<Tier, number>>; best: number | null; unscored: number }
const blankStats = (): Stats => ({ total: 0, samples: 0, hits: 0, firstHit: null, recent: [], tiers: {}, best: null, unscored: 0 });
const initial: SimSettings = { ticket: "superior", card: "normal", position: "SP", protectS: true, momentSkill: "" };
const nf = new Intl.NumberFormat("ko-KR");
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export default function SkillSimulator({ tables }: { tables: SkillTables }) {
  const [settings, setSettings] = useState(initial);
  const [lockedFirst, setLockedFirst] = useState<DrawSkill | null>(null);
  const [currentBoard, setCurrentBoard] = useState<Board>([]);
  const [mode, setMode] = useState<"free" | "skills" | "score">("free");
  const [scoreTarget, setScoreTarget] = useState("60");
  const [scoreChoices, setScoreChoices] = useState<ScoreChoices>({});
  const [targets, setTargets] = useState<string[]>([]);
  const [minimum, setMinimum] = useState<Level>("S");
  const [limit, setLimit] = useState("10000");
  const [stats, setStats] = useState<Stats>(blankStats);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const candidates = useMemo(() => availableSkills(settings, lockedFirst), [settings, lockedFirst]);
  const moments = useMemo(() => momentSkills(settings.position), [settings.position]);
  const count = slotCount(settings.card);
  const ids = targets.filter(Boolean);
  const scorer = useMemo(() => createScoreEvaluator(settings, tables, scoreChoices, lockedFirst), [settings, tables, scoreChoices, lockedFirst]);
  const evaluation = scorer.board(currentBoard);
  const threshold = Number(scoreTarget);
  const scoreValid = scoreTarget.trim() !== "" && Number.isFinite(threshold) && threshold > 0;
  const possible = mode === "score" ? scoreValid && threshold <= scorer.upperBound : mode !== "skills" || !ids.length || goalPossible(settings, ids, lockedFirst, minimum);
  const hasGoal = mode === "score" ? scoreValid : mode === "skills" && ids.length > 0;
  const goalHit = (board: Board, score: number | null) => mode === "score" ? meetsScoreGoal(score, threshold) : mode === "skills" && matchesGoal(board, ids, minimum);
  const numericLimit = Number(limit);
  const limitValid = limit.trim() !== "" && Number.isInteger(numericLimit) && numericLimit >= 1 && numericLimit <= 100000;
  const specialTiers = dedicatedTiers(settings, lockedFirst);

  function reset() { setStats(blankStats()); setMessage(""); }
  function change(patch: Partial<SimSettings>) {
    const next = { ...settings, ...patch };
    if (["moment", "supreme", "wbc", "wbcBlack"].includes(next.card)) next.protectS = true;
    if (!momentSkills(next.position).some(s => s.name === next.momentSkill)) next.momentSkill = momentSkills(next.position)[0]?.name ?? "";
    const identityChanged = next.card !== settings.card || next.position !== settings.position || (next.card === "moment" && next.momentSkill !== settings.momentSkill);
    if (identityChanged) { setLockedFirst(null); setScoreChoices({}); }
    setCurrentBoard(!identityChanged && lockedFirst ? [lockedFirst] : []);
    setSettings(next); setTargets([]); reset();
  }
  function toggleLock() {
    if (busy) return;
    if (!lockedFirst && !canLockFirst(settings, currentBoard[0])) return;
    setLockedFirst(lockedFirst ? null : { ...currentBoard[0] });
    setStats(previous => ({ ...blankStats(), total: previous.total, tiers: previous.tiers }));
    setMessage(`${lockedFirst ? "잠금 해제 · 3개 합계" : "첫 줄 잠금 · 2·3번째 합계"}로 점수를 판정합니다. 변경권 사용량은 유지하고 점수·목표 기록은 초기화했습니다.`);
  }
  function target(slot: number, value: string) {
    setTargets(previous => Array.from({ length: count }, (_, i) => i === slot ? value : previous[i] ?? "")); reset();
  }
  async function play(trials: number, stopAtGoal = false) {
    if (controller.current || !Number.isInteger(trials) || trials < 1 || trials > 100000 || (stopAtGoal && !possible)) return;
    if (stopAtGoal && !hasGoal) return;
    if (stopAtGoal && mode === "skills" && lockedFirst && matchesGoal([lockedFirst], ids, minimum)) {
      setMessage("잠근 스킬로 목표 조합을 이미 만족합니다. 변경권을 사용하지 않았습니다."); return;
    }
    if (stopAtGoal && mode === "score" && meetsScoreGoal(evaluation.total, threshold)) {
      setMessage("현재 결과가 점수 목표를 이미 만족합니다. 변경권을 사용하지 않았습니다."); return;
    }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage("");
    const next: Stats = { ...stats, tiers: { ...stats.tiers }, recent: [...stats.recent] };
    let completed = 0, found = false;
    try {
      const draw = createSimulator(settings, browserRandom(), lockedFirst);
      while (completed < trials && !abort.signal.aborted && !found) {
        const chunk = Math.min(200, trials - completed);
        const result = runTrialChunk(draw, chunk, board => {
          const score = scorer.board(board).total;
          const hit = goalHit(board, score);
          if (score === null) next.unscored++;
          else next.best = next.best === null ? score : Math.max(next.best, score);
          next.total++;
          next.samples++;
          const record = { number: next.total, board, hit, score };
          if (hit) { next.hits++; next.firstHit ??= record; }
          for (const s of newlyDrawnSkills(board, lockedFirst)) next.tiers[s.tier] = (next.tiers[s.tier] ?? 0) + 1;
          next.recent = [record, ...next.recent].slice(0, 8);
        }, board => stopAtGoal ? goalHit(board, next.recent[0].score) : hasNewDedicatedSkill(settings, board, lockedFirst));
        completed += result.completed;
        found = result.stopped;
        if (mounted.current) {
          setStats({ ...next, tiers: { ...next.tiers }, recent: [...next.recent] });
          setCurrentBoard(next.recent[0].board);
        }
        if (completed < trials && !found) await tick();
      }
      if (mounted.current) setMessage(abort.signal.aborted ? `${nf.format(completed)}회 진행 후 중지했습니다.` : found ? `${stopAtGoal ? mode === "score" ? "점수 목표" : "목표 조합" : "전용 스킬"} 등장! 이번 실행 ${nf.format(completed)}장 사용 · 누적 ${nf.format(next.total)}장` : stopAtGoal ? `${nf.format(completed)}회 안에 목표를 달성하지 못했습니다.` : `${nf.format(completed)}회 시뮬레이션 완료`);
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "시뮬레이션을 실행하지 못했습니다.");
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return <section className="skill-simulator" aria-label="스킬 변경권 시뮬레이터">
    <div className="card sim-setup">
      <div className="sim-heading"><h2>스킬 시뮬레이션</h2><small className="muted">공식 확률 · {PROBABILITY_DATA.asOf}</small></div>
      <div className="sim-settings">
        <label>변경권 종류<select aria-label="변경권 종류" disabled={busy} value={settings.ticket ?? "superior"} onChange={e => change({ ticket: e.target.value as SimSettings["ticket"] })}>{Object.entries(TICKETS).map(([key, name]) => <option key={key} value={key}>{name} 스킬 변경권</option>)}</select></label>
        <label>카드 종류<select aria-label="시뮬레이션 카드 종류" disabled={busy} value={settings.card} onChange={e => change({ card: e.target.value as SimSettings["card"] })}>{Object.entries(CARD_TYPES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>포지션<select aria-label="시뮬레이션 포지션" disabled={busy} value={settings.position} onChange={e => change({ position: e.target.value as SimSettings["position"] })}>{Object.entries(POSITIONS).map(([key, name]) => <option key={key} value={key}>{key} · {name}</option>)}</select></label>
        {settings.card === "moment" && settings.ticket === "superior" && <label>카드의 전용 모먼트 스킬<select aria-label="전용 모먼트 스킬" disabled={busy} value={settings.momentSkill} onChange={e => change({ momentSkill: e.target.value })}>{moments.map(s => <option key={s.name}>{s.name}</option>)}</select></label>}
      </div>
    </div>

    <div className="sim-stats" aria-label="시뮬레이션 통계">
      <div><span>사용한 변경권</span><strong>{nf.format(stats.total)}<small>장</small></strong></div>
      <div><span>현재 {scorer.scoredSlots}개 합계{lockedFirst ? " · 잠금 제외" : ""}</span><strong>{evaluation.total === null ? "—" : fmtScore(evaluation.total)}<small>점</small></strong></div>
      <div><span>최고 {scorer.scoredSlots}개 합계</span><strong>{stats.best === null ? "—" : fmtScore(stats.best)}<small>점</small></strong></div>
      <div><span>목표 달성</span><strong>{hasGoal ? nf.format(stats.hits) : "—"}<small>회</small></strong></div>
    </div>

    <div className="card sim-play">
      <div className={`sim-board ${count === 4 ? "four" : ""}`} aria-label="변경 결과" aria-busy={busy}>
        {Array.from({ length: count }, (_, i) => {
          const skill = i === 0 && lockedFirst ? lockedFirst : currentBoard[i];
          const score = skill ? scorer.evaluate(skill) : null;
          return <article key={i} className={`sim-skill ${skill ? `tier-${skill.tier}` : ""}`}>
            <div className="sim-skill-top"><span>{i + 1}번째 · {skill ? TIERS[skill.tier] : "대기"}</span><span className="sim-level">{skill?.level ?? "—"}</span></div>
            <strong>{skill?.name ?? "변경 전"}</strong>
            <div className="sim-skill-footer"><span title={score?.basis}>{score ? score.score === null ? "평가 불가" : `${fmtScore(score.score)}점` : "—"}{i === 0 && lockedFirst ? " · 합계 제외" : ""}</span>
              {i === 0 && <button type="button" aria-label="첫 번째 스킬 잠금" aria-pressed={!!lockedFirst} title={settings.card === "hof" || settings.card === "black" || settings.card === "wbcBlack" ? "이 카드는 잠금 불가" : settings.card === "moment" || settings.card === "supreme" ? "모먼트 전용 스킬 획득 후 잠금 가능" : "첫 번째 스킬과 레벨 유지"} disabled={busy || (!lockedFirst && !canLockFirst(settings, skill))} onClick={toggleLock}>{lockedFirst ? "🔒 해제" : "잠금"}</button>}
            </div>
          </article>;
        })}
      </div>
      <div className="sim-actions">
        <div className="sim-target-row">
          <label>진행 방식 <select aria-label="시뮬레이션 목표 방식" disabled={busy} value={mode} onChange={e => { setMode(e.target.value as typeof mode); reset(); }}><option value="free">자유 변경</option><option value="skills">목표 스킬 조합</option><option value="score">스킬 점수 목표</option></select></label>
          {mode === "score" && <label>변경 스킬 {scorer.scoredSlots}개 합계 <input aria-label="목표 스킬 점수" type="number" min="0.01" step="0.01" value={scoreTarget} disabled={busy} onChange={e => { setScoreTarget(e.target.value); reset(); }} /> 점 이상</label>}
          <button className="sim-reset" disabled={busy || !stats.total} onClick={reset}>기록 초기화</button>
        </div>
        {mode === "skills" && <div className="sim-target-fields">
          <div className="sim-goal-inputs">{Array.from({ length: count }, (_, i) => <label key={i}>목표 {i + 1}<select aria-label={`목표 스킬 ${i + 1}`} value={targets[i] ?? ""} disabled={busy} onChange={e => target(i, e.target.value)}><option value="">선택 안 함</option>{candidates.map(s => <option key={skillId(s)} value={skillId(s)} disabled={ids.includes(skillId(s)) && targets[i] !== skillId(s)}>{s.name} · {TIERS[s.tier]}{lockedFirst?.id === skillId(s) ? " · 잠금" : ""}</option>)}</select></label>)}</div>
          <label className="sim-minimum">최소 레벨 <select aria-label="목표 최소 레벨" value={minimum} disabled={busy} onChange={e => { setMinimum(e.target.value as Level); reset(); }}>{LEVELS.map(l => <option key={l} value={l}>{l === "D" ? "레벨 무관" : `${l} 이상`}</option>)}</select></label>
        </div>}
        <div className="row sim-run-buttons">
          <button className="primary" disabled={busy} onClick={() => void play(1)}>1회 변경</button>
          <button disabled={busy} onClick={() => void play(10)}>10회</button>
          <button disabled={busy} onClick={() => void play(100)}>100회</button>
          {busy && <button className="sim-stop" onClick={() => controller.current?.abort()}>중지</button>}
        </div>
        <div className="sim-bulk row">
          <label>최대 <input aria-label="시뮬레이션 최대 횟수" type="number" min="1" max="100000" step="1" value={limit} disabled={busy} onChange={e => setLimit(e.target.value)} /> 회</label>
          <button className={mode === "free" ? "" : "primary"} disabled={busy || !limitValid || (mode !== "free" && (!hasGoal || !possible))} onClick={() => void play(numericLimit, mode !== "free")}>{mode === "free" ? "입력 횟수만큼" : "목표까지 돌리기"}</button>
        </div>
        {!limitValid && <p className="sim-error">횟수는 1~100,000의 정수로 입력하세요.</p>}
        {mode === "score" && !possible && <p className="sim-error">{!scoreValid ? "목표 점수는 0보다 큰 숫자로 입력하세요." : `현재 평가 기준의 상한은 ${fmtScore(scorer.upperBound)}점입니다.`}</p>}
        {mode === "skills" && !possible && <p className="sim-error" role="alert">현재 카드·변경권·잠금 상태에서 달성할 수 없는 조합입니다.</p>}
        <p className="sim-small muted">{lockedFirst ? "첫 줄 잠금 · 2·3번째만 변경" : "전체 슬롯 변경"}{specialTiers.length > 0 ? " · 횟수 버튼은 새 전용 스킬 등장 시 중단" : ""}{mode !== "free" ? " · 목표 실행은 목표 달성 시 중단" : ""}</p>
        <div className="sim-message" role="status">{busy ? `${nf.format(stats.total)}회 진행 중…` : message || "변경 버튼을 눌러 시작하세요."}</div>
      </div>
    </div>

    <details className="card sim-score-settings"><summary>점수 기준 · 조건 설정 <small className="muted">랭킹대전 S0 · 조건 미선택 시 최저값</small></summary>
      <p className="muted">변경되는 스킬의 점수를 합산합니다. 3슬롯 카드는 잠금 없이 3개 합계, 첫 줄 잠금 시 2·3번째 2개 합계로 목표를 판정합니다. 블랙 계열은 잠금 없이 4개 합계입니다. 현재 덱관리 점수표와 수정값을 사용하며, 소수 둘째 자리 점수로 비교합니다. 변경되는 스킬 중 S 미만·점수 미등록이 있으면 평가 불가입니다. 잠근 스킬의 점수·레벨은 합계에 영향을 주지 않습니다. S1~S4 성장 보너스는 적용하지 않습니다.</p>
      <div className="sim-options"><label><input type="checkbox" checked={settings.protectS} disabled={busy || ["moment", "supreme", "wbc", "wbcBlack"].includes(settings.card)} onChange={e => change({ protectS: e.target.checked })} /> S 레벨 보호 상태</label></div>
      {scorer.missing.length > 0 && <p className="muted">점수 미등록: {scorer.missing.map(s=>s.name).join(", ")}</p>}
      <div className="sim-goal-inputs">{candidates.filter(s => (scorer.options.get(skillId(s))?.length ?? 0) > 1).map(s => <label key={skillId(s)}>{s.name}<select aria-label={`${s.name} 점수 조건`} disabled={busy} value={scoreChoices[skillId(s)] ?? ""} onChange={e => { setScoreChoices(previous => ({ ...previous, [skillId(s)]: e.target.value })); reset(); }}><option value="">최저 조건값 · {fmtScore(scorer.options.get(skillId(s))![0].score)}점</option>{scorer.options.get(skillId(s))!.map(o => <option key={o.name} value={o.name}>{o.name.replace(/^\[S0\]\s*/, "")} · {fmtScore(o.score)}점</option>)}</select></label>)}</div>
    </details>
    <details className="card"><summary>실험 기록 · 상세 통계</summary>
      <p className="muted">현재 {scorer.scoredSlots}개 합계 기준 {nf.format(stats.samples)}회 · 첫 목표 달성 {stats.firstHit ? `${nf.format(stats.firstHit.number)}회째` : "—"} · 관측 비율 {stats.samples && hasGoal ? `${(stats.hits / stats.samples * 100).toFixed(2)}%` : "—"} · 평가 불가 {nf.format(stats.unscored)}회</p>
      {stats.firstHit && <><b>첫 목표 달성 조합</b><SkillChips board={stats.firstHit.board} /></>}
      <div className="sim-tier-counts">{Object.entries(stats.tiers).map(([tier,n]) => <span key={tier}>{TIERS[tier as Tier]} {nf.format(n!)}개</span>)}</div>
      {stats.recent.map(trial => <div className="sim-history" key={trial.number}><b>{nf.format(trial.number)}회 {trial.hit && "✓"} · {trial.score === null ? "평가 불가" : `${fmtScore(trial.score)}점`}</b><SkillChips board={trial.board} /></div>)}
    </details>
    <details className="card sim-sources"><summary>공식 확률 · 시뮬레이션 기준</summary>
      <p>{ruleSummary(settings.card, settings.ticket, lockedFirst)}</p>
      <ul>
        <li>포지션별 스킬 목록은 {PROBABILITY_DATA.asOf} 개별 확률표, 티어·슬롯 규칙은 공식 확률 안내를 사용합니다.</li>
        <li>변경권으로 등장하는 레벨은 D~S입니다. S1~S4 성장 보너스는 뽑기 결과에 포함되지 않습니다.</li>
        <li>한 번의 변경 결과에서 동일한 스킬은 중복 등장하지 않습니다. 이 규칙은 사용자의 게임 확인을 반영했습니다. 시뮬레이터는 티어를 먼저 뽑고 이미 나온 이름을 제외하며, 이 처리 순서는 공식 표에 공개되지 않은 모델 가정입니다.</li>
        <li>개별 확률의 소수점 반올림 오차는 같은 티어 내 상대 비율로 보정합니다. 모먼트는 선택한 카드의 전용 스킬이 1종인 경우를 기준으로 합니다.</li>
        <li>첫 슬롯 잠금은 사용자 확인 규칙을 적용합니다. 모먼트·슈프림 모먼트는 전용 스킬 획득 후 가능합니다. HOF는 잠금 불가이며 블랙·WBC 블랙 잠금은 지원하지 않습니다. 확정 누적 보상은 적용하지 않습니다. S 보호 해제 시 매 시도 D~S 기본 분포를 사용합니다. 모먼트 계열은 전체 S 보호 상태를 기준으로 하며, WBC는 원래 S가 확정됩니다.</li>
        <li>관측 비율은 이번 가상 실험의 결과입니다. 전용 스킬·목표 달성 시 멈추는 실험은 고정 횟수 실험과 집계 방식이 다르며, 실제 획득 횟수를 보장하지 않습니다.</li>
      </ul>
      <p><a href={PROBABILITY_DATA.overview.url} target="_blank" rel="noreferrer">공식 티어·슬롯 확률 안내</a> · <a href="https://community.withhive.com/MLB9IRIVALS/ko/board/9/6062" target="_blank" rel="noreferrer">첫 슬롯 골드 보장 안내</a></p>
      <div className="row">{Object.entries(PROBABILITY_DATA.sources).map(([key, s]) => <a key={key} href={s.url} target="_blank" rel="noreferrer">{{ normal: "일반", hof: "HOF", black: "블랙", blackOther: "블랙 나머지", wbc: "WBC", wbcBlack: "WBC 블랙", wbcBlackOther: "WBC 블랙 나머지", supreme: "슈프림 모먼트", basic: "일반·고급", hofBasic: "HOF 일반", hofAdvanced: "HOF 고급", blackAdvanced: "블랙 고급", wbcBasic: "WBC 일반", wbcAdvanced: "WBC 고급", wbcBlackAdvanced: "WBC 블랙 고급" }[key]} 개별표</a>)}</div>
    </details>
  </section>;
}
function SkillChips({ board }: { board: Board }) {
  return <div className="sim-chips">{board.map((s, i) => <span className={`sim-chip tier-${s.tier}`} key={i}><b>{s.level}</b> {s.name}</span>)}</div>;
}
