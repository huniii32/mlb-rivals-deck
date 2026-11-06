import { PlayerArt, gradeColor } from "../../components/CardArt";
import { SkillSlot } from "../../components/SkillInput";
import { cardDisplayName } from "../../lib/cardNames";
import {
  BATTER_STATS,
  PITCHER_STATS,
  LOOKUP,
  isSigBlackCard,
  type PlayerInput,
  type PlayerResult,
  type SkillTables,
} from "../../lib/engine";
import {
  BULLPEN_ROLES,
  ROLE_LABELS,
  ROLE_LIMITS,
  bullpenRole,
  type BullpenRole,
} from "../../lib/bullpen";
type NumberValue = number | "";
type StatField =
  | "base"
  | "train"
  | "spec"
  | "extra"
  | "synergy"
  | "locker"
  | "blackPos"
  | "blackBoost"
  | "leaderBonus"
  | "finalOv";
export function RenewalPlayerEditor({
  player: p,
  result: r,
  update,
  counts,
  close,
  tables,
}: {
  tables: SkillTables;
  player: PlayerInput;
  result: PlayerResult;
  update: (patch: Partial<PlayerInput>) => void;
  counts: Record<BullpenRole, number>;
  close: () => void;
}) {
  const stats = p.kind === "batter" ? BATTER_STATS : PITCHER_STATS;
  const role = bullpenRole(p);
  const black = isSigBlackCard(p.card);
  function numberInput(
    label: string,
    value: NumberValue,
    onChange: (v: NumberValue) => void,
    placeholder?: string,
  ) {
    return (
      <input
        key={label}
        type="number"
        aria-label={label}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
      />
    );
  }
  function statRow(label: string, field: StatField) {
    return (
      <div className="stat-input-row" key={field}>
        <span>{label}</span>
        {stats.map((stat, i) =>
          numberInput(
            `${stat} ${label}`,
            p[field]?.[i] ?? "",
            (v) => {
              const arr = [
                ...(p[field] ?? ["", "", ""]),
              ] as PlayerInput["base"];
              arr[i] = v;
              update({ [field]: arr });
            },
            field === "finalOv" ? String(r.auto[i] - r.tactics[i]) : undefined,
          ),
        )}
      </div>
    );
  }
  const autoRows: [string, number[]][] = [
    ["스킬 기본", [3, 3, 3]],
    ["초월", r.trans.map((n) => n ?? 0)],
    ["강화", r.enh.map((n) => n ?? 0)],
    ["포훈", r.poh.map((n) => n ?? 0)],
    ["덱스코어", r.deck],
    ["투수 전술", r.tactics],
  ];
  return (
    <div
      className={`renewal-player-editor ${stats.length === 2 ? "pitcher-editor" : ""}`}
    >
      <div className="player-edit-summary">
        <div className="editor-art" style={{ borderColor: gradeColor(p.card) }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} />
          ) : (
            <PlayerArt kind={p.kind} pos={p.pos} team={p.team} card={p.card} />
          )}
        </div>
        <div>
          <small>
            {role ? ROLE_LABELS[role] : p.pos} ·{" "}
            {cardDisplayName(p.card) || "카드 선택 전"}
          </small>
          <h3>{p.name || "신규 선수"}</h3>
          <p>입력하면 능력치와 점수가 바로 반영됩니다.</p>
        </div>
        <div className="editor-total">
          <span>최종 점수</span>
          <strong>{r.total.toFixed(1)}</strong>
        </div>
      </div>
      <section className="editor-section">
        <h3>기본 정보</h3>
        <div className="player-info-grid">
          <label>
            선수 이름
            <input
              value={p.name}
              maxLength={40}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <label>
            카드
            <select
              value={p.card}
              onChange={(e) => update({ card: e.target.value })}
            >
              <option value="">카드 선택</option>
              {LOOKUP.cards.map((c) => (
                <option value={c} key={c}>
                  {cardDisplayName(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            팀
            <input
              value={p.team}
              placeholder="LAD"
              onChange={(e) => update({ team: e.target.value.toUpperCase() })}
            />
          </label>
          <label>
            포지션
            <input
              value={p.pos}
              readOnly={!!role}
              onChange={(e) => update({ pos: e.target.value })}
            />
          </label>
          {role && (
            <label>
              불펜 역할
              <select
                value={role}
                onChange={(e) =>
                  update({ bullpenRole: e.target.value as BullpenRole })
                }
              >
                {BULLPEN_ROLES.map((k) => (
                  <option
                    key={k}
                    value={k}
                    disabled={k !== role && counts[k] >= ROLE_LIMITS[k]}
                  >
                    {ROLE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            연도{numberInput("연도", p.year, (v) => update({ year: v }))}
          </label>
          {p.kind === "batter" && (
            <label>
              타순{numberInput("타순", p.order, (v) => update({ order: v }))}
            </label>
          )}
        </div>
      </section>
      <section className="editor-section">
        <h3>
          육성 단계 <small>카드별 기존 조견표 적용</small>
        </h3>
        <div className="growth-grid">
          <label>
            강화 Lv
            {numberInput(
              "강화 Lv",
              p.enhLv,
              (v) => update({ enhLv: v }),
              "미입력",
            )}
          </label>
          <label>
            초월 Lv
            {numberInput(
              "초월 Lv",
              p.transLv,
              (v) => update({ transLv: v }),
              "미입력",
            )}
          </label>
          <label>
            포지션훈련 Lv
            {numberInput(
              "포지션훈련 Lv",
              p.pohLv,
              (v) => update({ pohLv: v }),
              "미입력",
            )}
          </label>
        </div>
        <p className="editor-hint training-applied" role="status" aria-label="포지션훈련 적용량">
          포지션훈련 적용 · {stats.map((stat, i) => `${stat} +${r.poh[i] ?? 0}`).join(" / ")}
        </p>
      </section>
      <section className="editor-section">
        <h3>능력치 입력</h3>
        <p className="editor-hint">
          기본·훈련·특훈 수치를 입력하세요. 훈련재분배 후에는 훈련 수치만 바꾸면
          됩니다.
        </p>
        <div className="stat-inputs">
          <div className="stat-input-row stat-head">
            <span>항목</span>
            {stats.map((stat) => (
              <b key={stat}>{stat}</b>
            ))}
          </div>
          {statRow("기본", "base")}
          {statRow("훈련", "train")}
          {statRow("특훈", "spec")}
          <details className="stat-more">
            <summary>
              추가 능력치 · 시너지 · 라커룸{black ? " · 블랙 보너스" : ""}
            </summary>
            {statRow("포훈 보너스", "extra")}
            {statRow("시너지", "synergy")}
            {statRow("라커룸", "locker")}
            {statRow("리더 영향력", "leaderBonus")}
            {black && (
              <>
                {statRow("블랙포지션", "blackPos")}
                {statRow("블랙부스트", "blackBoost")}
              </>
            )}
            <p className="editor-hint">
              포훈 보너스는 Lv 계산분 외의 추가 수치입니다. 리더 영향력은 게임에
              표시된 합산 버프를 입력하세요.
            </p>
          </details>
          <details className="auto-breakdown">
            <summary>자동 가산 내역 확인</summary>
            {autoRows.map(([label, values]) => (
              <div className="stat-input-row" key={label}>
                <span>{label}</span>
                {stats.map((_, i) => (
                  <b key={i} data-bonus={label}>
                    {values[i] >= 0 ? "+" : ""}
                    {values[i]}
                  </b>
                ))}
              </div>
            ))}
          </details>
          <div className="stat-input-row auto-total">
            <span>자동 합계</span>
            {stats.map((_, i) => (
              <strong key={i} data-auto-stat={stats[i]}>
                {r.auto[i]}
              </strong>
            ))}
          </div>
          <details className="manual-values">
            <summary>게임 수치와 다를 때만 맞추기 · 선택사항</summary>
            <p className="editor-hint">
              자동 계산이 게임에 표시된 능력치와 같다면 비워두세요. 다를 때만
              게임의 수치를 입력하면 됩니다.
            </p>
            <div className="manual-example">
              <strong>예: 자동 계산 175 → 게임에는 180</strong>
              <p>
                180을 입력하면 적용 능력치가 180이 됩니다.
                <br />
                이후 강화로 +2가 붙으면 <b>182</b>로 자동 변경됩니다.
              </p>
            </div>
            <p className="editor-hint">
              훈련·초월·덱스코어를 바꿀 때도 변경된 만큼 더하거나 뺍니다.
              {p.kind === "pitcher"
                ? " 투수는 전술 보너스를 더하기 전 수치를 입력하세요. 전술 보너스는 별도로 계산됩니다."
                : ""}
            </p>
            {statRow(
              p.kind === "pitcher" ? "최종(전술 전)" : "최종",
              "finalOv",
            )}
            {p.finalOv.some((v) => v !== "") && (
              <button
                className="reset-final"
                onClick={() => update({ finalOv: ["", "", ""] })}
              >
                입력값 지우고 자동 계산 사용
              </button>
            )}
          </details>
          <div className="stat-input-row final-total">
            <span>적용 능력치</span>
            {stats.map((_, i) => (
              <strong key={i} data-final-stat={stats[i]}>
                {r.final[i]}
              </strong>
            ))}
          </div>
        </div>
      </section>
      <section className="editor-section">
        <h3>
          스킬 <small>랭킹대전 기준</small>
        </h3>
        <div className="editor-skill-grid">
          {[0, 1, 2, 3].map((i) => (
            <SkillSlot
              key={i}
              label="스킬 "
              n={i + 1}
              kind={p.kind}
              value={p.skills[i]}
              tables={tables}
              onChange={(name) => {
                const skills = [...p.skills] as PlayerInput["skills"];
                skills[i] = name;
                update({ skills });
              }}
            />
          ))}
        </div>
      </section>
      <details className="editor-section image-setting">
        <summary>카드 이미지</summary>
        <label>
          영문 이름
          <input
            value={p.enName}
            onChange={(e) => update({ enName: e.target.value })}
          />
        </label>
        <label>
          이미지 URL
          <input
            type="url"
            value={p.photoUrl}
            placeholder="비우면 기존 일러스트"
            onChange={(e) => update({ photoUrl: e.target.value })}
          />
        </label>
      </details>
      <div className="editor-score-parts">
        <div>
          <span>능력치 점수</span>
          <strong>{r.ability.toFixed(1)}</strong>
        </div>
        <div>
          <span>스킬 점수</span>
          <strong>{r.skill === null ? "표 없음" : r.skill.toFixed(2)}</strong>
        </div>
        <div>
          <span>최종 점수</span>
          <strong>{r.total.toFixed(1)}</strong>
        </div>
      </div>
      {r.warnings.length > 0 && (
        <div className="editor-warnings" role="status">
          {r.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      <div className="editor-finish">
        <span>입력한 내용이 현재 덱에 즉시 반영됩니다.</span>
        <button className="primary" onClick={close}>
          입력 완료 · 라인업으로
        </button>
      </div>
    </div>
  );
}
