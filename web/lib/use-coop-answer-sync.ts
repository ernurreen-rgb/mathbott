"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPath } from "@/lib/api/client";

type Answers = Record<number, string>;
type SaveStatus = "saved" | "saving" | "error";

export function useCoopAnswerSync(sessionId: number, email: string | null) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const enqueueRef = useRef<(taskId: number, answer: string) => void>(() => {});
  useEffect(() => {
    if (!email || !sessionId) return;
    let pending: Answers = {};
    let sending: Answers = {};
    let busy = false;
    let disposed = false;
    let leaving = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = apiPath(`trial-tests/coop/session/${sessionId}/answers`);
    const save = async (answers: Answers, keepalive = false) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { method: "PUT", keepalive, signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, answers }) });
        if (!response.ok) throw new Error(`Answer save failed: ${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    };
    const flush = async () => {
      if ((disposed && !leaving) || busy || !Object.keys(pending).length) return;
      busy = true;
      sending = pending;
      pending = {};
      let retryDelay = 0;
      try {
        await save(sending, leaving);
        if (!disposed) setSaveStatus(Object.keys(pending).length ? "saving" : "saved");
      } catch {
        // Preserve newer edits when retrying a failed older batch.
        pending = { ...sending, ...pending };
        retryDelay = 2000;
        if (!disposed) setSaveStatus("error");
      } finally {
        busy = false;
        sending = {};
        if (Object.keys(pending).length) {
          if (leaving && !retryDelay) void flush();
          else if (!disposed && !leaving) timer = setTimeout(() => void flush(), retryDelay);
        }
      }
    };
    enqueueRef.current = (taskId, answer) => {
      pending[taskId] = answer;
      setSaveStatus("saving");
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 250);
    };
    const pagehide = () => {
      leaving = true;
      clearTimeout(timer);
      // Keep request order: an older in-flight write must finish first.
      void flush();
    };
    window.addEventListener("pagehide", pagehide);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("pagehide", pagehide);
      // Finish submits the complete answer map itself. Other navigation gets
      // a best-effort final save, serialized after any in-flight request.
      pagehide();
      enqueueRef.current = () => {};
    };
  }, [email, sessionId]);
  const saveAnswer = useCallback((taskId: number, answer: string) => enqueueRef.current(taskId, answer), []);
  return { saveAnswer, saveStatus };
}
