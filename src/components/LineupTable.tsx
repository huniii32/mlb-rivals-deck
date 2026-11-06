import type { Deck } from "../lib/deck";
import { YEAR_ANCHOR } from "../lib/deck";
import { allThresholds, deckTotals, fmtScore, type PlayerResult } from "../lib/engine";
import { BULLPEN_ROLES, ROLE_LABELS, bullpenRole, tacticStatus } from "../lib/bullpen";

/** 도안의 한 장 요약표. 계산은 기존 엔진 결과를 그대로 사용한다. */
export function LineupTable({ deck, results, onSelect }: {
  deck: Deck; results: PlayerResult[]; onSelect: (row: number) => void;
}) {
  const entries = deck.players.map((p, i) => ({ p, r: results[i] }));
  const warnings = entries.filter(({ p, r }) => p.name.trim() && r.warnings.length);
  const batters = entries.slice(0, 9).sort((a, b) => (a.p.order || 99) - (b.p.order || 99));
  const pitchers = [...entries.slice(9, 14), ...BULLPEN_ROLES.flatMap(role => entries.slice(14).filter(({ p }) => bullpenRole(p) === role))];
  const totals = deckTotals(deck.players, results);
  const tactics = tacticStatus(deck.players, deck.bullpenTactics);
  const roles: Record<string, number> = {};
  const fmt = (n: number, digits = 1) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const table = (players: typeof entries, batter: boolean) => <table className="lineup-sheet-table" aria-label={batter ? "타선 요약표" : "마운드 요약표"}>
    <colgroup>{Array.from({ length: 8 }, (_, i) => <col key={i} />)}</colgroup>
    <thead><tr>{(batter ? ["타순", "선수", "파워", "정확", "선구", "능력", "스킬", "점수"] : ["자리", "선수", "변화", "구위", "전술", "능력", "스킬", "점수"]).map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{players.map(({ p, r }) => {
      const role = bullpenRole(p);
      const ordinal = role ? (roles[role] = (roles[role] ?? 0) + 1) : 0;
      const position = batter ? `${p.order || "—"}번 ${p.pos}` : role ? `${({ winning: "승리", chasing: "추격", long: "롱릴", closer: "마무리" })[role]}${ordinal}` : p.pos;
      const filled = !!p.name.trim();
      const grade = p.card.includes("블랙") ? "black" : p.card.includes("시그니처") ? "sig" : p.card.includes("프라임") ? "prime" : "other";
      const gradeName = ({ black: "블랙", sig: "시그", prime: "프라", other: p.card })[grade];
      return <tr key={p.excelRow} className={role && ordinal === 1 ? "sheet-role-start" : ""}>
        <td title={role ? ROLE_LABELS[role] : p.pos} className="sheet-pos">{position}</td>
        <td><button className="sheet-player" title={`${p.name || p.pos} · ${p.card || "카드 미선택"}`} aria-label={`${p.name || p.pos} 선수 편집`} onClick={() => onSelect(p.excelRow)}>
          {filled && p.enhLv !== "" && <span className="sheet-enh">+{p.enhLv}</span>}
          <span className="sheet-name">{filled ? p.name : "+ 등록"}</span>
          {filled && <span className={`sheet-grade ${grade}`}>{gradeName}</span>}
        </button></td>
        {[0, 1].map(i => <td key={i}>{filled ? fmtScore(r.final[i]) : "—"}</td>)}
        <td>{!filled ? "—" : batter ? fmtScore(r.final[2]) : r.tactics[0] ? <span className="sheet-bonus">+{r.tactics[0]}</span> : "—"}</td>
        <td className="sheet-ability">{filled ? fmt(r.ability) : "—"}</td>
        <td className="sheet-skill" title={p.skills.filter(Boolean).join(" / ")}>{filled ? r.skill === null ? "확인" : fmt(r.skill, 2) : "—"}</td>
        <td className="sheet-score" title={r.warnings.join(" / ")}>{filled ? `${fmt(r.total)}${r.skill === null ? "*" : ""}` : "—"}</td>
      </tr>;
    })}</tbody>
  </table>;
  return <article className="lineup-sheet">
    <header className="sheet-header"><div><h3>{deck.name || "저장 전 덱"}</h3><p>{deck.players.filter(p => p.name.trim()).length}/{deck.players.length}명 등록 · 타자 9 / 선발 5 / 불펜 {deck.players.length - 14}</p></div><div className="sheet-total"><small>TOTAL SCORE</small><b>{fmt(totals.total)}</b></div></header>
    <section><h4>타선</h4>{table(batters, true)}</section>
    <section><h4>마운드</h4>{table(pitchers, false)}</section>
    <p className="sheet-tactics">승리조 {({ basic: "기본", aggressive: "적극", division: "분업" })[deck.bullpenTactics?.winning ?? "basic"]} <b>+{tactics.winningBonus}</b> · 추격조 {deck.bullpenTactics?.chasing === "aggressive" ? "적극" : "기본"} <b>+{tactics.chasingBonus}</b><span>전술은 표시 능력치에 포함</span></p>
    <div className="sheet-deckscore"><h4>덱스코어 선택</h4>{(["team", "spec"] as const).map(region => <div className="sheet-strip" key={region}><span>{region === "team" ? "팀덱코" : "스덱코"}</span><div>{allThresholds(region).map(({ row, threshold }) => {
      const yearRow = region === "spec" ? YEAR_ANCHOR[threshold] : undefined;
      const year = yearRow === undefined ? "" : deck.yearInputs[yearRow];
      const left = deck.flags[`${row}-${region}-L`], right = deck.flags[`${row}-${region}-R`];
      const label = yearRow !== undefined ? (typeof year === "number" ? "연" : "—") : left && right ? "양" : left ? "좌" : right ? "우" : "—";
      return <span key={row} className={`sheet-cell ${label === "우" ? "right" : label === "—" ? "off" : ""}`} title={`${threshold}: ${yearRow !== undefined ? year || "연도 미입력" : label}`}><small>{threshold}</small><i>{label}</i></span>;
    })}</div></div>)}</div>
    <p className="sheet-subtotals">타자 {fmt(totals.bt)} · 선발 {fmt(totals.sp)} · 불펜 {fmt(totals.rp)}</p>
    {warnings.length > 0 && <details className="sheet-warnings">
      <summary>계산 확인이 필요한 선수 {warnings.length}명</summary>
      <ul>{warnings.map(({ p, r }) => <li key={p.excelRow}>
        <button onClick={() => onSelect(p.excelRow)}>{p.name} · {p.pos} 수정</button>
        <span>{r.warnings.join(" / ")}</span>
      </li>)}</ul>
    </details>}
    <footer>선수명 선택 → 능력치·스킬 편집<span>랭킹대전 기준 · * 미인식 스킬 제외 임시 점수</span></footer>
  </article>;
}
