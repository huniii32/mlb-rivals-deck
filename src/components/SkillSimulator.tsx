import { useEffect, useMemo, useRef, useState } from "react";
import { availableSkills, browserRandom, CARD_TYPES, createSimulator, canLockFirst, newlyDrawnSkills, hasNewDedicatedSkill, dedicatedTiers, runTrialChunk, TICKETS, goalPossible, LEVELS, matchesGoal, momentSkills, POSITIONS, PROBABILITY_DATA, ruleSummary, skillId, slotCount, TIERS, type Board, type DrawSkill, type Level, type SimSettings, type Tier } from "../lib/skillSimulator";

interface Trial { number: number; board: Board; hit: boolean }
interface Stats { total: number; hits: number; firstHit: Trial | null; recent: Trial[]; tiers: Partial<Record<Tier, number>> }
const blankStats = (): Stats => ({ total: 0, hits: 0, firstHit: null, recent: [], tiers: {} });
const initial: SimSettings = { ticket: "superior", card: "normal", position: "SP", protectS: true, momentSkill: "" };
const nf = new Intl.NumberFormat("ko-KR");
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export default function SkillSimulator() {
  const [settings, setSettings] = useState(initial);
  const [lockedFirst, setLockedFirst] = useState<DrawSkill | null>(null);
  const [currentBoard, setCurrentBoard] = useState<Board>([]);
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
  const possible = !ids.length || goalPossible(settings, ids, lockedFirst, minimum);
  const numericLimit = Number(limit);
  const limitValid = limit.trim() !== "" && Number.isInteger(numericLimit) && numericLimit >= 1 && numericLimit <= 100000;
  const specialTiers = dedicatedTiers(settings, lockedFirst);
  const ticketName = TICKETS[settings.ticket ?? "superior"];

  function reset() { setStats(blankStats()); setMessage(""); }
  function change(patch: Partial<SimSettings>) {
    const next = { ...settings, ...patch };
    if (["moment", "supreme", "wbc", "wbcBlack"].includes(next.card)) next.protectS = true;
    if (!momentSkills(next.position).some(s => s.name === next.momentSkill)) next.momentSkill = momentSkills(next.position)[0]?.name ?? "";
    const identityChanged = next.card !== settings.card || next.position !== settings.position || (next.card === "moment" && next.momentSkill !== settings.momentSkill);
    if (identityChanged) setLockedFirst(null);
    setCurrentBoard(!identityChanged && lockedFirst ? [lockedFirst] : []);
    setSettings(next); setTargets([]); reset();
  }
  function toggleLock() {
    if (busy) return;
    if (lockedFirst) { setLockedFirst(null); setMessage("첫 번째 스킬 잠금을 해제했습니다. 다음 변경부터 전체 슬롯이 바뀝니다."); }
    else if (canLockFirst(settings, currentBoard[0])) { setLockedFirst({ ...currentBoard[0] }); setMessage("첫 번째 스킬을 잠갔습니다. 나머지 슬롯만 변경하며 누적 사용량은 유지됩니다."); }
  }
  function target(slot: number, value: string) {
    setTargets(previous => Array.from({ length: count }, (_, i) => i === slot ? value : previous[i] ?? "")); reset();
  }
  async function play(trials: number, stopAtGoal = false) {
    if (controller.current || !Number.isInteger(trials) || trials < 1 || trials > 100000 || !possible) return;
    if (stopAtGoal && !ids.length) return;
    if (stopAtGoal && lockedFirst && matchesGoal([lockedFirst], ids, minimum)) {
      setMessage("잠근 스킬로 목표 조합을 이미 만족합니다. 변경권을 사용하지 않았습니다."); return;
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
          const hit = matchesGoal(board, ids, minimum);
          next.total++;
          const record = { number: next.total, board, hit };
          if (hit) { next.hits++; next.firstHit ??= record; }
          for (const s of newlyDrawnSkills(board, lockedFirst)) next.tiers[s.tier] = (next.tiers[s.tier] ?? 0) + 1;
          next.recent = [record, ...next.recent].slice(0, 8);
        }, board => stopAtGoal ? matchesGoal(board, ids, minimum) : hasNewDedicatedSkill(settings, board, lockedFirst));
        completed += result.completed;
        found = result.stopped;
        if (mounted.current) {
          setStats({ ...next, tiers: { ...next.tiers }, recent: [...next.recent] });
          setCurrentBoard(next.recent[0].board);
        }
        if (completed < trials && !found) await tick();
      }
      if (mounted.current) setMessage(abort.signal.aborted ? `${nf.format(completed)}회 진행 후 중지했습니다.` : found ? `${stopAtGoal ? "목표 조합" : "전용 스킬"} 등장! 이번 실행 ${nf.format(completed)}장 사용 · 누적 ${nf.format(next.total)}장` : stopAtGoal ? `${nf.format(completed)}회 안에 목표 조합이 나오지 않았습니다.` : `${nf.format(completed)}회 시뮬레이션 완료`);
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "시뮬레이션을 실행하지 못했습니다.");
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return <section className="skill-simulator" aria-label="스킬 변경권 시뮬레이터">
    <div className="card sim-intro">
      <div><span className="sim-eyebrow">SKILL LAB · 공식 확률표 {PROBABILITY_DATA.asOf}</span><h2>스킬 변경 시뮬레이터</h2><p className="muted">원하는 조합이 나올 때까지, 가상 변경권으로 미리 돌려보세요.</p></div>
      <span className="sim-ticket">{ticketName} 변경권 <strong>∞</strong></span>
    </div>
    <div className="card">
      <div className="sim-settings">
        <label>변경권 종류<select aria-label="변경권 종류" disabled={busy} value={settings.ticket ?? "superior"} onChange={e => change({ ticket: e.target.value as SimSettings["ticket"] })}>{Object.entries(TICKETS).map(([key, name]) => <option key={key} value={key}>{name} 스킬 변경권</option>)}</select></label>
        <label>카드 종류<select aria-label="시뮬레이션 카드 종류" disabled={busy} value={settings.card} onChange={e => change({ card: e.target.value as SimSettings["card"] })}>{Object.entries(CARD_TYPES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>포지션<select aria-label="시뮬레이션 포지션" disabled={busy} value={settings.position} onChange={e => change({ position: e.target.value as SimSettings["position"] })}>{Object.entries(POSITIONS).map(([key, name]) => <option key={key} value={key}>{key} · {name}</option>)}</select></label>
        {settings.card === "moment" && settings.ticket === "superior" && <label>카드의 전용 모먼트 스킬<select aria-label="전용 모먼트 스킬" disabled={busy} value={settings.momentSkill} onChange={e => change({ momentSkill: e.target.value })}>{moments.map(s => <option key={s.name}>{s.name}</option>)}</select></label>}
      </div>
      <p className="sim-rule">{ruleSummary(settings.card, settings.ticket, lockedFirst)}</p>
      <div className="row sim-options">
        <label><input type="checkbox" checked={settings.protectS} disabled={busy || ["moment", "supreme", "wbc", "wbcBlack"].includes(settings.card)} onChange={e => change({ protectS: e.target.checked })} /> S 레벨 보호 상태</label>
        <span className="muted">같은 결과에 동일 스킬은 중복 등장하지 않습니다.</span>
      </div>
      <p className="muted sim-small">S 보호는 변경할 슬롯이 이미 S인 상태를 가정합니다. 카드·변경권·포지션 설정을 바꾸면 실험 기록이 초기화됩니다.</p>
      <p className="muted sim-small">모먼트 계열은 전체 S 상태로 계산합니다.</p>
    </div>

    <div className={`sim-board ${count === 4 ? "four" : ""}`} aria-label="변경 결과" aria-busy={busy}>
      {Array.from({ length: count }, (_, i) => {
        const skill = i === 0 && lockedFirst ? lockedFirst : currentBoard[i];
        return <article key={i} className={`sim-skill ${skill ? `tier-${skill.tier}` : ""}`}>
          <div className="sim-skill-top"><span>{i + 1}번째 슬롯</span><span className="sim-level">{skill?.level ?? "—"}</span></div>
          {i === 0 && <div className="sim-lock-control">
            <button type="button" aria-label="첫 번째 스킬 잠금" aria-pressed={!!lockedFirst} disabled={busy || (!lockedFirst && !canLockFirst(settings, skill))} onClick={toggleLock}>{lockedFirst ? "🔒 잠금 해제" : "첫 줄 잠그기"}</button>
            <small className="muted">{["black", "wbcBlack"].includes(settings.card) ? "블랙 계열 잠금 미지원" : settings.card === "hof" ? "HOF는 잠금 불가" : lockedFirst ? "이 스킬·레벨 유지" : settings.card === "moment" || settings.card === "supreme" ? "모먼트 전용 스킬 획득 후 가능" : "첫 번째 결과를 고정"}</small>
          </div>}
          <span className="sim-tier">{skill ? TIERS[skill.tier] : "대기"}</span>
          <strong>{skill?.name ?? "어떤 스킬이 나올까요?"}</strong>
          {skill && ids.includes(skill.id) && LEVELS.indexOf(skill.level) >= LEVELS.indexOf(minimum) && <span className="sim-match">✓ 목표 스킬</span>}
        </article>;
      })}
    </div>

    <div className="card sim-actions">
      {lockedFirst && <p className="sim-rule">첫 줄 잠금 중 · 2·3번째 스킬만 변경합니다. 잠근 스킬은 새 당첨·티어 집계에서 제외합니다.</p>}
      <div className="row">
        <button className="primary" disabled={busy || !possible} onClick={() => void play(1)}>1회 변경</button>
        <button disabled={busy || !possible} onClick={() => void play(10)}>10회</button>
        <button disabled={busy || !possible} onClick={() => void play(100)}>100회</button>
        <button disabled={busy || !stats.total} onClick={reset}>기록 초기화</button>
        {busy && <button className="sim-stop" onClick={() => controller.current?.abort()}>중지</button>}
      </div>
      <div className="sim-bulk row">
        <label>최대 횟수 <input aria-label="시뮬레이션 최대 횟수" type="number" min="1" max="100000" step="1" value={limit} disabled={busy} onChange={e => setLimit(e.target.value)} /></label>
        <button disabled={busy || !limitValid || !possible} onClick={() => void play(numericLimit)}>입력 횟수만큼</button>
        <button className="primary" disabled={busy || !limitValid || !ids.length || !possible} onClick={() => void play(numericLimit, true)}>목표 조합까지</button>
      </div>
      {specialTiers.length > 0 && <p className="sim-rule">{specialTiers.map(t => TIERS[t]).join("·")} 전용 스킬이 새로 하나라도 나오면 즉시 멈추고 실제 사용량만 집계합니다. ‘목표 조합까지’는 선택한 조합 완성 시 멈춥니다.</p>}
      {!limitValid && <p className="sim-error">횟수는 1~100,000의 정수로 입력하세요.</p>}
      <div className="sim-message" role="status">{busy ? `${nf.format(stats.total)}회 진행 중…` : message || "카드와 포지션을 고른 뒤 변경 버튼을 누르세요."}</div>
    </div>

    <div className="card sim-goals">
      <h3>목표 조합 <small className="muted">선택 사항</small></h3>
      <p className="muted">선택한 스킬이 한 번의 결과에 모두 등장하면 성공입니다. 슬롯 순서는 상관없습니다.</p>
      <div className="sim-goal-inputs">{Array.from({ length: count }, (_, i) => <label key={i}>목표 {i + 1}<select aria-label={`목표 스킬 ${i + 1}`} value={targets[i] ?? ""} disabled={busy} onChange={e => target(i, e.target.value)}><option value="">선택 안 함</option>{candidates.map(s => <option key={skillId(s)} value={skillId(s)} disabled={ids.includes(skillId(s)) && targets[i] !== skillId(s)}>{s.name} · {TIERS[s.tier]}{lockedFirst?.id === skillId(s) ? ` · 잠금 ${lockedFirst.level}` : ""}</option>)}</select></label>)}</div>
      <label className="sim-minimum">목표 최소 레벨 <select aria-label="목표 최소 레벨" value={minimum} disabled={busy} onChange={e => { setMinimum(e.target.value as Level); reset(); }}>{LEVELS.map(l => <option key={l} value={l}>{l === "D" ? "레벨 무관" : `${l} 이상`}</option>)}</select></label>
      {!possible && <p className="sim-error" role="alert">현재 카드·변경권·잠금 상태에서는 달성할 수 없는 조합입니다. 목표 스킬이나 최소 레벨을 바꿔 주세요.</p>}
    </div>

    <div className="sim-stats" aria-label="시뮬레이션 통계">
      <div><span>사용한 가상 변경권</span><strong>{nf.format(stats.total)}<small>장</small></strong></div>
      <div><span>목표 조합 등장</span><strong>{ids.length ? nf.format(stats.hits) : "—"}<small>회</small></strong></div>
      <div><span>첫 목표 달성</span><strong>{stats.firstHit ? nf.format(stats.firstHit.number) : "—"}<small>회째</small></strong></div>
      <div><span>이번 실험 관측 비율</span><strong>{stats.total && ids.length ? (stats.hits / stats.total * 100).toFixed(2) : "—"}<small>%</small></strong></div>
    </div>
    {stats.firstHit && <details className="card"><summary>첫 목표 달성 조합 · {nf.format(stats.firstHit.number)}회째</summary><SkillChips board={stats.firstHit.board} /></details>}
    {stats.total > 0 && <details className="card"><summary>최근 8회 결과 · 티어 집계</summary>
      <div className="sim-tier-counts">{Object.entries(stats.tiers).map(([tier, n]) => <span key={tier}>{TIERS[tier as Tier]} {nf.format(n!)}개</span>)}<small className="muted">새로 변경한 슬롯 합계 · 잠근 슬롯 제외</small></div>
      {stats.recent.map(trial => <div className="sim-history" key={trial.number}><b>{nf.format(trial.number)}회 {trial.hit && "✓"}</b><SkillChips board={trial.board} /></div>)}
    </details>}
    <details className="card sim-sources"><summary>공식 확률 · 시뮬레이션 기준</summary>
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
