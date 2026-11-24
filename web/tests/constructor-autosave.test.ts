import { afterEach, describe, expect, it, vi } from "vitest";
import { getTaskCollection, listTaskCollections, updateTaskCollection } from "@/lib/api/constructor";

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
});
