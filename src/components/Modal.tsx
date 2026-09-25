import type { ReactNode } from "react";

/** 사이트 공용 모달: 오버레이(바깥 클릭 닫기) + 카드 + 제목/닫기 헤더. */
export function Modal({ title, close, width, children }: {
  title?: ReactNode; close: () => void; width?: string; children: ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <button onClick={close}>닫기 ✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
