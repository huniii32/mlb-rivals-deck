import { useEffect, useState } from "react";
import { newId } from "../lib/deck";
import { errMessage, getClientId, isMissingRpc, isRateLimited, isSupabaseOn, MAX_BODY, MAX_NAME, supabase, watchTable, type PublicInquiry } from "../lib/supabase";

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
    // 실시간 반영: 남이 글을 남기거나 관리자가 답변하면 자동 새로고침
    return watchTable("inquiries", loadPub);
  }, []);

  const save = (next: Inquiry[]) => {
    setItems(next);
    localStorage.setItem(INQ_KEY, JSON.stringify(next));
  };

  const lock = () => {
    setAdmin(null);
    try {
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      // 무시
    }
  };

  const rpcFail = () => {
    alert("관리자 인증 실패 — SQL 마이그레이션을 실행했는지, 비번이 맞는지 확인하세요.");
    lock();
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

  // 관리자 RPC 공통: 실패/거부면 인증 실패 처리, 성공이면 목록 새로고침
  const adminRpc = async (fn: string, args: Record<string, unknown>) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc(fn, { ...args, p_secret: admin });
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

  const replyPub = (it: PublicInquiry) => {
    if (!supabase || !admin) return;
    const r = prompt("답변 내용 (지우려면 비우기)", it.reply ?? "");
    if (r === null) return;
    adminRpc("admin_reply_inquiry", { p_id: it.id, p_reply: r });
  };

  const deletePub = (id: string) => {
    if (!supabase || !admin) return;
    if (!confirm("이 문의를 삭제할까요?")) return;
    adminRpc("admin_delete_inquiry", { p_id: id });
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
          p_name: (name.trim() || "익명").slice(0, MAX_NAME),
          p_body: t.slice(0, MAX_BODY),
        });
        if (error) throw error;
        setName("");
        setText("");
        loadPub();
        return;
      } catch (e) {
        console.error(e);
        if (isRateLimited(e)) alert("너무 자주 글을 남기고 있어요 — 잠시 후 다시 시도하세요.");
        else if (isMissingRpc(e)) alert("등록 실패 — 마이그레이션 SQL(supabase_mig_rate_limit.sql)을 실행했는지 확인하세요.");
        else alert(`등록 실패: ${errMessage(e)}`);
        return;
      }
    }
    const item: Inquiry = {
      id: newId(),
      name: name.trim() || "익명",
      text: t.slice(0, MAX_BODY),
      createdAt: Date.now(),
    };
    save([item, ...items]);
    setName("");
    setText("");
  };

  // 원격/로컬을 같은 행 형태로 맞춰 표 하나로 렌더
  const rows = remote
    ? pubItems.map((it) => ({
        id: it.id, date: it.created_at, name: it.name, text: it.body, reply: it.reply,
        onReply: () => replyPub(it), onDelete: () => deletePub(it.id),
      }))
    : items.map((it) => ({
        id: it.id, date: it.createdAt, name: it.name, text: it.text, reply: it.reply,
        onReply: () => replyLocal(it), onDelete: () => save(items.filter((x) => x.id !== it.id)),
      }));
  const manage = !remote || !!admin; // 로컬은 전부 내 글이라 항상 관리 가능

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
              maxLength={MAX_NAME}
            />
            <input
              placeholder="문의 내용 (예: 덱코 계산이 이상해요)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              maxLength={MAX_BODY}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <button className="primary" onClick={submit}>
              글 남기기
            </button>
          </div>
          {remote && loading ? (
            <p className="muted" style={{ marginTop: 12 }}>불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              {remote ? "아직 문의가 없습니다. 첫 글을 남겨보세요." : "아직 남긴 문의가 없습니다."}
            </p>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>이름</th>
                  <th>내용</th>
                  {manage && <th>{remote && "관리"}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(it.date).toLocaleDateString("ko-KR")}
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
                    {manage && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={it.onReply}>답변</button>{" "}
                        <button onClick={it.onDelete}>삭제</button>
                      </td>
                    )}
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
