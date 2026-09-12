import { act, renderHook } from "@testing-library/react";
import { useCoopAnswerSync } from "../use-coop-answer-sync";

jest.mock("@/lib/api/client", () => ({ apiPath: (path: string) => `/api/backend/${path}` }));

describe("cooperative HTTP answer persistence", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const ok = { ok: true, status: 200 } as Response;
  const advance = async (ms: number) => {
    await act(async () => { jest.advanceTimersByTime(ms); });
  };
  const answersAt = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body).answers;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset().mockResolvedValue(ok);
    global.fetch = fetchMock;
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("saves the latest edits over HTTP without a WebSocket", async () => {
    const { result, unmount } = renderHook(() => useCoopAnswerSync(7, "student@example.com"));
    act(() => {
      result.current.saveAnswer(1, "old");
      result.current.saveAnswer(1, "new");
      result.current.saveAnswer(2, "second");
    });
    expect(result.current.saveStatus).toBe("saving");
    await advance(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/trial-tests/coop/session/7/answers");
    expect(answersAt(0)).toEqual({ 1: "new", 2: "second" });
    expect(result.current.saveStatus).toBe("saved");
    unmount();
  });

  it("retries a failed batch without replacing newer local edits", async () => {
    let rejectSave!: (reason: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
    const { result, unmount } = renderHook(() => useCoopAnswerSync(7, "student@example.com"));
    act(() => result.current.saveAnswer(1, "old"));
    await advance(250);
    act(() => result.current.saveAnswer(1, "new"));
    await advance(250);
    await act(async () => rejectSave(new Error("offline")));
    expect(result.current.saveStatus).toBe("error");
    await advance(2000);
    expect(answersAt(1)).toEqual({ 1: "new" });
    expect(result.current.saveStatus).toBe("saved");
    unmount();
  });

  it("serializes a final navigation save after the in-flight write", async () => {
    let finishSave!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    const { result, unmount } = renderHook(() => useCoopAnswerSync(7, "student@example.com"));
    act(() => result.current.saveAnswer(1, "old"));
    await advance(250);
    act(() => result.current.saveAnswer(1, "new"));
    unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finishSave(ok));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(answersAt(1)).toEqual({ 1: "new" });
    expect(fetchMock.mock.calls[1][1].keepalive).toBe(true);
  });

  it("does not save without an authenticated identity", async () => {
    const { result, unmount } = renderHook(() => useCoopAnswerSync(7, null));
    act(() => result.current.saveAnswer(1, "answer"));
    await advance(500);
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });
});
