import { resolveWebSocketBase } from "../websocket-url";

const originalApi = process.env.NEXT_PUBLIC_API_URL;
const originalWs = process.env.NEXT_PUBLIC_WS_API_URL;
afterEach(() => {
  if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApi;
  if (originalWs === undefined) delete process.env.NEXT_PUBLIC_WS_API_URL;
  else process.env.NEXT_PUBLIC_WS_API_URL = originalWs;
});

it("uses the site origin when HTTP uses the authenticated relative proxy", () => {
  process.env.NEXT_PUBLIC_API_URL = "/api/backend";
  delete process.env.NEXT_PUBLIC_WS_API_URL;
  expect(resolveWebSocketBase()).toBe(window.location.origin.replace(/^http/, "ws"));
});

it("supports an explicit TLS backend for a separately hosted frontend", () => {
  process.env.NEXT_PUBLIC_API_URL = "/api/backend";
  process.env.NEXT_PUBLIC_WS_API_URL = "https://backend.example.com/";
  expect(resolveWebSocketBase()).toBe("wss://backend.example.com");
});
