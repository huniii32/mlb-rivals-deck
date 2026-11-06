/** 부분-전체 비율 막대 (예: 선발40%+계투10%+타자50%). 라벨은 항상 범례로 별도 표시. */
export function ShareBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  return (
    <div>
      <div className="share-bar">
        {segments.map((s, i) => (
          <div key={i} className="share-seg" style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>
      <div className="share-legend">
        {segments.map((s, i) => (
          <span key={i} className="share-legend-item">
            <span className="share-dot" style={{ background: s.color }} />
            {s.label} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
