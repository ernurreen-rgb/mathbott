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
    const base = resolveWebSocketBase();
    const retry = () => {
      if (disposed) return;
      reconnect = setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, 10000);
    };
    const connect = async () => {
      if (!base || disposed) return;
      try {
        const result = await getQuizWsToken(sessionId, auth);
        if (disposed) return;
        if (!result.data?.token) { retry(); return; }
        socket = new WebSocket(`${base}/ws/quiz/${sessionId}?token=${encodeURIComponent(result.data.token)}`);
        socket.onopen = () => { backoff = 1000; refreshRef.current(); };
        socket.onmessage = (event) => {
          try {
            if (JSON.parse(event.data).type !== "pong") refreshRef.current();
          } catch { /* Ignore malformed notifications; polling still recovers state. */ }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = retry;
      } catch { retry(); }
    };
    void connect();
    const polling = setInterval(() => refreshRef.current(), 4000);
    const ping = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearInterval(polling);
      clearInterval(ping);
      socket?.close();
    };
    // Auth primitives prevent reconnecting just because the component rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, auth.email, auth.participantToken, enabled]);
}
