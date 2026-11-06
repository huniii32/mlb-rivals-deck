import { useEffect, useRef, type ReactNode } from "react";

export function RenewalDialog({
  title,
  close,
  children,
  player = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  player?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={player ? "player-dialog" : "wide-dialog"}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-header">
        <div>
          <div className="eyebrow">MY CLUB SETTINGS</div>
          <h2>{title}</h2>
        </div>
        <button aria-label="닫기" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
