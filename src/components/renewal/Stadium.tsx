import type { CSSProperties } from "react";
import { PlayerArt } from "../../components/CardArt";
import { cardDisplayName } from "../../lib/cardNames";
import { BULLPEN_ROLES, ROLE_LABELS } from "../../lib/bullpen";
import type { RosterPlayer as Player } from "./Lineup";
const FIELD: Record<string, [number, number]> = {
  CF: [50, 15],
  LF: [15, 22],
  RF: [85, 22],
  SS: [35, 45],
  "2B": [65, 45],
  "3B": [15, 58],
  "1B": [85, 58],
  C: [50, 85],
  DH: [77, 88],
};
export function Stadium({
  players,
  group,
  onSelect,
  onAdd,
}: {
  players: Player[];
  group: string;
  onSelect: (p: Player) => void;
  onAdd: () => void;
}) {
  const bat = group === "타자";
  const bullpenRows = BULLPEN_ROLES.map((role) => ({
    role,
    members: players.filter((p) => p.bullpenRole === role),
  }));
  const bullpenColumns = Math.max(
    3,
    ...bullpenRows.map((row) => row.members.length),
  );
  function card(p: Player) {
    return (
      <button
        className={`player-card ${!p.name ? "vacant" : ""}`}
        onClick={() => onSelect(p)}
        aria-label={`${p.pos} ${p.name || "선수 등록"}`}
      >
        {p.name ? (
          <>
            <div className="player-art">
              {p.photoUrl ? (
                <img className="gc-art" src={p.photoUrl} alt={p.name} />
              ) : (
                <PlayerArt
                  kind={bat ? "batter" : "pitcher"}
                  pos={p.artPos}
                  team={p.team}
                  card={p.card}
                />
              )}
              <span className="position">{p.pos}</span>
              <b>{p.score.toFixed(1)}</b>
              {p.enhLv !== "" && (
                <span className="enhancement">+{p.enhLv}</span>
              )}
            </div>
            <div className="player-caption">
              <strong>{p.name}</strong>
              <span>{cardDisplayName(p.card)}</span>
            </div>
          </>
        ) : (
          <>
            <span className="position">{p.pos}</span>
            <b>＋</b>
            <span>선수 등록</span>
          </>
        )}
      </button>
    );
  }
  return (
    <div className={`stadium-board ${bat ? "field-board" : "pitcher-board"}`}>
      <div className="stadium-label">
        {bat
          ? "STARTING NINE"
          : group === "선발"
            ? "STARTING ROTATION"
            : "BULLPEN"}{" "}
        <span>RIVALS DECK</span>
      </div>
      {bat ? (
        <div className="position-field">
          <svg
            className="baseball-field"
            viewBox="0 0 740 680"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="renewal-grass">
                <stop stopColor="#38674e" />
                <stop offset="1" stopColor="#193a31" />
              </radialGradient>
              <pattern
                id="mow"
                width="74"
                height="74"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="37" height="74" fill="#ffffff03" />
              </pattern>
            </defs>
            <path
              d="M370 623L27 280Q370 -160 713 280Z"
              fill="url(#renewal-grass)"
            />
            <path d="M370 623L27 280Q370 -160 713 280Z" fill="url(#mow)" />
            <path
              d="M370 623L45 298M370 623L695 298"
              stroke="#d9dfbc65"
              strokeWidth="2"
              fill="none"
            />
            <path d="M370 578L180 390Q370 200 560 390Z" fill="#8b725340" />
            <path
              d="M370 575L230 435L370 295L510 435Z"
              fill="#38634a"
              stroke="#d2c2a766"
              strokeWidth="2"
            />
            <circle cx="370" cy="435" r="23" fill="#a68b6966" />
            <path d="M363 432H377V438H363Z" fill="#f1e8d4" />
            {[
              [370, 295],
              [230, 435],
              [510, 435],
            ].map(([x, y]) => (
              <rect
                key={x}
                x={x - 5}
                y={y - 5}
                width="10"
                height="10"
                fill="#e6e2d2"
                transform={`rotate(45 ${x} ${y})`}
              />
            ))}
            <path d="M362 573H378V582L370 589L362 582Z" fill="#e6e2d2" />
            <path
              d="M88 270Q370 -45 652 270"
              fill="none"
              stroke="#8d9b7c55"
              strokeWidth="3"
            />
          </svg>
          {players.map((p) => (
            <div
              className="field-player"
              key={p.excelRow}
              style={
                {
                  "--x": `${FIELD[p.pos]?.[0] ?? 50}%`,
                  "--y": `${FIELD[p.pos]?.[1] ?? 50}%`,
                } as CSSProperties
              }
            >
              {card(p)}
            </div>
          ))}
          <span className="field-wordmark">
            RIVALS
            <br />
            <small>HOME FIELD</small>
          </span>
        </div>
      ) : group === "불펜" ? (
        <div
          className="bullpen-rows"
          style={{ "--bullpen-columns": bullpenColumns } as CSSProperties}
        >
          {bullpenRows.map(({ role, members }) => (
            <section
              className="bullpen-role"
              aria-label={ROLE_LABELS[role]}
              key={role}
            >
              <header>
                <h3>{ROLE_LABELS[role]}</h3>
                <span>
                  {members.filter((p) => p.name.trim()).length} /{" "}
                  {members.length}명
                </span>
              </header>
              {members.length ? (
                <div className="pitcher-grid bullpen-role-cards">
                  {members.map((p) => (
                    <div key={p.excelRow}>{card(p)}</div>
                  ))}
                </div>
              ) : (
                <p className="bullpen-role-empty">배치된 슬롯 없음</p>
              )}
            </section>
          ))}
          {players.length < 7 && (
            <button className="bullpen-add" onClick={onAdd}>
              ＋ 불펜 배치 추가
            </button>
          )}
        </div>
      ) : (
        <div className="pitcher-grid">
          {players.map((p) => (
            <div key={p.excelRow}>{card(p)}</div>
          ))}
        </div>
      )}
      <div className="stadium-footer">
        <span>
          <i /> LIVE LINEUP
        </span>
        {bat ? "포지션별 배치 · 선수 선택으로 편집" : "선수 선택으로 편집"}
      </div>
    </div>
  );
}
