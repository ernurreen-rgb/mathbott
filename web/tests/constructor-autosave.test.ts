import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTaskCollection,
  deleteTaskCollection,
  getTaskCollection,
  listTaskCollections,
  trackCollectionMutation,
  updateTaskCollection,
} from "@/lib/api/constructor";

describe("constructor collection save synchronization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for an in-flight collection PUT (including keepalive unmount flush) before listing or reading", async () => {
    const events: string[] = [];
    let resolvePut!: () => void;
    const putGate = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      if (method === "PUT") {
        events.push(`put:start:keepalive=${String(Boolean(init?.keepalive))}`);
        await putGate;
        events.push("put:done");
        return new Response(
          JSON.stringify({
            id: 7,
            title: "Новый сборник",
            header_text: "",
            pptx_font: "JUZ40 FONTS",
            title_image: null,
            background_image: null,
            created_at: null,
            updated_at: null,
            tasks: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      events.push(`get:${url.includes("/collections/7") ? "detail" : "list"}`);
      return new Response(
        JSON.stringify(
          url.includes("/collections/7")
            ? {
                id: 7,
                title: "Новый сборник",
                header_text: "",
                pptx_font: "JUZ40 FONTS",
                title_image: null,
                background_image: null,
                created_at: null,
                updated_at: null,
                tasks: [],
              }
            : { items: [], max_collections: 50, max_tasks: 100 },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const putPromise = updateTaskCollection(
      7,
      { title: "Новый сборник", task_ids: [10, 20] },
      "teacher@example.test",
      { keepalive: true },
    );
    const listPromise = listTaskCollections("teacher@example.test");
    const getPromise = getTaskCollection(7, "teacher@example.test");

    // Neither GET should fire before the pending PUT settles.
    await Promise.resolve();
    expect(events).toEqual(["put:start:keepalive=true"]);

    resolvePut();
    await Promise.all([putPromise, listPromise, getPromise]);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      "put:start:keepalive=true",
      "put:done",
      "get:list",
      "get:detail",
    ]);
  });

  it("waits for a tracked create->update chain and empty-collection delete before listing collections", async () => {
    const events: string[] = [];
    let releasePost!: () => void;
    const postGate = new Promise<void>((resolve) => {
      releasePost = resolve;
    });
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST") {
        events.push("post:start");
        await postGate;
        events.push("post:done");
        return new Response(
          JSON.stringify({
            id: 42,
            title: "Жаңа жинақ",
            header_text: "",
            pptx_font: "JUZ40 FONTS",
            title_image: null,
            background_image: null,
            created_at: null,
            updated_at: null,
            tasks: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "PUT") {
        events.push("put:done");
        return new Response(
          JSON.stringify({
            id: 42,
            title: "Жаңа жинақ",
            header_text: "",
            pptx_font: "JUZ40 FONTS",
            title_image: null,
            background_image: null,
            created_at: null,
            updated_at: null,
            tasks: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "DELETE") {
        events.push(`delete:start:keepalive=${String(Boolean(init?.keepalive))}`);
        await deleteGate;
        events.push("delete:done");
        return new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      events.push("get:list");
      return new Response(
        JSON.stringify({ items: [], max_collections: 50, max_tasks: 100 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const composite = trackCollectionMutation(
      (async () => {
        const created = await createTaskCollection("Жаңа жинақ", "teacher@example.test");
        expect(created.data?.id).toBe(42);
        await updateTaskCollection(42, { task_ids: [101] }, "teacher@example.test");
      })(),
    );
    const listAfterCreate = listTaskCollections("teacher@example.test");

    await Promise.resolve();
    expect(events).toEqual(["post:start"]);

    releasePost();
    await Promise.all([composite, listAfterCreate]);
    expect(events).toEqual(["post:start", "post:done", "put:done", "get:list"]);

    events.length = 0;
    const delPromise = deleteTaskCollection(42, "teacher@example.test", { keepalive: true });
    const listAfterDelete = listTaskCollections("teacher@example.test");

    await Promise.resolve();
    expect(events).toEqual(["delete:start:keepalive=true"]);

    releaseDelete();
    await Promise.all([delPromise, listAfterDelete]);
    expect(events).toEqual(["delete:start:keepalive=true", "delete:done", "get:list"]);
  });
});
