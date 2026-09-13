import type { Kind, PlayerInput, PlayerResult, SkillTables } from "../lib/engine";
import { LOOKUP, skillScore, suggestSkills } from "../lib/engine";
import { PlayerArt, gradeColor } from "./CardArt";
import { Num } from "./inputs";

/** 라인업에서 포지션 클릭 시 열리는 단일 선수 편집 팝업 */
export function PlayerEditor({
  p, res, update, close, customNames, tables,
}: {
  p: PlayerInput;
  res: PlayerResult;
  update: (patch: Partial<PlayerInput>) => void;
  close: () => void;
  customNames: string[];
  tables: SkillTables;
}) {
  const kind: Kind = p.kind;
  const stats = kind === "batter" ? ["파워", "정확", "선구"] : ["변화", "구위"];
  const n = kind === "batter" ? 3 : 2;
  const listId = `ed-skills-${kind}-${p.excelRow}`;
  const setArr = (field: "base" | "train" | "spec" | "extra" | "synergy" | "locker" | "finalOv", i: number, v: number | "") => {
    const arr = [...p[field]] as [number | "", number | "", number | ""];
    arr[i] = v;
    update({ [field]: arr } as Partial<PlayerInput>);
  };
  const setSkill = (i: number, v: string) => {
    const arr = [...p.skills] as [string, string, string, string];
    arr[i] = v;
    update({ skills: arr });
  };
  const skillList = kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher;

  return (
    <div className="card editor">
      <div className="ed-head">
        <div className="ed-art" style={{ borderColor: gradeColor(p.card) }}>
          {p.photoUrl.trim()
            ? <img src={p.photoUrl.trim()} alt={p.name} />
            : <PlayerArt kind={kind} accent={gradeColor(p.card)} />}
        </div>
        <div className="ed-title">
          <div className="ed-name">{p.name || "신규 선수"}</div>
          <div className="muted">{p.pos} · {kind === "batter" ? "타자" : "투수"} {p.card && `· ${p.card}`}</div>
        </div>
        <div className="ed-total">
          <span className="muted">최종점</span>
          <b>{res.total.toFixed(1)}</b>
        </div>
        <button onClick={close} title="닫기 (ESC)">✕</button>
      </div>

      <div className="ed-sec">기본 정보</div>
      <div className="ed-grid">
        <label>포지션<input value={p.pos} onChange={(e) => update({ pos: e.target.value })} /></label>
        {kind === "batter" && (
          <label>타순<Num value={p.order} onChange={(v) => update({ order: v })} /></label>
        )}
        <label>카드
          <select value={p.card} onChange={(e) => update({ card: e.target.value })}>
            <option value="">— 선택 —</option>
            {LOOKUP.cards.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>선수명<input value={p.name} onChange={(e) => update({ name: e.target.value })} /></label>
        <label>팀<input value={p.team} style={{ textTransform: "uppercase" }} placeholder="LAD"
          onChange={(e) => update({ team: e.target.value.toUpperCase() })} /></label>
        <label>연도<Num value={p.year} onChange={(v) => update({ year: v })} /></label>
        <label>초월Lv<Num value={p.transLv} onChange={(v) => update({ transLv: v })} /></label>
        <label>강화Lv<Num value={p.enhLv} onChange={(v) => update({ enhLv: v })} /></label>
        <label>포훈Lv<Num value={p.pohLv} onChange={(v) => update({ pohLv: v })} /></label>
      </div>

      <div className="ed-sec">스탯 (최종열에 직접 적으면 수동 고정 · 지우면 자동)</div>
      <table className="ed-stats">
        <thead>
          <tr><th>스탯</th><th>기본</th><th>훈련</th><th>특훈(리셋포함)</th><th>포지션훈련</th><th>시너지</th><th>라커룸</th><th>초월</th><th>강화</th><th>포훈</th><th>덱코</th><th>자동합</th><th>최종</th></tr>
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
              <td className="calc">+{res.trans[i] ?? 0}</td>
              <td className="calc">+{res.enh[i] ?? 0}</td>
              <td className="calc">+{res.poh[i] ?? 0}</td>
              <td className="calc">+{res.deck[i]}</td>
              <td className="calc"><b>{res.auto[i]}</b></td>
              <td><Num value={p.finalOv[i]} width={60} placeholder={String(res.auto[i])} onChange={(v) => setArr("finalOv", i, v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ed-sec">스킬</div>
      <div className="ed-skills">
        {([0, 1, 2, 3] as const).map((i) => {
          const v = p.skills[i];
          const sc = v.trim() ? skillScore(kind, v, tables) : 0;
          const exact = v.trim() !== "" && (tables.customs.some((c) => c.kind === kind && c.name === v.trim()) ||
            skillList.some((s) => s.name === v.trim()));
          const sug = !exact && v.trim() ? suggestSkills(kind, v, tables, 3) : [];
          return (
            <label key={i}>스킬{i + 1} {sc !== null && <b className="pill">+{sc}</b>}
              {sc === null && v.trim() && <b className="pill bad-pill">표없음</b>}
              <input list={listId} value={v} placeholder="스킬 검색"
                onChange={(e) => setSkill(i, e.target.value)} />
              {sug.length > 0 && (
                <span className="muted">혹시: {sug.map((s, j) => (
                  <span key={s}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setSkill(i, s); }}>{s}</a>
                    {j < sug.length - 1 ? " · " : ""}
                  </span>
                ))}</span>
              )}
            </label>
          );
        })}
        <datalist id={listId}>
          {customNames.map((x) => <option key={`c${x}`} value={x} />)}
          {skillList.map((s) => <option key={s.name} value={s.name} />)}
        </datalist>
      </div>

      <div className="ed-sec">카드 그림</div>
      <div className="row">
        <label>이미지 URL<input value={p.photoUrl} style={{ width: 280 }} placeholder="비우면 자체 일러스트"
          onChange={(e) => update({ photoUrl: e.target.value })} /></label>
        <span className="muted">직접 그린 카드 그림 URL이 있으면 입력</span>
      </div>

      <div className="ed-result">
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
    </div>
  );
}
