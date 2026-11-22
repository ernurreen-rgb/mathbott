import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AcceptedAnswersEditor", () => ({
  normalizeAcceptedAnswers: (values: string[]) => values,
}));

import { hasContentAccess, hasReviewAccess, hasSuperAccess, isAllowedForPage } from "@/lib/admin-access";
import { createAdminBankTask, importAdminBankTasks, rollbackAdminBankTask } from "@/lib/api/admin-bank";
import { updateAdminReportTask } from "@/lib/api/admin-reports";
import { restoreAdminRoleFromAudit } from "@/lib/api/admin-roles";
import { clearApiGetCache, fetchWithErrorHandling } from "@/lib/api/client";
import { hasWorksheetTaskContent, trialPlacementToWorksheetTask } from "@/lib/bank-worksheet";
import { pickNextTaskId } from "@/lib/lesson-flow";
import { MAX_PROXY_BODY_BYTES, readBoundedRequestBody } from "@/lib/proxy-request-body";
import { resolveInitialTrialTestFolderId } from "@/lib/trial-folders";
import { createVersionActions } from "@/app/admin/bank/_components/createVersionActions";
import { createTrashActions } from "@/app/admin/cms/_components/createTrashActions";
import type { BankPlacementTask, BankTask } from "@/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiGetCache();
  vi.restoreAllMocks();
});

describe("H-30: Bounded proxy request body streaming & 10 MB limit alignment", () => {
  it("aligns MAX_PROXY_BODY_BYTES with backend MAX_SIGNED_BODY_BYTES (10 MB)", () => {
    expect(MAX_PROXY_BODY_BYTES).toBe(10 * 1024 * 1024);
  });

  it("aborts oversized chunked streams early without reading remaining chunks", async () => {
    let pullCount = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(64).fill(65));
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request("http://local.test/upload", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node fetch requires duplex for streamed bodies
      duplex: "half",
    });

    const result = await readBoundedRequestBody(req, 100);
    expect(result).toBeNull();
    expect(cancelled).toBe(true);
    expect(pullCount).toBeLessThanOrEqual(3);
  });

  it("reads valid bodies within limit intact", async () => {
    const req = new Request("http://local.test/upload", {
      method: "POST",
      body: "hello-qazmath",
    });
    const result = await readBoundedRequestBody(req, 100);
    expect(result?.toString("utf8")).toBe("hello-qazmath");
  });
});

describe("H-32: API GET cache epoch prevents in-flight stale cache & raw fetch mutations invalidate cache", () => {
  it("does not cache an in-flight GET that started before a mutation", async () => {
    let resolveFirstGet!: (response: Response) => void;
    let getCalls = 0;

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "GET") {
        getCalls += 1;
        if (getCalls === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstGet = resolve;
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ version: 2 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }) as typeof fetch;

    const firstGetPromise = fetchWithErrorHandling<{ version: number }>("/api/backend/items");
    // Mutation happens while the first GET is still in flight.
    await fetchWithErrorHandling("/api/backend/items", { method: "POST", body: "{}" });
    // Now resolve the stale first GET.
    resolveFirstGet(
      new Response(JSON.stringify({ version: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const firstResult = await firstGetPromise;
    expect(firstResult.data?.version).toBe(1);

    // Subsequent GET must NOT receive cached version 1 — it must fetch fresh version 2!
    const secondResult = await fetchWithErrorHandling<{ version: number }>("/api/backend/items");
    expect(secondResult.data?.version).toBe(2);
    expect(getCalls).toBe(2);
  });

  it("raw-fetch admin mutators clear GET cache", async () => {
    let getCalls = 0;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "GET") {
        getCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ n: getCalls }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }) as typeof fetch;

    const mutations: Array<() => Promise<unknown>> = [
      () => createAdminBankTask(new FormData(), "admin@example.com"),
      () => rollbackAdminBankTask(1, { email: "admin@example.com", target_version: 1 }),
      () => importAdminBankTasks("admin@example.com", [], { mode: "confirm" }),
      () => updateAdminReportTask(1, "admin@example.com", new FormData()),
      () => restoreAdminRoleFromAudit("admin@example.com", { audit_id: 1 }),
    ];

    for (const mutate of mutations) {
      const before = await fetchWithErrorHandling<{ n: number }>("/api/backend/cached");
      const cached = await fetchWithErrorHandling<{ n: number }>("/api/backend/cached");
      expect(cached.data?.n).toBe(before.data?.n);
      await mutate();
      const after = await fetchWithErrorHandling<{ n: number }>("/api/backend/cached");
      expect(after.data?.n).toBe((before.data?.n || 0) + 1);
    }
  });
});

describe("H-33: Browsing solved tasks in a completed mini-lesson", () => {
  it("steps sequentially through tasks 1 -> 2 -> 3 -> summary when browseCompleted is true", () => {
    const allSolved = [
      { id: 11, solved: true },
      { id: 22, solved: true },
      { id: 33, solved: true },
    ];
    expect(pickNextTaskId(allSolved, 0, { browseCompleted: true })).toBe(22);
    expect(pickNextTaskId(allSolved, 1, { browseCompleted: true })).toBe(33);
    expect(pickNextTaskId(allSolved, 2, { browseCompleted: true })).toBeNull();
    // Without browseCompleted (just solved last task in active session), goes straight to summary.
    expect(pickNextTaskId(allSolved, 0)).toBeNull();
  });
});

describe("H-35: Admin state fixes (versioning, CMS trash, trial folders, image-only PDF)", () => {
  it("updates historyTask with the returned BankTask version after rollback so 2nd rollback avoids 409", async () => {
    const initialTask = {
      id: 10,
      text: "2+2",
      answer: "4",
      question_type: "input",
      difficulty: "A",
      topics: [],
      current_version: 2,
    } as unknown as BankTask;
    const rolledBackTask = { ...initialTask, current_version: 3 };

    let historyTaskState: BankTask | null = initialTask;
    const setHistoryTask = vi.fn((updater: BankTask | null | ((p: BankTask | null) => BankTask | null)) => {
      historyTaskState = typeof updater === "function" ? updater(historyTaskState) : updater;
    });

    vi.stubGlobal("confirm", vi.fn(() => true));
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/rollback")) {
        return Promise.resolve(
          new Response(JSON.stringify(rolledBackTask), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }) as typeof fetch;

    const actions = createVersionActions({
      email: "admin@example.com",
      setHistoryTask,
      setHistoryItems: vi.fn(),
      setHistoryError: vi.fn(),
      setSnapshotView: vi.fn(),
      setJsonEdit: vi.fn(),
      setHistoryLoading: vi.fn(),
      setError: vi.fn(),
      jsonEdit: null,
      fetchTasks: vi.fn(async () => {}),
      historyTask: initialTask,
      setRollbackLoading: vi.fn(),
      setDeleteVersionLoadingNo: vi.fn(),
      snapshotView: null,
      setUsageTask: vi.fn(),
      setUsageItems: vi.fn(),
      setUsageError: vi.fn(),
      setUsageLoading: vi.fn(),
    });

    await actions.handleRollbackVersion(initialTask, 1);
    expect(historyTaskState?.current_version).toBe(3);
  });

  it("refetches CMS trash whenever the dialog opens even if old trashTasks are already loaded", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ id: 1, text: "old" }, { id: 2, text: "newly deleted" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const setTrashOpen = vi.fn();
    const setTrashTasks = vi.fn();
    const actions = createTrashActions({
      session: { user: { email: "admin@example.com" }, expires: "" },
      setTrashLoading: vi.fn(),
      setTrashTasks,
      setError: vi.fn(),
      trashOpen: false,
      setTrashOpen,
      trashTasks: [{ id: 1, text: "old" } as any],
      selectedMiniLesson: null,
      fetchMiniTasks: vi.fn(async () => {}),
    });

    actions.toggleTrash();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setTrashOpen).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setTrashTasks).toHaveBeenCalledWith([
      { id: 1, text: "old" },
      { id: 2, text: "newly deleted" },
    ]);
  });

  it("preserves root trial test folder_id=null instead of moving it to leaves[0]", () => {
    const leaves = [{ id: 10 }, { id: 20 }];
    expect(resolveInitialTrialTestFolderId({ folder_id: null }, undefined, leaves)).toBe("");
    expect(resolveInitialTrialTestFolderId({ folder_id: 20 }, undefined, leaves)).toBe(20);
    expect(resolveInitialTrialTestFolderId(undefined, 20, leaves)).toBe(20);
    expect(resolveInitialTrialTestFolderId(undefined, undefined, leaves)).toBe(10);
  });

  it("retains image-only tasks without text in trial test worksheet export", () => {
    const tasks = [
      { id: 1, sort_order: 0, text: "Question 1", image_filename: null },
      { id: 2, sort_order: 1, text: "   ", image_filename: "diagram.png" },
      { id: 3, sort_order: 2, text: "", bank_task: { text: "", image_filename: "graph.png" } },
      { id: 4, sort_order: 3, text: "", image_filename: null },
    ] as unknown as BankPlacementTask[];

    const kept = tasks.filter(hasWorksheetTaskContent).map(trialPlacementToWorksheetTask);
    expect(kept.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(kept[1].image_filename).toBe("diagram.png");
    expect(kept[2].image_filename).toBe("graph.png");
  });
});

describe("H-36 / H-37: Admin role page access matrix", () => {
  it("separates content_editor, reviewer, and super_admin capabilities accurately", () => {
    expect(hasContentAccess("super_admin")).toBe(true);
    expect(hasContentAccess("content_editor")).toBe(true);
    expect(hasContentAccess("reviewer")).toBe(false);

    expect(hasReviewAccess("super_admin")).toBe(true);
    expect(hasReviewAccess("reviewer")).toBe(true);
    expect(hasReviewAccess("content_editor")).toBe(false);

    expect(hasSuperAccess("super_admin")).toBe(true);
    expect(hasSuperAccess("content_editor")).toBe(false);
    expect(hasSuperAccess("reviewer")).toBe(false);

    expect(isAllowedForPage("content", "reviewer")).toBe(false);
    expect(isAllowedForPage("review", "content_editor")).toBe(false);
    expect(isAllowedForPage("any", "reviewer")).toBe(true);
    expect(isAllowedForPage("any", "content_editor")).toBe(true);
    expect(isAllowedForPage("any", null)).toBe(false);
  });
});
