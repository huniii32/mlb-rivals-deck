import { useEffect, useState } from "react";
import patchnotes from "../data/patchnotes.json";
import { getClientId, isRateLimited, isSupabaseOn, supabase, type PublicInquiry } from "../lib/supabase";

interface Inquiry {
  id: string;
  name: string;
  text: string;
  reply?: string;
  createdAt: number;
}

const INQ_KEY = "rivals-inquiries-v1";
const ADMIN_KEY = "rivals-admin-v1";

function loadInquiries(): Inquiry[] {
  try {
    const raw = localStorage.getItem(INQ_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as Inquiry[];
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    // 무시
  }
  return [];
}

/** 문의하기: Supabase 연동 시 전체 공개, 미연동 시 이 브라우저에만 저장 */
export function InquiryModal({ close }: { close: () => void }) {
  const remote = isSupabaseOn();
  const [items, setItems] = useState<Inquiry[]>(remote ? [] : loadInquiries);
  const [pubItems, setPubItems] = useState<PublicInquiry[]>([]);
  const [loading, setLoading] = useState(remote);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  // 관리자 모드: 비번은 이 브라우저 localStorage에만 보관. 남 화면엔 버튼 자체가 안 보임.
  const [admin, setAdmin] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ADMIN_KEY);
    } catch {
      return null;
    }
  });

  const loadPub = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inquiries")
        .select("id,name,body,reply,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setPubItems((data ?? []) as PublicInquiry[]);
    } catch {
      // 테이블 미생성 등 — 빈 목록 유지
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadPub();
    const sb = supabase;
    if (!sb) return;
    // 실시간 반영: 남이 글을 남기거나 관리자가 답변하면 자동 새로고침 (+30초 폴백 폴링)
    const ch = sb
      .channel("inquiries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, () => loadPub())
      .subscribe();
    const timer = setInterval(() => loadPub(), 30000);
    return () => {
      clearInterval(timer);
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (next: Inquiry[]) => {
    setItems(next);
    localStorage.setItem(INQ_KEY, JSON.stringify(next));
  };

  const rpcFail = () => {
    alert("관리자 인증 실패 — SQL 마이그레이션을 실행했는지, 비번이 맞는지 확인하세요.");
    setAdmin(null);
    try {
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      // 무시
    }
  };

  const unlock = async () => {
    if (!supabase) {
      alert("로컬 모드에서는 전부 내 글이라 관리 잠금이 필요 없습니다.");
      return;
    }
    const s = prompt("관리자 비번");
    if (!s) return;
    try {
      const { data, error } = await supabase.rpc("admin_check", { p_secret: s });
      if (error) throw error;
      if (!data) {
        alert("비번이 틀렸습니다.");
        return;
      }
      setAdmin(s);
      localStorage.setItem(ADMIN_KEY, s);
    } catch {
      alert("확인 실패 — 마이그레이션 SQL을 실행했는지 확인하세요.");
    }
  };

  const lock = () => {
    setAdmin(null);
    try {
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      // 무시
    }
  };

  const replyPub = async (it: PublicInquiry) => {
    if (!supabase || !admin) return;
    const r = prompt("답변 내용 (지우려면 비우기)", it.reply ?? "");
    if (r === null) return;
    try {
      const { data, error } = await supabase.rpc("admin_reply_inquiry", {
        p_id: it.id, p_secret: admin, p_reply: r,
      });
      if (error) throw error;
      if (!data) {
        rpcFail();
        return;
      }
      loadPub();
    } catch {
      rpcFail();
    }
  };

  const deletePub = async (id: string) => {
    if (!supabase || !admin) return;
    if (!confirm("이 문의를 삭제할까요?")) return;
    try {
      const { data, error } = await supabase.rpc("admin_delete_inquiry", {
        p_id: id, p_secret: admin,
      });
      if (error) throw error;
      if (!data) {
        rpcFail();
        return;
      }
      loadPub();
    } catch {
      rpcFail();
    }
  };

  const replyLocal = (it: Inquiry) => {
    const r = prompt("답변 내용 (지우려면 비우기)", it.reply ?? "");
    if (r === null) return;
    save(items.map((x) => (x.id === it.id ? { ...x, reply: r.trim() || undefined } : x)));
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) {
      alert("문의 내용을 입력하세요.");
      return;
    }
    if (remote && supabase) {
      try {
        const { error } = await supabase.rpc("insert_inquiry", {
          p_client_id: getClientId(),
          p_name: (name.trim() || "익명").slice(0, 20),
          p_body: t.slice(0, 2000),
        });
        if (error) throw error;
        setName("");
        setText("");
        loadPub();
        return;
      } catch (e) {
        if (isRateLimited(e)) alert("너무 자주 글을 남기고 있어요 — 잠시 후 다시 시도하세요.");
        else alert("등록 실패 — 마이그레이션 SQL(supabase_mig_rate_limit.sql)을 실행했는지 확인하세요.");
        return;
      }
    }
    const item: Inquiry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || "익명",
      text: t.slice(0, 2000),
      createdAt: Date.now(),
    };
    save([item, ...items]);
    setName("");
    setText("");
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>
              문의하기 ({remote ? pubItems.length : items.length})
            </h3>
            <span className="row">
              {remote && (admin ? (
                <button onClick={lock} title="관리자 모드 해제">🔓 관리중</button>
              ) : (
                <button onClick={unlock} title="관리자 로그인">관리</button>
              ))}
              <button onClick={close}>닫기 ✕</button>
            </span>
          </div>
          <p className="muted">
            {remote
              ? "전체 공개 문의판입니다. 누구나 읽을 수 있어요."
              : "Supabase 미연동 — 남긴 글은 이 브라우저에만 저장됩니다."}
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: 140 }}
              maxLength={20}
            />
            <input
              placeholder="문의 내용 (예: 덱코 계산이 이상해요)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <button className="primary" onClick={submit}>
              글 남기기
            </button>
          </div>
          {remote ? (
            loading ? (
              <p className="muted" style={{ marginTop: 12 }}>불러오는 중…</p>
            ) : pubItems.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                아직 문의가 없습니다. 첫 글을 남겨보세요.
              </p>
            ) : (
              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>이름</th>
                    <th>내용</th>
                    {admin && <th>관리</th>}
                  </tr>
                </thead>
                <tbody>
                  {pubItems.map((it) => (
                    <tr key={it.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(it.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{it.name}</td>
                      <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {it.body}
                        {it.reply && (
                          <div className="muted" style={{ marginTop: 6, borderLeft: "3px solid var(--accent)", paddingLeft: 8 }}>
                            ↳ 답변: {it.reply}
                          </div>
                        )}
                      </td>
                      {admin && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button onClick={() => replyPub(it)}>답변</button>{" "}
                          <button onClick={() => deletePub(it.id)}>삭제</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : items.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              아직 남긴 문의가 없습니다.
            </p>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>이름</th>
                  <th>내용</th>
                  <th></th>
                </tr>
              </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(it.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{it.name}</td>
                      <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {it.text}
                        {it.reply && (
                          <div className="muted" style={{ marginTop: 6, borderLeft: "3px solid var(--accent)", paddingLeft: 8 }}>
                            ↳ 답변: {it.reply}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => replyLocal(it)}>답변</button>{" "}
                        <button onClick={() => save(items.filter((x) => x.id !== it.id))}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** 공지사항: 이 페이지 패치 내역 */
export function PatchNotesModal({ close }: { close: () => void }) {
  const notes = patchnotes as {
    date: string;
    version: string;
    sections: { title: string; items: string[] }[];
  }[];
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>공지사항 · 패치 내역</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          <p className="muted">같은 날 여러 번 업데이트해도 버전은 하루에 하나입니다.</p>
          <div className="patchnotes">
            {notes.map((n) => (
              <div key={n.version} className="patchnote-day">
                <div className="patchnote-day-head">
                  <span className="pill">{n.version}</span>
                  <span className="muted">{n.date}</span>
                </div>
                {n.sections.map((s, i) => (
                  <div key={i} className="patchnote-section">
                    <div className="patchnote-section-title">{s.title}</div>
                    <ul>
                      {s.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 점수 산정 방식: 자동합·능력치·스킬점수·팀덱코/스덱코·덱 총점 공식 정리 */
export function ScoreGuideModal({ close }: { close: () => void }) {
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>점수 산정 방식</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          <p className="muted">엔진(engine.ts)이 실제로 계산하는 순서 그대로 정리했습니다.</p>

          <div className="formula">자동합 → 최종 스탯 → 능력치(J) + 스킬점수(O) = 최종점(P) → 덱 총점</div>

          <h4>① 선수 스탯 자동합</h4>
          <div className="formula">기본 + 훈련 + 특훈 + 초월 + 강화 + 포훈 + 포지션훈련 + 시너지 + 라커룸 + 스킬보너스(+3) + 덱코 보너스</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            <li>초월·강화는 <b>카드+스탯</b>으로, 포훈은 <b>포지션+스탯</b>으로 표를 조회해 자동으로 채워짐</li>
            <li><b>포지션훈련</b> 칸은 포훈Lv 자동값과 별개 — 게임 화면의 &ldquo;보너스&rdquo; 수치만 입력해야 정확함</li>
            <li>&ldquo;최종&rdquo; 칸에 직접 숫자를 적으면 자동합 대신 그 값으로 고정됨</li>
          </ul>

          <h4>② 능력치 (J)</h4>
          <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
            <div className="card" style={{ flex: 1, margin: 0 }}>
              <b>타자</b>
              <div className="formula">(파워+P보너스)×1.1 + (정확+A보너스)×0.9 + 선구×0.4</div>
              <p className="muted">P·A보너스 = 타자케미(S1→+2, S→+1) + WBC에이스타자(S2→+2, S1→+2/+1, S→+1)</p>
            </div>
            <div className="card" style={{ flex: 1, margin: 0 }}>
              <b>투수</b>
              <div className="formula">(변화+CHG)×1.15 + (구위+CTL)×1.2</div>
              <p className="muted">CHG·CTL = 커맨더·포수리드·투수케미·WBC에이스투수 등급별 가산</p>
            </div>
          </div>
          <p className="muted">케미 옵션은 덱 전체에 한 번만 지정하는 값이라 모든 타자/투수에게 동일하게 적용됩니다.</p>

          <h4>③ 스킬점수 (O)</h4>
          <div className="formula">스킬1 + 스킬2 + 스킬3 + (스킬4는 있으면만 가산)</div>
          <p className="muted">스킬 1~3 중 표에 없는 이름이 하나라도 있으면 O 전체가 &ldquo;표없음&rdquo;. 스킬4는 선택 사항.</p>

          <h4>④ 팀덱코 · 스덱코</h4>
          <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
            <div className="card" style={{ flex: 1, margin: 0 }}>
              <b>팀덱코</b> <span className="muted">— 전역 보너스</span>
              <p>다이아몬드 하나를 켜면 <b>라인업 전원</b>에게 같은 보너스가 붙습니다. (임계값 23단계, 200~600)</p>
            </div>
            <div className="card" style={{ flex: 1, margin: 0 }}>
              <b>스덱코</b> <span className="muted">— 포지션별 보너스</span>
              <p>포지션마다 조건·점수가 달라 <b>그 선수의 카드·타순·강화Lv·연도</b>에 따라 결과가 다릅니다. (임계값 29단계, 100~700)</p>
            </div>
          </div>
          <p>규칙 하나는 <code className="inline-code">[조건, 점수]</code> 목록을 위에서부터 검사해 <b>처음 참인 조건</b>의 점수만 채택합니다(첫 매치 우선). 스덱코 615·645·680은 다이아몬드 대신 <b>연도 입력칸</b>이 붙어, 선수 카드 연도가 입력 연도 기준 0~9년 이내면 보너스가 붙습니다.</p>

          <h4>⑤ 덱 총점</h4>
          <div className="formula">선발 = avg(SP1~5 중 이름있는 선수 P) × 10
계투 = avg(RP1~3, CP1 중 이름있는 선수 P) × 10
타자 = avg(9포지션 중 이름있는 선수 P) × 10

덱 총점 = 선발×0.4 + 계투×0.1 + 타자×0.5</div>

          <h4>주의사항</h4>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            <li>WBC에이스(타자) S1 등급은 파워엔 +2, 정확엔 +1로 비대칭 — 오타 아니고 원본 그대로</li>
            <li>스덱코 일부 규칙이 &ldquo;타순 1~2번&rdquo;·&ldquo;3~5번&rdquo; 조건을 봐서, 라인업 기본 타순(우익수 1번·지명타자 3번 등)에 따라 포지션별로 결과가 다르게 나오는 게 정상입니다</li>
            <li>새로 만든 덱은 원본 엑셀 저장값 그대로 팀덱코·스덱코 다이아몬드 50개가 이미 켜진 상태로 시작합니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
