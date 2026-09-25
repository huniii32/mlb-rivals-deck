import { useEffect, useMemo, useRef, useState } from "react";
import type { Kind, SkillTables } from "../lib/engine";
import { LOOKUP, fmtScore, skillScore, suggestSkills } from "../lib/engine";

/** 스킬 입력 콤보박스: 포커스하면 전체 목록, 타이핑하면 오타 보정 검색 결과 */
export function SkillInput({ kind, value, onChange, tables }: {
  kind: Kind;
  value: string;
  onChange: (v: string) => void;
  tables: SkillTables;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // 사용자가 타이핑하기 전엔 현재값과 무관하게 전체 목록
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const q = value.trim();

  const items = useMemo(() => {
    if (!open) return [];
    if (typed && q) return suggestSkills(kind, q, tables, 20);
    return [
      ...tables.customs.filter((c) => c.kind === kind).map((c) => c.name),
      ...(kind === "batter" ? LOOKUP.batter : LOOKUP.pitcher).map((s) => s.name),
    ];
  }, [open, typed, q, kind, tables]);

  useEffect(() => { setHi(0); }, [items]);
  useEffect(() => {
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setTyped(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHi((h) => Math.max(0, Math.min(items.length - 1, h + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && open && items[hi]) {
      e.preventDefault();
      pick(items[hi]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation(); // 팝업 에디터의 ESC 닫기로 번지지 않게
      setOpen(false);
    }
  };

  return (
    <span className="sk-combo">
      <input
        value={value} placeholder="스킬 검색 (클릭하면 전체 목록)"
        role="combobox" aria-expanded={open} aria-autocomplete="list"
        onFocus={() => { setTyped(false); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        // mousedown 기본동작을 막아 입력칸 포커스(=목록)가 클릭·스크롤바 조작 중 유지되게 함
        <ul className="sk-list" role="listbox" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {items.length === 0 && <li className="sk-empty">일치하는 스킬 없음</li>}
          {items.map((n, i) => (
            <li key={n} role="option" aria-selected={i === hi}
              className={i === hi ? "on" : ""}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(n)}>
              <span className="sk-name">{n}</span>
              <b>+{fmtScore(skillScore(kind, n, tables) ?? 0)}</b>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** 스킬 슬롯 1칸: 라벨 + 점수/표없음 pill + 입력 (팝업 에디터·스킬 비교 공용) */
export function SkillSlot({ label, n, kind, value, tables, onChange }: {
  label: string;
  n: number;
  kind: Kind;
  value: string;
  tables: SkillTables;
  onChange: (v: string) => void;
}) {
  const sc = value.trim() ? skillScore(kind, value, tables) : 0;
  return (
    <label>
      <span className="sk-head">{label}{n}
        {sc !== null && value.trim() !== "" && <b className="pill">+{fmtScore(sc)}</b>}
        {sc === null && <b className="pill bad-pill">표없음</b>}
      </span>
      <SkillInput kind={kind} value={value} tables={tables} onChange={onChange} />
    </label>
  );
}
