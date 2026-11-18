"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { getPresenceWsToken, heartbeatPresence } from "@/lib/api";
import { resolveWebSocketBase } from "@/lib/websocket-url";

type PresenceStatus = "connecting" | "connected" | "disconnected";

export interface PresenceUser {
  id: number;
  nickname?: string | null;
}

interface PresenceContextValue {
  users: PresenceUser[];
  onlineIds: Set<number>;
  status: PresenceStatus;
  isOnline: (userId: number | null | undefined) => boolean;
}

const PresenceContext = createContext<PresenceContextValue>({
  users: [],
  onlineIds: new Set<number>(),
  status: "disconnected",
  isOnline: () => false,
});

function normalizePresenceUser(value: unknown): PresenceUser | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { id?: unknown; nickname?: unknown };
  const id = Number(candidate.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    nickname: typeof candidate.nickname === "string" && candidate.nickname.trim()
      ? candidate.nickname.trim()
      : null,
  };
}

function sortPresenceUsers(users: PresenceUser[]): PresenceUser[] {
  return [...users].sort((a, b) => {
    const aName = presenceDisplayName(a).toLowerCase();
    const bName = presenceDisplayName(b).toLowerCase();
    return aName.localeCompare(bName) || a.id - b.id;
  });
}

function upsertPresenceUser(users: PresenceUser[], nextUser: PresenceUser): PresenceUser[] {
  const byId = new Map(users.map((user) => [user.id, user]));
  byId.set(nextUser.id, nextUser);
  return sortPresenceUsers(Array.from(byId.values()));
}

function presenceDisplayName(user: PresenceUser): string {
  return user.nickname || `Ойыншы #${user.id}`;
}


const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_RESUME_GAP_MS = 15000;
const HEARTBEAT_IDLE_MS = 120000;

function isTabVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname() || "/";
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<PresenceStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastSentPathRef = useRef<string>("");
  const pollingRefreshRef = useRef<((opts?: { force?: boolean }) => Promise<void>) | null>(null);
  const email = session?.user?.email?.trim().toLowerCase() || "";

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !email) {
      setUsers([]);
      setStatus("disconnected");
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
          const { data, error } = await heartbeatPresence(email, path);
          if (disposed) return;
          if (error || !data) setStatus("disconnected");
          else {
            lastSentPathRef.current = path;
            setUsers(sortPresenceUsers(data.users.map(normalizePresenceUser).filter(Boolean) as PresenceUser[]));
            setStatus("connected");
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
          setStatus((prev) => (prev === "connected" ? prev : "connecting"));
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
      setStatus("disconnected");
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

    const applyMessage = (payload: any) => {
      if (payload?.type === "presence_snapshot" && Array.isArray(payload.users)) {
        setUsers(sortPresenceUsers(payload.users.map(normalizePresenceUser).filter(Boolean) as PresenceUser[]));
        return;
      }

      if (payload?.type === "presence_update") {
        const user = normalizePresenceUser(payload.user);
        if (!user) return;
        if (payload.status === "online") {
          setUsers((prev) => upsertPresenceUser(prev, user));
        } else if (payload.status === "offline") {
          setUsers((prev) => prev.filter((item) => item.id !== user.id));
        }
      }
    };

    const connect = async () => {
      const wsBase = resolveWebSocketBase();
      if (!wsBase || closed || !isTabVisible() || connecting || wsRef.current) {
        if (!wsBase) setStatus("disconnected");
        return;
      }

      connecting = true;
      const attempt = generation;
      setStatus("connecting");
      let token = "";
      try {
        const { data, error } = await getPresenceWsToken(email);
        if (closed || attempt !== generation || !isTabVisible()) return;
        if (error || !data?.token) {
          setStatus("disconnected");
          scheduleReconnect();
          return;
        }
        token = data.token;
      } finally {
        if (attempt === generation) connecting = false;
      }

      const ws = new WebSocket(
        `${wsBase}/ws/presence?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed || attempt !== generation) {
          ws.close();
          return;
        }
        reconnectAttempts = 0;
        setStatus("connected");
        pingTimer = setInterval(() => {
          if (isTabVisible() && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          applyMessage(JSON.parse(event.data));
        } catch {
          return;
        }
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
          setStatus("disconnected");
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disconnect();
      setUsers([]);
    };
  }, [email, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !email || !isTabVisible()) return;
    lastInteractionAtRef.current = Date.now();
    if (pathname !== lastSentPathRef.current) {
      void pollingRefreshRef.current?.({ force: true });
    }
  }, [email, pathname, sessionStatus]);

  const value = useMemo<PresenceContextValue>(() => {
    const onlineIds = new Set(users.map((user) => user.id));
    return {
      users,
      onlineIds,
      status,
      isOnline: (userId) => typeof userId === "number" && onlineIds.has(userId),
    };
  }, [status, users]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}
