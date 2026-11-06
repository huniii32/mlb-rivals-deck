import { useEffect, useId, useRef, useState } from "react";

/** Select a skill name; the separate condition selector keeps its own value. */
export function SkillSearch({
  label,
  value,
  names,
  onPick,
}: {
  label: string;
  value: string;
  names: string[];
  onPick: (name: string) => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const normalize = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const options = typed
    ? names.filter((n) => normalize(n).includes(normalize(text)))
    : names;
  useEffect(() => {
    setText(value);
    setTyped(false);
  }, [value]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function pick(name: string) {
    onPick(name);
    setText(name);
    setOpen(false);
    setTyped(false);
    setActive(0);
  }
  return (
    <div className="skill-name-search">
      <div className="skill-search-input">
        <input
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-activedescendant={
            open && options[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          placeholder="스킬 이름을 입력해 검색"
          value={text}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setTyped(false);
              setActive(0);
            }
          }}
          onFocus={(e) => {
            setOpen(true);
            setTyped(false);
            setActive(0);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setOpen(false);
            setText(value);
            setTyped(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                setActive(0);
              } else
                setActive((i) =>
                  Math.max(
                    0,
                    Math.min(
                      options.length - 1,
                      i + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (options[active]) pick(options[active]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setText(value);
              setTyped(false);
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="skill-search-clear"
            aria-label={`${label} 지우기`}
            onClick={() => pick("")}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul
          ref={listRef}
          id={id}
          role="listbox"
          aria-label={`${label} 검색 결과`}
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.length ? (
            options.map((name, i) => (
              <li
                id={`${id}-${i}`}
                key={name}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(name)}
              >
                <span>{name}</span>
                {name === value && <small>선택됨</small>}
              </li>
            ))
          ) : (
            <li className="skill-search-empty" role="presentation">
              일치하는 스킬이 없습니다.
            </li>
          )}
        </ul>
      )}
      {open && typed && (
        <span className="search-pending" role="status">
          목록에서 선택하면 조합에 반영됩니다.
        </span>
      )}
    </div>
  );
}
