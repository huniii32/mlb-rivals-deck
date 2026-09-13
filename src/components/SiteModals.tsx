import { useState } from "react";
import patchnotes from "../data/patchnotes.json";

interface Inquiry {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

const INQ_KEY = "rivals-inquiries-v1";

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

/** 문의하기: 백엔드 없이 이 브라우저 localStorage에 저장되는 간단 메모판 */
export function InquiryModal({ close }: { close: () => void }) {
  const [items, setItems] = useState<Inquiry[]>(loadInquiries);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const save = (next: Inquiry[]) => {
    setItems(next);
    localStorage.setItem(INQ_KEY, JSON.stringify(next));
  };

  const submit = () => {
    const t = text.trim();
    if (!t) {
      alert("문의 내용을 입력하세요.");
      return;
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
            <h3 style={{ margin: 0 }}>문의하기 ({items.length})</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          <p className="muted">
            남긴 글은 이 브라우저에만 저장됩니다. 정식 공개 문의판(서버 저장)은 백엔드가 붙으면 옮길 예정.
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
          {items.length === 0 ? (
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
                    <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{it.text}</td>
                    <td>
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
    title: string;
    items: string[];
  }[];
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>공지사항 · 패치 내역</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          {notes.map((n) => (
            <div key={n.version} style={{ marginTop: 14 }}>
              <b>
                {n.version} · {n.title}
              </b>{" "}
              <span className="muted">{n.date}</span>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {n.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
