"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { getPresenceWsToken, heartbeatPresence } from "@/lib/api";
import { resolveWebSocketBase } from "@/lib/websocket-url";

export interface PresenceUser {
  id: number;
  nickname?: string | null;
}

const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_RESUME_GAP_MS = 15000;
const HEARTBEAT_IDLE_MS = 120000;

function isTabVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Keeps the student's online presence and page-visit telemetry up to date
 * without broadcasting unused global online-user state across the React tree.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname() || "/";
  const wsRef = useRef<WebSocket | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastSentPathRef = useRef<string>("");
  const pollingRefreshRef = useRef<((opts?: { force?: boolean }) => Promise<void>) | null>(null);
  const email = session?.user?.email?.trim().toLowerCase() || "";

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !email) {
      lastSentPathRef.current = "";
      pollingRefreshRef.current = null;
      return;
    }

    if (process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === "polling") {
      let disposed = false;
      let busy = false;
      let queuedForce = false;
      let inFlightPath = "";
      let lastBeatAt = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      lastInteractionAtRef.current = Date.now();

      const refresh = async (opts?: { force?: boolean }) => {
        if (disposed || !isTabVisible()) return;
        const path = pathnameRef.current || "/";
        const idle = Date.now() - lastInteractionAtRef.current > HEARTBEAT_IDLE_MS;
        if (!opts?.force && idle) return;
        if (busy) {
          if (opts?.force && path !== inFlightPath) queuedForce = true;
          return;
        }
        busy = true;
        inFlightPath = path;
        lastBeatAt = Date.now();
        try {
          const { error } = await heartbeatPresence(email, path);
          if (!disposed && !error) {
            lastSentPathRef.current = path;
          }
        } finally {
          busy = false;
          inFlightPath = "";
          if (!disposed && queuedForce) {
            queuedForce = false;
            void refresh({ force: true });
          }
        }
      };
      pollingRefreshRef.current = refresh;

      const stopPolling = () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const startPolling = () => {
        if (disposed || !isTabVisible()) return;
        lastInteractionAtRef.current = Date.now();
        if (lastBeatAt === 0 || Date.now() - lastBeatAt >= HEARTBEAT_RESUME_GAP_MS) {
          void refresh({ force: true });
        }
        if (!timer) {
          timer = setInterval(() => void refresh(), HEARTBEAT_INTERVAL_MS);
        }
      };

      const markInteraction = () => {
        const wasIdle = Date.now() - lastInteractionAtRef.current > HEARTBEAT_IDLE_MS;
        lastInteractionAtRef.current = Date.now();
        if (wasIdle && isTabVisible() && Date.now() - lastBeatAt >= HEARTBEAT_RESUME_GAP_MS) {
          void refresh({ force: true });
        }
      };

      const onVisibilityChange = () => {
        if (isTabVisible()) {
          startPolling();
        } else {
          stopPolling();
        }
      };

      const interactionEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
      interactionEvents.forEach((eventName) => {
        window.addEventListener(eventName, markInteraction, { passive: true });
      });
      document.addEventListener("visibilitychange", onVisibilityChange);
      startPolling();

      return () => {
        disposed = true;
        pollingRefreshRef.current = null;
        interactionEvents.forEach((eventName) => {
          window.removeEventListener(eventName, markInteraction);
        });
        document.removeEventListener("visibilitychange", onVisibilityChange);
        stopPolling();
      };
    }

    let closed = false;
    let generation = 0;
    let connecting = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const disconnect = () => {
      generation += 1;
      connecting = false;
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
      }
    };

    const scheduleReconnect = () => {
      if (closed || !isTabVisible() || reconnectTimer) return;
      const delayMs = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delayMs);
    };

    const sendVisit = async (opts?: { force?: boolean }) => {
      if (closed || !isTabVisible()) return;
      const currentPath = pathnameRef.current || "/";
      if (!opts?.force && currentPath === lastSentPathRef.current) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "visit", path: currentPath }));
          lastSentPathRef.current = currentPath;
          return;
        } catch {
          // Fall back to HTTP heartbeat below if sending on the socket fails.
        }
      }
      // Fallback so route visits are still persisted while WS is connecting or unavailable (H-31).
      const { error } = await heartbeatPresence(email, currentPath);
      if (!closed && !error) {
        lastSentPathRef.current = currentPath;
      }
    };
    pollingRefreshRef.current = sendVisit;

    const connect = async () => {
      const wsBase = resolveWebSocketBase();
      if (!wsBase) {
        void sendVisit({ force: true });
        return;
      }
      if (closed || !isTabVisible() || connecting || wsRef.current) {
        return;
      }

      connecting = true;
      const attempt = generation;
      let token = "";
      try {
        const { data, error } = await getPresenceWsToken(email);
        if (closed || attempt !== generation || !isTabVisible()) return;
        if (error || !data?.token) {
          scheduleReconnect();
          return;
        }
        token = data.token;
      } finally {
        if (attempt === generation) connecting = false;
      }

      const initialPath = pathnameRef.current || "/";
      const ws = new WebSocket(
        `${wsBase}/ws/presence?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&path=${encodeURIComponent(initialPath)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed || attempt !== generation) {
          ws.close();
          return;
        }
        reconnectAttempts = 0;
        lastSentPathRef.current = initialPath;
        const latestPath = pathnameRef.current || "/";
        if (latestPath !== initialPath) {
          void sendVisit({ force: true });
        }
        pingTimer = setInterval(() => {
          if (isTabVisible() && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", path: pathnameRef.current || "/" }));
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closed && attempt === generation) {
          scheduleReconnect();
        }
      };
    };

    const onVisibilityChange = () => {
      if (isTabVisible()) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        reconnectAttempts = 0;
        void connect();
      } else {
        disconnect();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void connect();

    return () => {
      closed = true;
      pollingRefreshRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disconnect();
    };
  }, [email, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !email || !isTabVisible()) return;
    lastInteractionAtRef.current = Date.now();
    if (pathname !== lastSentPathRef.current) {
      void pollingRefreshRef.current?.({ force: true });
    }
  }, [email, pathname, sessionStatus]);

  return <>{children}</>;
}
