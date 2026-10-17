"use client";
import { useEffect, useRef } from "react";
import { getQuizWsToken } from "@/lib/api/quizzes";
import { resolveWebSocketBase } from "@/lib/websocket-url";
import type { QuizAuth } from "@/types/quiz";

/** Events are hints; HTTP state repairs missed events, restarts and reconnects. */
export function useQuizConnection(sessionId: number, auth: QuizAuth, refresh: () => void, enabled = true) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled || !sessionId) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;
    let connecting = false;
    let generation = 0;
    const base = resolveWebSocketBase();
    const visible = () => document.visibilityState !== "hidden";
    const retry = () => {
      if (disposed || !visible()) return;
      clearTimeout(reconnect);
      reconnect = setTimeout(() => { reconnect = undefined; void connect(); }, backoff);
      backoff = Math.min(backoff * 2, 10000);
    };
    const connect = async () => {
      if (!base || disposed || !visible() || connecting || socket) return;
      connecting = true;
      const attempt = generation;
      try {
        const result = await getQuizWsToken(sessionId, auth);
        if (disposed || attempt !== generation || !visible()) return;
        if (!result.data?.token) { retry(); return; }
        socket = new WebSocket(`${base}/ws/quiz/${sessionId}?token=${encodeURIComponent(result.data.token)}`);
        socket.onopen = () => { backoff = 1000; if (visible()) refreshRef.current(); };
        socket.onmessage = (event) => {
          try {
            if (visible() && JSON.parse(event.data).type !== "pong") refreshRef.current();
          } catch { /* Ignore malformed notifications; polling still recovers state. */ }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => { socket = null; retry(); };
      } catch { retry(); }
      finally { if (attempt === generation) connecting = false; }
    };
    const disconnect = () => {
      generation += 1;
      connecting = false;
      clearTimeout(reconnect);
      reconnect = undefined;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
        socket = null;
      }
    };
    const visibilityChanged = () => {
      if (!visible()) disconnect();
      else { refreshRef.current(); void connect(); }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    void connect();
    const polling = setInterval(() => { if (visible()) refreshRef.current(); }, 4000);
    const ping = setInterval(() => {
      if (visible() && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      clearInterval(polling);
      clearInterval(ping);
      disconnect();
    };
    // Auth primitives prevent reconnecting just because the component rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, auth.email, auth.participantToken, enabled]);
}
