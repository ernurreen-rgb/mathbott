import { act, renderHook } from "@testing-library/react";
import { useQuizConnection } from "../use-quiz-connection";
import { getQuizWsToken } from "../api/quizzes";

jest.mock("../api/quizzes", () => ({ getQuizWsToken: jest.fn() }));
jest.mock("../websocket-url", () => ({ resolveWebSocketBase: () => "ws://localhost:8000" }));
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

it("reconnects with a fresh ticket and refreshes state after lost events", async () => {
  jest.useFakeTimers();
  const original = global.WebSocket;
  global.WebSocket = FakeSocket as unknown as typeof WebSocket;
  (getQuizWsToken as jest.Mock).mockResolvedValue({ data: { token: "ticket" }, error: null });
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
  global.WebSocket = original;
  jest.useRealTimers();
});
