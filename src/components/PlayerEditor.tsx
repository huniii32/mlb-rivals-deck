import { cardDisplayName } from "../lib/cardNames";
import type { Kind, PlayerInput, PlayerResult, SkillTables } from "../lib/engine";
import { BATTER_STATS, LOOKUP, PITCHER_STATS, isSigBlackCard } from "../lib/engine";
import { PlayerArt, gradeColor } from "./CardArt";
import { Num } from "./inputs";
import { SkillSlot } from "./SkillInput";
import { BULLPEN_ROLES, ROLE_LABELS, ROLE_LIMITS, bullpenRole } from "../lib/bullpen";
import type { BullpenRole } from "../lib/bullpen";

/** 라인업에서 포지션 클릭 시 열리는 단일 선수 편집 팝업 */
export function PlayerEditor({
  p, res, update, close, tables, bullpenCounts,
}: {
  p: PlayerInput;
  res: PlayerResult;
  update: (patch: Partial<PlayerInput>) => void;
  close: () => void;
  tables: SkillTables;
  bullpenCounts?: Record<BullpenRole, number>;
}) {
  const kind: Kind = p.kind;
  const stats = kind === "batter" ? BATTER_STATS : PITCHER_STATS;
  const isBlack = isSigBlackCard(p.card);
  const role = bullpenRole(p);
  const setArr = (
    field: "base" | "train" | "spec" | "extra" | "synergy" | "locker" | "blackPos" | "blackBoost" | "leaderBonus" | "finalOv",
    i: number, v: number | "",
  ) => {
    const arr = [...(p[field] ?? ["", "", ""])] as [number | "", number | "", number | ""];
    arr[i] = v;
    update({ [field]: arr } as Partial<PlayerInput>);
  };
  const setSkill = (i: number, v: string) => {
    const arr = [...p.skills] as [string, string, string, string];
    arr[i] = v;
    update({ skills: arr });
  };

  return (
    <div className="card card-ov editor">
      <div className="ed-head">
        <div className="ed-art" style={{ borderColor: gradeColor(p.card) }}>
          {p.photoUrl.trim()
            ? <img src={p.photoUrl.trim()} alt={p.name} />
            : <PlayerArt kind={kind} pos={p.pos} team={p.team} card={p.card} />}
        </div>
        <div className="ed-title">
          <div className="ed-name">{p.name || "신규 선수"}</div>
          <div className="muted">{p.pos} · {kind === "batter" ? "타자" : "투수"} {p.card && `· ${cardDisplayName(p.card)}`}</div>
        </div>
        <div className="ed-total">
          <span className="muted">최종점</span>
          <b>{res.total.toFixed(1)}</b>
        </div>
        <button onClick={close} title="닫기 (ESC)">✕</button>
      </div>

      <div className="ed-sec">기본 정보</div>
      <div className="ed-grid">
        <label>포지션<input value={p.pos} readOnly={!!role} onChange={(e) => update({ pos: e.target.value })} /></label>
        {role && <label>불펜 역할
          <select aria-label="불펜 역할" value={role} onChange={(e) => update({ bullpenRole: e.target.value as BullpenRole })}>
            {BULLPEN_ROLES.map((r) => <option key={r} value={r} disabled={r !== role && (bullpenCounts?.[r] ?? 0) >= ROLE_LIMITS[r]}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>}
        <label>카드
          <select aria-label="카드" value={p.card} onChange={(e) => update({ card: e.target.value })}>
            <option value="">— 선택 —</option>
            {LOOKUP.cards.map((c) => <option key={c} value={c}>{cardDisplayName(c)}</option>)}
          </select>
        </label>
        <label>선수명<input value={p.name} onChange={(e) => update({ name: e.target.value })} /></label>
        <label>팀<input value={p.team} style={{ textTransform: "uppercase" }} placeholder="LAD"
          onChange={(e) => update({ team: e.target.value.toUpperCase() })} /></label>
        <label>연도<Num value={p.year} onChange={(v) => update({ year: v })} /></label>
        <label>초월Lv<Num value={p.transLv} onChange={(v) => update({ transLv: v })} /></label>
        <label>강화Lv<Num value={p.enhLv} onChange={(v) => update({ enhLv: v })} /></label>
        <label>포훈Lv<Num value={p.pohLv} onChange={(v) => update({ pohLv: v })} /></label>
        {kind === "batter" && (
          <label title="덱스코어 일부 보너스가 타순 1~2 / 3~5 / 6번 이하 조건을 봅니다">타순(덱코 조건)<Num value={p.order} onChange={(v) => update({ order: v })} /></label>
        )}
      </div>

      <div className="ed-sec">스탯 · 강화·훈련·덱코 변경분 자동 반영</div>
      <p className="muted">최종값을 직접 입력해도 강화·초월·훈련·덱코 변경분이 자동으로 반영됩니다. 훈련재분배 후에는 바뀐 훈련 수치만 입력하세요.{kind === "pitcher" ? " 전술은 최종 입력 후 가산됩니다." : ""}</p>
      {p.finalOv.some((v) => v !== "") && <button onClick={() => update({ finalOv: ["", "", ""] })}>최종값을 자동 합계로 전환</button>}
      <div style={{ overflowX: "auto" }}>
      <table className="ed-stats">
        <thead>
          <tr><th>스탯</th><th>기본</th><th>훈련</th><th>특훈(리셋포함)</th><th title="포훈Lv로 자동 계산되는 포훈표 수치와 별개. 여기엔 게임 화면의 포지션훈련 '보너스' 수치만 입력(전체 포훈 수치 아님)">포지션훈련</th><th>시너지</th><th>라커룸</th>
            {isBlack && <th title="블랙 시그니처 전용 — 조견표가 없어 게임 화면 수치를 직접 입력">블랙포지션</th>}
            {isBlack && <th title="블랙 시그니처 전용 — 조견표가 없어 게임 화면 수치를 직접 입력">블랙부스트</th>}
            <th>리더 영향력</th><th>스킬 기본</th><th>초월</th><th>강화</th><th>포훈</th><th>덱코</th><th>전술</th><th>자동합</th><th>{kind === "pitcher" ? "최종(전술 전)" : "최종"}</th></tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s} className={res.manual[i] ? "manual" : ""}>
              <td><b>{s}</b></td>
              <td><Num value={p.base[i]} width={56} onChange={(v) => setArr("base", i, v)} /></td>
              <td><Num value={p.train[i]} width={56} onChange={(v) => setArr("train", i, v)} /></td>
              <td><Num value={p.spec[i]} width={56} onChange={(v) => setArr("spec", i, v)} /></td>
              <td><Num value={p.extra[i]} width={56} onChange={(v) => setArr("extra", i, v)} /></td>
              <td><Num value={p.synergy[i]} width={56} onChange={(v) => setArr("synergy", i, v)} /></td>
              <td><Num value={p.locker[i]} width={56} onChange={(v) => setArr("locker", i, v)} /></td>
              {isBlack && <td><Num value={p.blackPos?.[i] ?? ""} width={56} onChange={(v) => setArr("blackPos", i, v)} /></td>}
              {isBlack && <td><Num value={p.blackBoost?.[i] ?? ""} width={56} onChange={(v) => setArr("blackBoost", i, v)} /></td>}
              <td><Num value={p.leaderBonus?.[i] ?? ""} width={56} onChange={(v) => setArr("leaderBonus", i, v)} /></td>
              <td className="calc">+3</td>
              <td className="calc">+{res.trans[i] ?? 0}</td>
              <td className="calc">+{res.enh[i] ?? 0}</td>
              <td className="calc">+{res.poh[i] ?? 0}</td>
              <td className="calc">+{res.deck[i]}</td>
              <td className="calc" data-testid="tactic-bonus">+{res.tactics[i]}</td>
              <td className="calc"><b>{res.auto[i]}</b></td>
              <td><Num value={p.finalOv[i]} width={60} placeholder={String(res.auto[i] - res.tactics[i])} onChange={(v) => setArr("finalOv", i, v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <p className="muted">리더 영향력은 게임에 표시된 해당 선수의 합산 버프만 입력하세요. 라커룸이나 수동 최종값에 포함했다면 중복 입력하지 마세요. 리더 레벨별 자동 산정은 아직 지원하지 않습니다.</p>
      <div className="ed-sec">스킬</div>
      <div className="ed-skills">
        {([0, 1, 2, 3] as const).map((i) => (
          <SkillSlot key={i} label="스킬" n={i + 1} kind={kind} value={p.skills[i]} tables={tables}
            onChange={(nv) => setSkill(i, nv)} />
        ))}
      </div>

      <div className="ed-sec">카드 그림</div>
      <div className="row">
        <label>이미지 URL<input value={p.photoUrl} style={{ width: 280 }} placeholder="비우면 자체 일러스트"
          onChange={(e) => update({ photoUrl: e.target.value })} /></label>
        <span className="muted">직접 그린 카드 그림 URL이 있으면 입력</span>
      </div>

      <div className="ed-result">
        {res.team !== 0 && <div><span>추가 팀 버프</span><b>+{res.team.toFixed(1)}</b></div>}
        <div><span>능력치</span><b>{res.ability.toFixed(1)}</b></div>
        <div><span>스킬점</span><b>{res.skill === null ? "표없음" : res.skill.toFixed(1)}</b></div>
        <div><span>최종점</span><b>{res.total.toFixed(1)}</b></div>
      </div>
      {res.deckHits.length > 0 && (
        <p className="muted">덱코: {res.deckHits.map((h, i) => (
          <span key={i}>{h.region}{h.threshold} {h.stat}+{h.pts}{i < res.deckHits.length - 1 ? ", " : ""}</span>
        ))}</p>
      )}
      {res.warnings.length > 0 && (
        <div className="warn">{res.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
      )}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="primary" onClick={close}>입력 완료 · 라인업으로</button></div>
    </div>
  );
}
