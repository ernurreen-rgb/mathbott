"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getPresenceWsToken } from "@/lib/api";

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

function resolvePresenceWsBase(): string | null {
  const configuredBase = process.env.NEXT_PUBLIC_WS_API_URL?.trim();
  if (configuredBase && !configuredBase.startsWith("/")) {
    return configuredBase.replace(/^http/, "ws").replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = apiBase && !apiBase.startsWith("/")
    ? apiBase
    : typeof window !== "undefined"
      ? window.location.origin
      : "";
  if (!base) return null;
  return base.replace(/^http/, "ws").replace(/\/$/, "");
}

function presenceDisplayName(user: PresenceUser): string {
  return user.nickname || `Ойыншы #${user.id}`;
}

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<PresenceStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const email = session?.user?.email?.trim().toLowerCase() || "";

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !email) {
      setUsers([]);
      setStatus("disconnected");
      return;
    }

    let closed = false;
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

    const scheduleReconnect = () => {
      if (closed) return;
      const delayMs = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
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
      const wsBase = resolvePresenceWsBase();
      if (!wsBase || closed) {
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      const { data, error } = await getPresenceWsToken(email);
      if (closed) return;
      if (error || !data?.token) {
        setStatus("disconnected");
        scheduleReconnect();
        return;
      }

      const ws = new WebSocket(
        `${wsBase}/ws/presence?email=${encodeURIComponent(email)}&token=${encodeURIComponent(data.token)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        setStatus("connected");
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
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
        if (!closed) {
          setStatus("disconnected");
          scheduleReconnect();
        }
      };
    };

    void connect();

    return () => {
      closed = true;
      clearTimers();
      wsRef.current?.close();
      wsRef.current = null;
      setUsers([]);
      setStatus("disconnected");
    };
  }, [email, sessionStatus]);

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
      {sessionStatus === "authenticated" && email ? <PresenceFloatingPanel /> : null}
    </PresenceContext.Provider>
  );
}

function PresenceFloatingPanel() {
  const { users, status } = usePresence();
  const [open, setOpen] = useState(false);
  const isConnected = status === "connected";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="fixed right-3 top-3 z-[70] flex items-center gap-2 rounded-full border border-white/50 bg-white/85 px-3 py-2 text-sm font-semibold text-gray-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-gray-400"}`}
          aria-hidden="true"
        />
        <span>Онлайн {users.length}</span>
      </button>

      {open && (
        <div className="fixed right-3 top-14 z-[70] w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/50 bg-white/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="font-bold text-gray-900">Қазір онлайн</div>
            <div className="text-xs font-semibold text-gray-500">{status === "connecting" ? "Қосылуда" : "Live"}</div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {users.length > 0 ? (
              users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-800">
                    {presenceDisplayName(user)}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {status === "connecting" ? "Қосылуда..." : "Қазір ешкім жоқ"}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
