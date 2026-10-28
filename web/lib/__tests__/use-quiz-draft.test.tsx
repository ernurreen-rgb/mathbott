import { StrictMode, useState, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { quizDraftKey, useQuizDraft } from "../use-quiz-draft";

type Draft = { text: string };
const valid = (value: unknown): value is Draft => typeof (value as Draft)?.text === "string";
function useDraft(email = "owner@example.com", quizId?: number) {
  const [value, setValue] = useState({ text: "" });
  const save = useQuizDraft(quizDraftKey(email, quizId), value, setValue, valid);
  return { value, setValue, ...save };
}
beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); });

it("saves partial work and restores it after remount, including Strict Mode", () => {
  const first = renderHook(() => useDraft());
  act(() => first.result.current.setValue({ text: String.raw`Есеп \frac12` }));
  act(() => jest.advanceTimersByTime(600));
  expect(first.result.current.status).toBe("saved");
  first.unmount();
  const second = renderHook(() => useDraft(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
  expect(second.result.current.value.text).toBe(String.raw`Есеп \frac12`);
  expect(second.result.current.restored).toBe(true);
});

it("flushes pending changes on pagehide and does not recreate a draft after successful save", () => {
  const view = renderHook(() => useDraft());
  act(() => view.result.current.setValue({ text: "Last edit" }));
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(JSON.parse(localStorage.getItem(quizDraftKey("owner@example.com"))!).value.text).toBe("Last edit");
  act(() => view.result.current.clear());
  view.unmount();
  expect(localStorage.getItem(quizDraftKey("owner@example.com"))).toBeNull();
});

it("isolates different quizzes and accounts and tolerates corrupt storage", () => {
  localStorage.setItem(quizDraftKey("owner@example.com", 1), "{bad-json");
  const view = renderHook(() => useDraft("owner@example.com", 1));
  expect(view.result.current.value.text).toBe("");
  expect(view.result.current.status).toBe("error");
  expect(quizDraftKey("owner@example.com", 1)).not.toBe(quizDraftKey("other@example.com", 1));
  expect(quizDraftKey("owner@example.com", 1)).not.toBe(quizDraftKey("owner@example.com", 2));
});

it("does not carry a draft to another account or discard newer edits during a server save", () => {
  const view = renderHook(({ email }) => useDraft(email), { initialProps: { email: "first@example.com" } });
  act(() => view.result.current.setValue({ text: "First account" }));
  act(() => jest.advanceTimersByTime(600));
  view.rerender({ email: "second@example.com" });
  expect(view.result.current.value.text).toBe("");
  act(() => view.result.current.setValue({ text: "Newer work" }));
  act(() => view.result.current.clear({ text: "Old server payload" }));
  view.unmount();
  expect(JSON.parse(localStorage.getItem(quizDraftKey("first@example.com"))!).value.text).toBe("First account");
  expect(JSON.parse(localStorage.getItem(quizDraftKey("second@example.com"))!).value.text).toBe("Newer work");
});

it("reports blocked storage while retaining the current work", () => {
  const view = renderHook(() => useDraft());
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  try {
    act(() => view.result.current.setValue({ text: "Keep this work" }));
    act(() => jest.advanceTimersByTime(600));
    expect(view.result.current.status).toBe("error");
    expect(view.result.current.value.text).toBe("Keep this work");
  } finally { setItem.mockRestore(); }
});
