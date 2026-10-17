"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "../CmsWorkspace.module.css";

type Props = { open: boolean; title: string; description?: string; error?: string | null; onClose: () => void; children: ReactNode };

type DialogMathKeyboard = EventTarget & {
  container: HTMLElement | null;
  boundingRect: DOMRect;
  hide: () => void;
};

export default function CmsDialog({ open, title, description, error, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const keyboardContainerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const keyboardContainer = keyboardContainerRef.current;
    let disposed = false;
    let keyboard: DialogMathKeyboard | undefined;
    const updateKeyboardHeight = () => {
      const height = keyboard?.container === keyboardContainer ? keyboard.boundingRect.height : 0;
      dialog.style.setProperty("--cms-keyboard-height", `${height}px`);
    };
    // MathLive loads lazily, including when the first math field is in this dialog.
    void import("mathlive").then(() => {
      if (disposed) return;
      keyboard = (globalThis as { mathVirtualKeyboard?: DialogMathKeyboard }).mathVirtualKeyboard;
      keyboard?.addEventListener("geometrychange", updateKeyboardHeight);
      updateKeyboardHeight();
    });
    const previousFocus = document.activeElement;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      disposed = true;
      keyboard?.removeEventListener("geometrychange", updateKeyboardHeight);
      if (keyboard && keyboard.container === keyboardContainer) {
        keyboard.hide();
        keyboard.container = document.body;
      }
      dialog.style.removeProperty("--cms-keyboard-height");
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
      <div ref={keyboardContainerRef} className={styles.mathKeyboard} data-math-virtual-keyboard-container="" />
    </dialog>
  );
}
