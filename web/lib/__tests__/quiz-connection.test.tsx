import { act, renderHook } from "@testing-library/react";
import { useQuizConnection } from "../use-quiz-connection";
import { getQuizWsToken } from "../api/quizzes";
import { resolveWebSocketBase } from "../websocket-url";

jest.mock("../api/quizzes", () => ({ getQuizWsToken: jest.fn() }));
jest.mock("../websocket-url", () => ({ resolveWebSocketBase: jest.fn() }));
const sockets: FakeSocket[] = [];
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = jest.fn();
  close = jest.fn(() => this.onclose?.());
  constructor(public url: string) { sockets.push(this); }
}

const originalSocket = global.WebSocket;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  sockets.length = 0;
  global.WebSocket = FakeSocket as unknown as typeof WebSocket;
  (resolveWebSocketBase as jest.Mock).mockReturnValue("ws://localhost:8000");
  (getQuizWsToken as jest.Mock).mockResolvedValue({ data: { token: "ticket" }, error: null });
});
afterEach(() => {
  global.WebSocket = originalSocket;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("reconnects with a fresh ticket and refreshes state after lost events", async () => {
  const refresh = jest.fn();
  const view = renderHook(() => useQuizConnection(1, { participantToken: "secret" }, refresh));
  await act(async () => {});
  expect(sockets).toHaveLength(1);
  expect(sockets[0].url).toContain("?token=ticket");
  act(() => sockets[0].onclose?.());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(sockets).toHaveLength(2);
  expect(getQuizWsToken).toHaveBeenLastCalledWith(1, { participantToken: "secret" });
  act(() => sockets[1].onopen?.());
  act(() => sockets[1].onmessage?.({ data: JSON.stringify({ type: "game_finished" }) }));
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(refresh.mock.calls.length).toBeGreaterThan(2);
  view.unmount();
  const connectionCount = sockets.length;
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(sockets).toHaveLength(connectionCount);
});

it("pauses polling in hidden tabs, resumes immediately and stops when disabled", async () => {
  (resolveWebSocketBase as jest.Mock).mockReturnValue(null);
  const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const refresh = jest.fn();
  const view = renderHook(({ enabled }) => useQuizConnection(1, { participantToken: "secret" }, refresh, enabled),
    { initialProps: { enabled: true } });
  act(() => { jest.advanceTimersByTime(4000); });
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => {
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(60000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => {
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  view.rerender({ enabled: false });
  act(() => { jest.advanceTimersByTime(60000); document.dispatchEvent(new Event("visibilitychange")); });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(getQuizWsToken).not.toHaveBeenCalled();
  view.unmount();
});

it("closes hidden sockets and gets a new ticket only when the tab becomes visible", async () => {
  const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const refresh = jest.fn();
  const view = renderHook(() => useQuizConnection(1, { participantToken: "secret" }, refresh));
  await act(async () => {});
  act(() => {
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(60000);
  });
  expect(sockets[0].close).toHaveBeenCalledTimes(1);
  expect(sockets[0].send).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(getQuizWsToken).toHaveBeenCalledTimes(1);
  await act(async () => {
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(getQuizWsToken).toHaveBeenCalledTimes(2);
  expect(sockets).toHaveLength(2);
  expect(refresh).toHaveBeenCalledTimes(1);
  view.unmount();
});
