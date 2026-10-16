"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "../CmsWorkspace.module.css";

type Props = { open: boolean; title: string; description?: string; error?: string | null; onClose: () => void; children: ReactNode };

export default function CmsDialog({ open, title, description, error, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles.dialogHeader}>
        <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        <button type="button" className={styles.secondaryButton} aria-label="Терезені жабу" onClick={onClose}>✕</button>
      </div>
      <div className={styles.dialogBody}>
        {error && <div role="alert" className={styles.error}>{error}</div>}
        {children}
      </div>
    </dialog>
  );
}
