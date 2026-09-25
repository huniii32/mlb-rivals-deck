import patchnotes from "../data/patchnotes.json";
import { Modal } from "./Modal";

/** 공지사항: 이 페이지 패치 내역 (버전별 접기/펼치기, 최신 버전만 펼쳐서 시작) */
export function PatchNotesModal({ close }: { close: () => void }) {
  const notes = patchnotes as {
    date: string;
    version: string;
    sections: { title: string; items: string[] }[];
  }[];
  return (
    <Modal title="공지사항 · 패치 내역" close={close}>
      <p className="muted">같은 날 여러 번 업데이트해도 버전은 하루에 하나입니다. 버전을 눌러 펼치거나 접을 수 있어요.</p>
      <div className="patchnotes">
        {notes.map((n, i) => (
          <details key={n.version} className="patchnote-day" open={i === 0}>
            <summary className="patchnote-day-head">
              <span className="pill">{n.version}</span>
              <span className="muted">{n.date}</span>
              <span className="patchnote-brief muted">{n.sections.map((s) => s.title).join(" · ")}</span>
            </summary>
            {n.sections.map((s, j) => (
              <div key={j} className="patchnote-section">
                <div className="patchnote-section-title">{s.title}</div>
                <ul>
                  {s.items.map((it, k) => (
                    <li key={k}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        ))}
      </div>
    </Modal>
  );
}
