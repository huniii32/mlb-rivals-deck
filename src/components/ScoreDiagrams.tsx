/** 산정방식 모달 전용 다이어그램들. 순수 HTML/CSS로 그림 (SVG 불필요할 만큼 단순). */

/** 자동합 → 최종 스탯 → 능력치+스킬점수 → 최종점 → 덱 총점 흐름도 */
export function FlowDiagram({ steps }: { steps: string[] }) {
  return (
    <div className="flow-diagram">
      {steps.map((s, i) => (
        <div className="flow-item" key={i}>
          <div className="flow-step">{s}</div>
          {i < steps.length - 1 && <div className="flow-arrow" aria-hidden>→</div>}
        </div>
      ))}
    </div>
  );
}

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

/** 스탯별 가중치 막대 (계수 크기 비교, 전체 합=100%가 아님) */
export function WeightBars({ bars, color }: { bars: { label: string; weight: number }[]; color: string }) {
  const max = Math.max(...bars.map((b) => b.weight));
  return (
    <div className="weight-bars">
      {bars.map((b, i) => (
        <div key={i} className="weight-row">
          <span className="weight-label">{b.label}</span>
          <span className="weight-track">
            <span className="weight-fill" style={{ width: `${(b.weight / max) * 100}%`, background: color }} />
          </span>
          <span className="weight-value">×{b.weight}</span>
        </div>
      ))}
    </div>
  );
}

/** 팀덱코(전원 동일값) vs 스덱코(포지션마다 다른 값) 적용 범위 비교.
 *  uniform: 9칸 전부 같은 밝기(=같은 보너스). varied: 칸마다 밝기가 달라짐(=포지션마다 다른 보너스). */
export function ScopeDiagram({ variant, label }: { variant: "uniform" | "varied"; label: string }) {
  const shades = [1, 0.2, 0.65, 0.35, 0.9, 0.15, 0.5, 0.25, 0.8]; // varied일 때 쓸 임의 밝기 패턴 (대비 크게)
  return (
    <div className="scope-diagram">
      <div className="scope-dots">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="scope-dot"
            style={{ opacity: variant === "uniform" ? 0.9 : shades[i] }}
          />
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>{label}</div>
    </div>
  );
}
