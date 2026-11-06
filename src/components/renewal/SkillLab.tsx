import { useState } from "react";
import {
  LOOKUP,
  skillScore,
  type Kind,
  type SkillTables,
} from "../../lib/engine";
import { SkillSearch } from "./SkillSearch";
const base = (name: string) =>
  name
    .replace(/^\[[^\]]+\]\s*/, "")
    .split("(")[0]
    .trim();
const condition = (name: string) =>
  name.includes("(") ? name.slice(name.indexOf("(") + 1, -1) : "조건 없음";
export function SkillLab({ tables }: { tables: SkillTables }) {
  const [slotCount, setSlotCount] = useState(3);
  const slots = Array.from({ length: slotCount }, (_, i) => i);
  const [kind, setKind] = useState<Kind>("batter");
  const [level, setLevel] = useState("S0");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("1-2");
  const allRows = [
    ...LOOKUP[kind],
    ...tables.customs.filter((c) => c.kind === kind),
  ];
  const atLevel = (name: string, l: string) =>
    l === "other" ? !/^\[S[0-4]\]/.test(name) : name.startsWith(`[${l}]`);
  const rows = allRows.filter((r) => atLevel(r.name, level));
  const names = [...new Set(rows.map((r) => base(r.name)))];
  const seed =
    kind === "batter"
      ? ["배팅 머신", "클린업 트리오", "빠른발"]
      : ["더블 스토퍼", "도전자", "라스트 카운트"];
  const [combos, setCombos] = useState<{ level: string; name: string }[][]>([
    [],
    [],
  ]);
  const slotLevel = (side: number, slot: number) =>
    combos[side][slot]?.level ?? "S0";
  const slotRows = (side: number, slot: number) =>
    allRows.filter((r) => atLevel(r.name, slotLevel(side, slot)));
  const selection = (side: number, slot: number) =>
    combos[side][slot]?.name ??
    (slot === 3
      ? ""
      : ((
          slotRows(side, slot).find((r) => base(r.name) === seed[slot]) ??
          slotRows(side, slot)[slot]
        )?.name ?? ""));
  const change = (
    side: number,
    slot: number,
    name: string,
    nextLevel = slotLevel(side, slot),
  ) =>
    setCombos((old) =>
      old.map((arr, i) =>
        i === side
          ? Array.from({ length: slotCount }, (_, j) =>
              j === slot
                ? { level: nextLevel, name }
                : (arr[j] ?? {
                    level: slotLevel(side, j),
                    name: selection(side, j),
                  }),
            )
          : arr,
      ),
    );
  const changeLevel = (side: number, slot: number, nextLevel: string) => {
    const previous = selection(side, slot);
    const candidates = allRows.filter(
      (r) => atLevel(r.name, nextLevel) && base(r.name) === base(previous),
    );
    const next =
      candidates.find((r) => condition(r.name) === condition(previous)) ??
      candidates[0];
    change(side, slot, next?.name ?? "", nextLevel);
  };
  const score = (name: string) =>
    name ? (skillScore(kind, name, tables) ?? 0) : 0;
  const sums = [0, 1].map((i) =>
    slots.reduce((s, j) => s + score(selection(i, j)), 0),
  );
  const matching = names.filter((n) =>
    n.replace(/\s/g, "").includes(q.replace(/\s/g, "")),
  );
  return (
    <div className="skill-lab">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SKILL LAB</div>
            <h2>스킬 조합 비교</h2>
            <p>
              스킬 이름을 입력해 선택하세요. 레벨과 적용 조건은 슬롯마다 따로
              설정합니다.
            </p>
          </div>
          <div className="skill-filters">
            <select
              aria-label="비교 스킬 수"
              value={slotCount}
              onChange={(e) => {
                setSlotCount(Number(e.target.value));
                setTarget("1-2");
              }}
            >
              <option value={3}>스킬 3개</option>
              <option value={4}>스킬 4개 · 블랙</option>
            </select>
            <select
              aria-label="스킬 포지션"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setCombos([[], []]);
                setPick({});
              }}
            >
              <option value="batter">타자</option>
              <option value="pitcher">투수</option>
            </select>
          </div>
        </div>
        <div className={`skill-comparison slots-${slotCount}`}>
          {[0, 1].map((side) => (
            <div className="skill-combo" key={side}>
              <div className="combo-heading">
                <span className="combo-letter">{side ? "B" : "A"}</span>
                <h3>{side ? "비교 조합" : "현재 조합"}</h3>
              </div>
              {slots.map((slot) => {
                const chosen = selection(side, slot),
                  available = slotRows(side, slot),
                  opts = available.filter((r) => base(r.name) === base(chosen)),
                  slotNames = [...new Set(available.map((r) => base(r.name)))];
                return (
                  <div className="skill-slot" key={slot}>
                    <div className="slot-heading">
                      <span>스킬 {slot + 1}</span>
                      <strong>
                        {score(chosen).toFixed(2)}
                        <small>점</small>
                      </strong>
                    </div>
                    <div className="slot-input-row">
                      <label className="slot-level-label">
                        <span className="visually-hidden">레벨</span>
                        <select
                          aria-label={`${side ? "비교" : "현재"} 스킬 ${slot + 1} 레벨`}
                          value={slotLevel(side, slot)}
                          onChange={(e) =>
                            changeLevel(side, slot, e.target.value)
                          }
                        >
                          {["S0", "S1", "S2", "S3", "S4", "other"].map((l) => (
                            <option key={l} value={l}>
                              {l === "S0" ? "S" : l === "other" ? "기타" : l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="skill-choice">
                        <SkillSearch
                          key={`${kind}-${slotLevel(side, slot)}`}
                          label={`${side ? "비교" : "현재"} 조합 스킬 ${slot + 1}`}
                          value={base(chosen)}
                          names={slotNames}
                          onPick={(name) => {
                            const matching = available.filter(
                              (r) => base(r.name) === name,
                            );
                            const selected =
                              matching.find((r) => r.name === chosen) ??
                              matching[0];
                            change(side, slot, selected?.name ?? "");
                          }}
                        />
                      </div>
                    </div>
                    {opts.length > 1 ? (
                      <label className="skill-condition">
                        <span>조건</span>
                        <select
                          aria-label={`${side ? "비교" : "현재"} 스킬 ${slot + 1} 조건`}
                          value={chosen}
                          onChange={(e) => change(side, slot, e.target.value)}
                        >
                          {opts.map((r) => (
                            <option key={r.name} value={r.name}>
                              {condition(r.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="slot-condition-none">
                        <span>조건</span>
                        <small>
                          {!chosen
                            ? "스킬을 먼저 선택하세요"
                            : condition(chosen) === "-"
                              ? "추가 조건 없음"
                              : condition(chosen)}
                        </small>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="skill-sum">
                <span>스킬 {slotCount}개 합계</span>
                <strong>
                  {sums[side].toFixed(2)}
                  <small>점</small>
                </strong>
              </div>
            </div>
          ))}
        </div>
        <div className="comparison-result">
          <span>비교 조합 차이</span>
          <strong>
            {sums[1] - sums[0] >= 0 ? "+" : ""}
            {(sums[1] - sums[0]).toFixed(2)}점
          </strong>
          <span>기존 점수표 · 선택 조건 반영</span>
        </div>
      </section>
      <section className="panel skill-directory">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">FIND YOUR SKILL</div>
            <h2>
              스킬 검색 <span className="count">{matching.length}개</span>
            </h2>
          </div>
          <label className="search">
            ⌕{" "}
            <input
              aria-label="스킬 검색"
              placeholder="스킬 이름 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
        <div className="skill-destination">
          <label>
            검색 레벨
            <select
              aria-label="검색 스킬 레벨"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPick({});
              }}
            >
              {["S0", "S1", "S2", "S3", "S4", "other"].map((l) => (
                <option key={l} value={l}>
                  {l === "S0" ? "S" : l === "other" ? "기타" : l}
                </option>
              ))}
            </select>
          </label>
          <label>
            검색 결과 적용 위치
            <select
              aria-label="검색 스킬 적용 위치"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {[0, 1].flatMap((i) =>
                slots.map((j) => (
                  <option key={`${i}-${j}`} value={`${i}-${j}`}>
                    {i ? "비교" : "현재"} 조합 · 스킬 {j + 1}
                  </option>
                )),
              )}
            </select>
          </label>
          <span>원하는 조건을 고른 뒤 조합에 넣으세요.</span>
        </div>
        <div className="directory-list">
          {matching.map((n) => {
            const opts = rows.filter((r) => base(r.name) === n);
            const chosen = opts.find((r) => r.name === pick[n]) ?? opts[0];
            return (
              <div className="directory-row" key={n}>
                <span className="skill-grade">
                  {level === "S0" ? "S" : level === "other" ? "기타" : level}
                </span>
                <strong>{n}</strong>
                {opts.length > 1 ? (
                  <select
                    aria-label={`${n} 검색 조건`}
                    value={chosen.name}
                    onChange={(e) => setPick({ ...pick, [n]: e.target.value })}
                  >
                    {opts.map((r) => (
                      <option key={r.name} value={r.name}>
                        {condition(r.name)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="directory-condition">
                    {condition(chosen.name) === "-"
                      ? "조건 없음"
                      : condition(chosen.name)}
                  </span>
                )}
                <b>{score(chosen.name).toFixed(2)}</b>
                <button
                  onClick={() => {
                    const [i, j] = target.split("-").map(Number);
                    change(i, j, chosen.name, level);
                  }}
                >
                  조합에 넣기
                </button>
              </div>
            );
          })}
          {!matching.length && (
            <p className="empty-search">
              일치하는 스킬이 없습니다. 다른 이름으로 검색해주세요.
            </p>
          )}
        </div>
        <p className="muted">
          S는 기존 점수표의 S0에 해당합니다. 점수표에 등록된 스킬·조건만
          표시합니다.
        </p>
      </section>
    </div>
  );
}
