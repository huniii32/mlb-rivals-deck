import { useEffect, useRef, useState } from "react";

const NEW_SITE = "https://mlb-rivals-deck.pages.dev/";
const DISMISSED_KEY = "rivals-site-move-20261106";

function isPreviousSite() {
  return window.location.hostname === "huniii32.github.io"
    && /^\/mlb-rivals-deck(?:\/|$)/.test(window.location.pathname);
}

function shouldOpen() {
  if (!isPreviousSite()) return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== "hidden"
      && sessionStorage.getItem(DISMISSED_KEY) !== "seen";
  } catch { return true; }
}

/** Old-origin notice only; never redirects, transfers data or writes to rankings. */
export function SiteMoveNotice({ backup, count }: { backup?: () => void; count: number }) {
  const [open, setOpen] = useState(shouldOpen);
  const [hideNextTime, setHideNextTime] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    return () => element.close();
  }, [open]);

  if (!isPreviousSite()) return null;

  const close = () => {
    try { sessionStorage.setItem(DISMISSED_KEY, "seen"); } catch { /* Still close in this view. */ }
    if (hideNextTime) {
      try { localStorage.setItem(DISMISSED_KEY, "hidden"); } catch { /* Banner remains available. */ }
    }
    setOpen(false);
  };

  return <>
    <aside className="site-move-banner" aria-label="사이트 이전 안내">
      <span><strong>새 주소로 이전했습니다</strong><span className="muted"> · 덱을 옮긴 뒤 새 사이트를 이용해주세요.</span></span>
      <button onClick={() => setOpen(true)}>이전 안내 보기</button>
    </aside>
    {open && <dialog ref={dialog} className="site-move-dialog" aria-labelledby="site-move-title"
      aria-describedby="site-move-description" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)'));
        const first = items[0], last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="site-move-heading">
        <span className="pill">사이트 주소 변경</span>
        <button autoFocus onClick={close} aria-label="사이트 이전 안내 닫기">닫기 ✕</button>
      </div>
      <h2 id="site-move-title">덱관리, 새 주소에서 만나요</h2>
      <p id="site-move-description">앞으로 덱관리와 시뮬레이터는 새 사이트를 이용해주세요.</p>
      <a className="site-move-address" href={NEW_SITE} target="_blank" rel="noopener noreferrer">mlb-rivals-deck.pages.dev ↗</a>
      <div className="site-move-transfer">
        <h3>내 덱은 한 번 옮겨주세요</h3>
        <p>새 주소에는 내 덱이 자동으로 나타나지 않습니다. 기존 덱은 이 주소에 그대로 남아 있습니다.</p>
        <ol>
          <li>최신 덱이 있는 기기에서 <strong>전체 덱 백업</strong>을 받으세요.</li>
          <li>새 사이트의 <strong>덱 도구 → 파일 불러오기</strong>에서 백업 파일을 선택하세요.</li>
          <li>선수와 점수를 확인한 뒤 <strong>새 사이트에서 수정·저장</strong>하세요.</li>
        </ol>
        {backup && <button onClick={backup}>전체 덱 {count}개 백업하기</button>}
        {!backup && <p className="muted">이 기기에 이름을 정해 저장한 덱이 없습니다. 이전할 덱이 있다면 먼저 이름을 정해 저장해주세요.</p>}
        <p className="muted">백업 파일에는 랭킹 수정 권한이 포함될 수 있으니 본인만 보관해주세요.</p>
      </div>
      <p><strong>랭킹에 등록한 최신 덱</strong>은 새 사이트의 <strong>덱랭킹 → 가져오기</strong>에서 등록 비밀번호로 가져올 수도 있습니다.</p>
      <p className="muted">시뮬레이터 기록·화면 설정·수정한 스킬 점수표는 덱 백업에 포함되지 않습니다. 기존 주소에서 계속 확인할 수 있습니다.</p>
      <label className="site-move-dismiss"><input type="checkbox" checked={hideNextTime} onChange={(e) => setHideNextTime(e.target.checked)} />이 기기에서 팝업 다시 보지 않기</label>
      <div className="site-move-actions">
        <button onClick={close}>기존 사이트에서 계속하기</button>
        <a className="site-move-primary" href={NEW_SITE} target="_blank" rel="noopener noreferrer">새 사이트 열기 ↗</a>
      </div>
      <p className="muted site-move-footnote">새 사이트는 새 탭으로 열립니다. 이 페이지에서 백업을 마칠 수 있습니다.</p>
    </dialog>}
  </>;
}
