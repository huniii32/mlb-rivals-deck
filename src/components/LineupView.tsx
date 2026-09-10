import type { PlayerInput, PlayerResult } from "../lib/engine";
import type { PhotoInfo } from "../lib/photos";

// 게임 라인업 화면처럼 다이아몬드 위에 카드 배치.
// 타자 9명(외야 LF/CF/RF, 내야 3B/SS/2B/1B, 포수 C, 지명 DH) + 투수 9명(SP5/RP3/CP1).

const DIAMOND: [string, number, number][] = [
  ["CF", 50, 5],
  ["LF", 24, 12],
  ["RF", 76, 12],
  ["SS", 41, 26],
  ["2B", 59, 26],
  ["3B", 24, 35],
  ["1B", 76, 35],
  ["C", 50, 50],
  ["DH", 50, 64],
];

const DEF_ROW: Record<string, number> = {
  C: 11, "1B": 12, "2B": 13, "3B": 14, SS: 15, LF: 16, CF: 17, RF: 18, DH: 19,
};

const GRADE_COLOR: [string, string][] = [
  ["블랙", "#a855f7"],
  ["시그니처", "#8b5cf6"],
  ["슈프림", "#ef4444"],
  ["모먼트", "#f97316"],
  ["프라임", "#3b82f6"],
  ["명예의 전당", "#eab308"],
];

function gradeColor(card: string): string {
  for (const [k, c] of GRADE_COLOR) if (card.includes(k)) return c;
  return "#64748b";
}

function shortCard(card: string): string {
  return card
    .replace("WBC 시그니처 블랙", "WBC시블")
    .replace("FA 시그니처 블랙", "FA시블")
    .replace("시그니처 블랙", "시블")
    .replace("FA 시그니처", "FA시그")
    .replace("WBC 시그니처", "WBC시그")
    .replace("슈프림 모먼트", "슈모")
    .replace("명예의 전당", "HOF")
    .replace("FA 프라임", "FA프")
    .replace("WBC 프라임", "WBC프");
}

function Card({
  pos, name, card, score, filled, photo, onClick,
}: {
  pos: string; name: string; card: string; score: number; filled: boolean;
  photo?: PhotoInfo; onClick: () => void;
}) {
  const inner = (
    <>
      <span className="pcard-pos">{pos}</span>
      {filled ? (
        <>
          {photo && <img className="pcard-img" src={photo.src} alt={name} />}
          <span className="pcard-score">{score.toFixed(0)}</span>
          <span className="pcard-name">{name}</span>
          <span className="pcard-grade">{shortCard(card)}</span>
        </>
      ) : (
        <span className="pcard-name muted">+ 등록</span>
      )}
    </>
  );
  if (filled && photo) {
    return (
      <span className="pcard" style={{ borderColor: gradeColor(card), boxShadow: `0 0 10px ${gradeColor(card)}55` }}>
        <a href={photo.page} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{inner}</a>
        <button className="pcard-edit" onClick={onClick} title="입력 탭으로">✎</button>
      </span>
    );
  }
  return (
    <button
      className={`pcard ${filled ? "" : "empty"}`}
      style={filled ? { borderColor: gradeColor(card), boxShadow: `0 0 10px ${gradeColor(card)}55` } : undefined}
      onClick={onClick}
      title={filled ? `${name} — 클릭하면 입력 탭으로` : `${pos} 비어있음 — 클릭하면 입력 탭으로`}
    >
      {inner}
    </button>
  );
}

export function LineupView({
  batters, pitchers, bRes, pRes, onSelect, photos,
}: {
  batters: PlayerInput[];
  pitchers: PlayerInput[];
  bRes: PlayerResult[];
  pRes: PlayerResult[];
  onSelect: (excelRow: number) => void;
  photos: Record<number, PhotoInfo>;
}) {
  const byPos = new Map(batters.map((p, i) => [p.pos.trim().toUpperCase(), { p, r: bRes[i] }]));
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const sp = pRes.slice(0, 5).filter((_, i) => pitchers[i].name.trim()).map((r) => r.total);
  const rp = pRes.slice(5).filter((_, i) => pitchers[i + 5].name.trim()).map((r) => r.total);
  const bt = bRes.filter((_, i) => batters[i].name.trim()).map((r) => r.total);
  const dSP = avg(sp) * 10;
  const dRP = avg(rp) * 10;
  const dBT = avg(bt) * 10;
  const total = dSP * 0.4 + dRP * 0.1 + dBT * 0.5;

  return (
    <div className="card stadium">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>라인업</h3>
        <div>
          <span className="muted">선발 {dSP.toFixed(0)} · 계투 {dRP.toFixed(0)} · 타자 {dBT.toFixed(0)} · </span>
          <b className="score-sm">총점 {total.toFixed(1)}</b>
        </div>
      </div>
      <div className="diamond">
        <svg viewBox="0 0 100 72" preserveAspectRatio="none">
          <path d="M 8 44 A 46 46 0 0 1 92 44" fill="none" stroke="#3b82f6" strokeWidth="1.2" />
          <polygon points="50,54 64,41 50,28 36,41" fill="none" stroke="#22d3ee" strokeWidth="1" />
          <circle cx="50" cy="43" r="1.2" fill="#22d3ee" />
        </svg>
        {DIAMOND.map(([pos, x, y]) => {
          const hit = byPos.get(pos);
          return (
            <div key={pos} className="dslot" style={{ left: `${x}%`, top: `${y}%` }}>
              <Card
                pos={pos}
                name={hit?.p.name ?? ""}
                card={hit?.p.card ?? ""}
                score={hit?.r.total ?? 0}
                filled={!!hit?.p.name.trim()}
                photo={hit ? photos[hit.p.excelRow] : undefined}
                onClick={() => onSelect(hit?.p.excelRow ?? DEF_ROW[pos] ?? 11)}
              />
            </div>
          );
        })}
      </div>
      <h4>선발</h4>
      <div className="prow">
        {pitchers.slice(0, 5).map((p, i) => (
          <Card key={p.excelRow} pos={p.pos} name={p.name} card={p.card} score={pRes[i].total}
            filled={!!p.name.trim()} photo={photos[p.excelRow]} onClick={() => onSelect(p.excelRow)} />
        ))}
      </div>
      <h4>불펜</h4>
      <div className="prow">
        {pitchers.slice(5).map((p, i) => (
          <Card key={p.excelRow} pos={p.pos} name={p.name} card={p.card} score={pRes[i + 5].total}
            filled={!!p.name.trim()} photo={photos[p.excelRow]} onClick={() => onSelect(p.excelRow)} />
        ))}
      </div>
      <p className="muted">사진: Wikimedia Commons (CC 라이선스, 클릭 시 출처 페이지로 이동) ·
        구장 배경: <a href="https://commons.wikimedia.org/wiki/File:Fifth_Third_Park_night_view_from_left_field.jpg" target="_blank" rel="noreferrer">Fifth Third Park</a> (CC BY-SA 4.0)</p>
    </div>
  );
}
