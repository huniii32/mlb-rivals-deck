import { useEffect, useState } from "react";
import { CARD_TYPES, POSITIONS, TICKETS } from "../lib/skillSimulator";
import type { PercentileInput, ScoreTail } from "../lib/skillPercentile";

function percent(value: number) {
  const p = Math.min(value, 1) * 100;
  if (p > 0 && p < 0.0001) return "0.0001% 미만";
  return p.toLocaleString("ko-KR", { maximumFractionDigits: p < 0.1 ? 4 : 2 }) + "%";
}

export function SkillPercentile({ settings, locked, target, scores }: PercentileInput) {
  // A stable signature avoids restarting the worker on unrelated editor or simulator renders.
  const request = JSON.stringify({ settings, locked, target, scores });
  const [result, setResult] = useState<{ request: string; tail: ScoreTail | null }>();
  useEffect(() => {
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("../lib/skillPercentileWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<ScoreTail | null>) => {
          worker?.terminate();
          setResult({ request, tail: data });
        };
        worker.onerror = () => {
          worker?.terminate();
          setResult({ request, tail: null });
        };
        worker.postMessage(JSON.parse(request));
      } catch {
        setResult({ request, tail: null });
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [request]);
  const tail = result?.request === request ? result.tail : undefined;
  const { card, position, ticket = "superior" } = settings;
  const title =
    target.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    "점 이상 획득 확률";
  return (
    <div className="skill-percentile">
      <strong>{title}</strong>
      <p role="status">
        {tail === undefined ? (
          "계산 중…"
        ) : tail === null ? (
          "확률을 계산할 수 없습니다."
        ) : tail.unknown > 1e-12 ? (
          <>
            최소 {percent(tail.atLeast)} · 평가 불가 {percent(tail.unknown)}
          </>
        ) : (
          <>
            상위 {tail.atLeast > 0 && tail.atLeast * 100 < 0.0001 ? "" : "약 "}
            {percent(tail.atLeast)}
          </>
        )}
      </p>
      <small>
        {CARD_TYPES[card]} · {POSITIONS[position]} · {TICKETS[ticket]} 변경권 1장 ·{" "}
        {locked ? "첫 줄 잠금, 나머지 합계" : "전체 슬롯 합계"} · 동점 포함
      </small>
      {tail && tail.unknown > 1e-12 && (
        <small>점수가 없는 스킬·레벨을 포함한 결과는 평가 불가로 집계했습니다.</small>
      )}
    </div>
  );
}
