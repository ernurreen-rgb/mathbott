export function resolveWebSocketBase(): string | null {
  const configured = process.env.NEXT_PUBLIC_WS_API_URL?.trim();
  const api = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = configured && !configured.startsWith("/") ? configured
    : api && !api.startsWith("/") ? api
    : typeof window !== "undefined" ? window.location.origin : "";
  return base ? base.replace(/^http/, "ws").replace(/\/$/, "") : null;
}
