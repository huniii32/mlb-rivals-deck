import type { Kind, PlayerInput, PlayerResult } from "../lib/engine";
import { LOOKUP } from "../lib/engine";
import type { PhotoInfo } from "../lib/photos";
import { commonsSearchUrl } from "../lib/photos";
import { Num } from "./inputs";

/** 라인업에서 포지션 클릭 시 열리는 단일 선수 편집 폼 */
export function PlayerEditor({
  p, res, update, close, customNames, photo,
}: {
  p: PlayerInput;
  res: PlayerResult;
  update: (patch: Partial<PlayerInput>) => void;
  close: () => void;
  customNames: string[];
  photo?: PhotoInfo;
}) {
  const kind: Kind = p.kind;
  const stats = kind === "batter" ? ["파워", "정확", "선구"] : ["변화", "구위"];
  const n = kind === "batter" ? 3 : 2;
  const listId = `ed-skills-${kind}-${p.excelRow}`;
  const setArr = (field: "base" | "train" | "spec" | "extra" | "finalOv", i: number, v: number | "") => {
    const arr = [...p[field]] as [number | "", number | "", number | ""];
    arr[i] = v;
    update({ [field]: arr } as Partial<PlayerInput>);
  };
  const setSkill = (i: number, v: string) => {
    const arr = [...p.skills] as [string, string, string, string];
    arr[i] = v;
    update({ skills: arr });
  };
  return (
    <div className="card editor">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{p.pos} {p.name || "(신규 선수)"} <span className="muted">{kind === "batter" ? "타자" : "투수"}</span></h3>
        <button onClick={close}>닫기 ✕</button>
      </div>
      <div className="row">
        <label>포지션 <input value={p.pos} style={{ width: 52 }} onChange={(e) => update({ pos: e.target.value })} /></label>
        {kind === "batter" && (
          <label>타순 <Num value={p.order} width={44} onChange={(v) => update({ order: v })} /></label>
        )}
        <label>카드{" "}
          <select value={p.card} onChange={(e) => update({ card: e.target.value })}>
            <option value="">—</option>
            {LOOKUP.cards.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>선수명 <input value={p.name} style={{ width: 100 }} onChange={(e) => update({ name: e.target.value })} /></label>
        <label>연도 <Num value={p.year} width={64} onChange={(v) => update({ year: v })} /></label>
        <label>초월Lv <Num value={p.transLv} width={48} onChange={(v) => update({ transLv: v })} /></label>
        <label>강화Lv <Num value={p.enhLv} width={48} onChange={(v) => update({ enhLv: v })} /></label>
        <label>포훈Lv <Num value={p.pohLv} width={48} onChange={(v) => update({ pohLv: v })} /></label>
        <label>스킬B(+3) <button className={p.skillB ? "on" : ""} onClick={() => update({ skillB: !p.skillB })}>{p.skillB ? "O" : "X"}</button></label>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr><th>스탯</th><th>기본</th><th>훈련</th><th>특훈</th><th>초월</th><th>강화</th><th>포훈</th><th>기타</th><th>덱코</th><th>자동합</th><th>최종(수정)</th></tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s}>
              <td><b>{s}</b></td>
              <td><Num value={p.base[i]} width={52} onChange={(v) => setArr("base", i, v)} /></td>
              <td><Num value={p.train[i]} width={52} onChange={(v) => setArr("train", i, v)} /></td>
              <td><Num value={p.spec[i]} width={52} onChange={(v) => setArr("spec", i, v)} /></td>
              <td>{res.trans[i] ?? "-"}</td>
              <td>{res.enh[i] ?? "-"}</td>
              <td>{res.poh[i] ?? "-"}</td>
              <td><Num value={p.extra[i]} width={52} onChange={(v) => setArr("extra", i, v)} /></td>
              <td>+{res.deck[i]}</td>
              <td>{res.auto[i]}</td>
              <td><Num value={p.finalOv[i]} width={56} placeholder={String(res.auto[i])} onChange={(v) => setArr("finalOv", i, v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        {([0, 1, 2, 3] as const).map((i) => (
          <span key={i}>스킬{i + 1} <input list={listId} value={p.skills[i]} style={{ width: 170 }}
            onChange={(e) => setSkill(i, e.target.value)} /></span>
        ))}
        <datalist id={listId}>
          {customNames.map((x) => <option key={`c${x}`} value={x} />)}
          {(kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher).map((s) => <option key={s.name} value={s.name} />)}
        </datalist>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label>영문명(사진) <input value={p.enName} style={{ width: 160 }} placeholder="Shohei Ohtani"
          onChange={(e) => update({ enName: e.target.value })} /></label>
        <label>사진URL <input value={p.photoUrl} style={{ width: 220 }} placeholder="직접 지정 (선택)"
          onChange={(e) => update({ photoUrl: e.target.value })} /></label>
        {p.enName.trim() && <a href={commonsSearchUrl(p.enName)} target="_blank" rel="noreferrer">직접찾기</a>}
        {photo && <a href={photo.page} target="_blank" rel="noreferrer"><img src={photo.src} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 4 }} /></a>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span>능력치 <b>{res.ability.toFixed(1)}</b></span>
        <span>스킬점 <b>{res.skill === null ? "표없음" : res.skill.toFixed(1)}</b></span>
        <span>최종점 <b>{res.total.toFixed(1)}</b></span>
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
