import { useEffect, useMemo, useState } from "react";
import type { Grade, LineupSlot, Player } from "./types";
import { GRADES, POSITIONS, defaultSlots, newId } from "./lib/grades";
import { load, save } from "./lib/store";
import { calcScore } from "./lib/score";
import { decodeShare, encodeShare } from "./lib/share";
import { parsePlayerFile } from "./lib/excel";
import "./styles.css";

type Tab = "players" | "lineup" | "sim" | "share" | "settings";

export default function App() {
  const [boot] = useState(load);
  const [players, setPlayers] = useState<Player[]>(boot.players);
  const [slots, setSlots] = useState<LineupSlot[]>(boot.slots);
  const [weights, setWeights] = useState(boot.weights);
  const [tab, setTab] = useState<Tab>("players");
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => {
    save({ players, slots, weights });
  }, [players, slots, weights]);

  // 공유 링크로 들어오면 미리보기
  useEffect(() => {
    const m = window.location.hash.match(/#d=([A-Za-z0-9+/=]+)/);
    if (!m) return;
    const deck = decodeShare(m[1]);
    if (deck) {
      setShared(`공유 덱 ${deck.players.length}명 (슬롯 ${deck.slots.length}개) — 공유 탭에서 가져오기 가능`);
      setTab("share");
    }
  }, []);

  const score = useMemo(() => calcScore(players, slots, weights), [players, slots, weights]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  return (
    <div className="wrap">
      <h1>Rivals Deck</h1>
      <p className="muted">
        9이닝스 라이벌즈 덱관리 MVP — 로그인 없이 브라우저에 저장. 덱스코어는 공식이 비공개라 임의
        가중치이며 설정 탭에서 조정.
      </p>
      {shared && <div className="warn">{shared}</div>}

      <div className="tabs">
        {(["players", "lineup", "sim", "share", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ players: `보유목록(${players.length})`, lineup: "라인업", sim: "교체시뮬", share: "공유", settings: "설정" }[t]}
          </button>
        ))}
      </div>

      {tab === "players" && (
        <PlayersTab players={players} setPlayers={setPlayers} />
      )}
      {tab === "lineup" && (
        <LineupTab players={players} slots={slots} setSlots={setSlots} scoreTotal={score.total} />
      )}
      {tab === "sim" && (
        <SimTab players={players} slots={slots} setSlots={setSlots} />
      )}
      {tab === "share" && <ShareTab players={players} slots={slots} setPlayers={setPlayers} setSlots={setSlots} />}
      {tab === "settings" && (
        <SettingsTab weights={weights} setWeights={setWeights} setSlots={setSlots} />
      )}

      <div className="card">
        <div className="muted">덱스코어</div>
        <div className="score">{score.total}</div>
        <div className="muted">
          등급 {score.gradePoints} + 오버롤 {score.overallPoints} + 시너지 {score.synergyPoints}
          ({score.synergyTeam} {score.synergyCount}명) · {score.filled}/{score.totalSlots} 슬롯
        </div>
      </div>
    </div>
  );
}

function PlayersTab({ players, setPlayers }: { players: Player[]; setPlayers: (p: Player[]) => void }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [grade, setGrade] = useState("");
  const [form, setForm] = useState({ name: "", team: "", position: "DH", grade: "S" as Grade, overall: 70, level: 1 });

  const teams = useMemo(() => [...new Set(players.map((p) => p.team).filter(Boolean))].sort(), [players]);
  const filtered = players.filter(
    (p) =>
      (!q || p.name.includes(q)) &&
      (!team || p.team === team) &&
      (!grade || p.grade === grade),
  );

  const add = () => {
    if (!form.name.trim()) return;
    setPlayers([...players, { ...form, id: newId(), name: form.name.trim(), note: "" }]);
    setForm({ ...form, name: "" });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = await parsePlayerFile(f);
      setPlayers([...players, ...parsed]);
      alert(`${parsed.length}명 등록됨`);
    } catch {
      alert("엑셀解析 실패 — sample-players.csv 형식을 확인하세요.");
    }
  };

  return (
    <div className="card">
      <div className="row">
        <input placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">전체 팀</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">전체 등급</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <a href="/sample-players.csv">양식 다운로드</a>
        <label>엑셀 업로드 <input type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="팀" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} style={{ width: 90 }} />
        <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value as Grade })}>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input type="number" value={form.overall} onChange={(e) => setForm({ ...form, overall: Number(e.target.value) })} style={{ width: 80 }} />
        <button className="primary" onClick={add}>추가</button>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>이름</th><th>팀</th><th>포지션</th><th>등급</th><th>오버롤</th><th></th></tr></thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.team}</td><td>{p.position}</td><td>{p.grade}</td><td>{p.overall}</td>
              <td><button onClick={() => setPlayers(players.filter((x) => x.id !== p.id))}>삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">선수가 없습니다. 위에서 추가하거나 엑셀로 올리세요.</p>}
    </div>
  );
}

function LineupTab({ players, slots, setSlots, scoreTotal }: {
  players: Player[]; slots: LineupSlot[]; setSlots: (s: LineupSlot[]) => void; scoreTotal: number;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="card">
      <div className="muted">현재 덱스코어 {scoreTotal} — 슬롯별 선수를 고르세요. 포지션에 맞는 후보만 표시됩니다.</div>
      <div className="grid" style={{ marginTop: 8 }}>
        {slots.map((s) => {
          const cands = players.filter((p) => s.allowedPositions.includes(p.position));
          return (
            <div key={s.slotId} className={`slot ${s.playerId ? "filled" : ""}`}>
              <div><b>{s.label}</b> <span className="muted">{s.allowedPositions.join("/")}</span></div>
              <select
                value={s.playerId ?? ""}
                onChange={(e) =>
                  setSlots(slots.map((x) => (x.slotId === s.slotId ? { ...x, playerId: e.target.value || null } : x)))
                }
              >
                <option value="">— 비움 —</option>
                {cands.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.team} {p.grade} {p.overall})</option>
                ))}
              </select>
              {s.playerId && byId.get(s.playerId) && (
                <div className="muted">{byId.get(s.playerId)!.team} · {byId.get(s.playerId)!.grade} · {byId.get(s.playerId)!.overall}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimTab({ players, slots, setSlots }: {
  players: Player[]; slots: LineupSlot[]; setSlots: (s: LineupSlot[]) => void;
}) {
  const [slotId, setSlotId] = useState(slots[0]?.slotId ?? "");
  const slot = slots.find((s) => s.slotId === slotId) ?? slots[0];
  const current = slot?.playerId ? players.find((p) => p.id === slot.playerId) : undefined;
  const cands = slot ? players.filter((p) => slot.allowedPositions.includes(p.position)) : [];
  const rank = (p: Player) => p.overall + (p.grade === "HOF" ? 100 : p.grade.includes("시그니처") ? 88 : p.grade === "S" ? 60 : 40);
  const sorted = [...cands].sort((a, b) => rank(b) - rank(a));

  if (!slot) return <div className="card">슬롯이 없습니다.</div>;
  return (
    <div className="card">
      <div className="row">
        <select value={slot.slotId} onChange={(e) => setSlotId(e.target.value)}>
          {slots.map((s) => <option key={s.slotId} value={s.slotId}>{s.label}</option>)}
        </select>
        <span className="muted">현재: {current ? `${current.name} (${current.grade} ${current.overall})` : "비움"}</span>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>후보</th><th>팀</th><th>등급</th><th>오버롤</th><th>차이</th><th></th></tr></thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.team}</td><td>{p.grade}</td><td>{p.overall}</td>
              <td>{current ? (p.overall - current.overall > 0 ? `+${p.overall - current.overall}` : p.overall - current.overall) : "-"}</td>
              <td><button onClick={() => setSlots(slots.map((s) => (s.slotId === slot.slotId ? { ...s, playerId: p.id } : s)))}>기용</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShareTab({ players, slots, setPlayers, setSlots }: {
  players: Player[]; slots: LineupSlot[];
  setPlayers: (p: Player[]) => void; setSlots: (s: LineupSlot[]) => void;
}) {
  const [link, setLink] = useState("");
  const [input, setInput] = useState("");

  const make = () => {
    const code = encodeShare(players, slots);
    const url = `${window.location.origin}${window.location.pathname}#d=${code}`;
    setLink(url);
  };
  const importFrom = (codeOrUrl: string) => {
    const m = codeOrUrl.match(/#d=([A-Za-z0-9+/=]+)/);
    const code = m ? m[1] : codeOrUrl.trim();
    const deck = decodeShare(code);
    if (!deck) { alert("공유 코드解析 실패"); return; }
    // 라인업 스냅샷 선수들을 보유목록에 합치고 슬롯 복원
    const ids = new Set(players.map((p) => p.id));
    const fresh = deck.players.filter((p) => !ids.has(p.id));
    const merged = [...players, ...fresh];
    const base = defaultSlots();
    const bySlot = new Map(deck.slots.map((s) => [s.slotId, s.playerId]));
    setPlayers(merged);
    setSlots(base.map((s) => ({ ...s, playerId: bySlot.get(s.slotId) ?? null })));
    alert(`${deck.players.length}명 라인업 가져옴`);
  };

  useEffect(() => {
    const m = window.location.hash.match(/#d=([A-Za-z0-9+/=]+)/);
    if (m) setInput(window.location.href);
  }, []);

  return (
    <div className="card">
      <p className="muted">로그인 없이 라인업 스냅샷을 URL에 담아 공유합니다. 받는 쪽은 링크를 열면 가져오기 가능.</p>
      <div className="row">
        <button className="primary" onClick={make}>공유 링크 만들기</button>
        {link && <button onClick={() => navigator.clipboard.writeText(link)}>복사</button>}
      </div>
      {link && <p><a href={link}>{link.slice(0, 80)}...</a></p>}
      <div className="row" style={{ marginTop: 8 }}>
        <input style={{ flex: 1 }} placeholder="공유 링크 또는 코드 붙여넣기" value={input} onChange={(e) => setInput(e.target.value)} />
        <button onClick={() => importFrom(input)}>가져오기</button>
      </div>
    </div>
  );
}

function SettingsTab({ weights, setWeights, setSlots }: {
  weights: ReturnType<typeof load>["weights"];
  setWeights: (w: ReturnType<typeof load>["weights"]) => void;
  setSlots: (s: LineupSlot[]) => void;
}) {
  return (
    <div className="card">
      <p className="muted">덱스코어 가중치 조정 (게임 공식이 비공개라 임의값 — 실제 체감에 맞게 수정).</p>
      <div className="grid">
        {GRADES.map((g) => (
          <label key={g}>{g} <input type="number" value={weights.gradeScores[g]} onChange={(e) =>
            setWeights({ ...weights, gradeScores: { ...weights.gradeScores, [g]: Number(e.target.value) } })
          } /></label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label>오버롤 가중 <input type="number" step="0.1" value={weights.overallWeight} onChange={(e) =>
          setWeights({ ...weights, overallWeight: Number(e.target.value) })} /></label>
        <label>시너지/명 <input type="number" value={weights.synergyPerCount} onChange={(e) =>
          setWeights({ ...weights, synergyPerCount: Number(e.target.value) })} /></label>
        <label>시너지 상한 <input type="number" value={weights.synergyMax} onChange={(e) =>
          setWeights({ ...weights, synergyMax: Number(e.target.value) })} /></label>
        <button onClick={() => { if (confirm("라인업을 초기화할까요?")) setSlots(defaultSlots()); }}>라인업 초기화</button>
      </div>
    </div>
  );
}
