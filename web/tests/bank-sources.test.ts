import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AcceptedAnswersEditor", () => ({
  normalizeAcceptedAnswers: (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [],
}));

import { emptyLibraryFilters, readLibraryFilters } from "@/app/admin/bank/_components/library-model";
import { buildJsonEditValue, parseTaskToForm } from "@/app/admin/bank/_components/model";
import { getAdminBankSources, getAdminBankTasks } from "@/lib/api/admin-bank";
import { getConstructorSources, getConstructorTasks } from "@/lib/api/constructor";
import type { BankTask } from "@/types";

describe("bank task sources", () => {
  it("parses and upgrades library filters with sources and hasSources safely", () => {
    const empty = emptyLibraryFilters();
    expect(empty.sources).toEqual([]);
    expect(empty.hasSources).toBe("");

    const upgraded = readLibraryFilters({
      search: "eq",
      topics: ["Алгебра"],
    });
    expect(upgraded.sources).toEqual([]);
    expect(upgraded.hasSources).toBe("");

    const populated = readLibraryFilters({
      sources: ["Рустюмова", "ҰБТ есебі", "Рустюмова", ""],
      hasSources: "no",
    });
    expect(populated.sources).toEqual(["Рустюмова", "ҰБТ есебі"]);
    expect(populated.hasSources).toBe("no");
  });

  it("maps sources between BankTask, form state, and JSON edit payload", () => {
    const task = {
      id: 42,
      text: "x + 1 = 2",
      answer: "1",
      question_type: "input",
      difficulty: "A",
      topics: ["Алгебра"],
      sources: ["Рустюмова", "ҰБТ есебі"],
      created_at: "2026-11-25 00:00:00",
      updated_at: "2026-11-25 00:00:00",
    } as BankTask;

    const form = parseTaskToForm(task);
    expect(form.sources).toEqual(["Рустюмова", "ҰБТ есебі"]);

    const jsonText = buildJsonEditValue({ text: task.text, answer: task.answer, topics: task.topics }, task);
    const parsed = JSON.parse(jsonText);
    expect(parsed.sources).toEqual(["Рустюмова", "ҰБТ есебі"]);
  });

  it("serializes source query parameters cleanly for constructor and admin API clients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await getConstructorTasks({ sources: ["Рустюмова"], hasSources: false }, "u@example.com");
      const constructorUrl = String(fetchMock.mock.calls[0]?.[0] || "");
      expect(constructorUrl).toContain("sources=%D0%A0%D1%83%D1%81%D1%82%D1%8E%D0%BC%D0%BE%D0%B2%D0%B0");
      expect(constructorUrl).toContain("has_sources=false");

      await getConstructorSources("u@example.com");
      expect(String(fetchMock.mock.calls[1]?.[0] || "")).toContain("constructor/sources");

      await getAdminBankTasks("a@example.com", { sources: ["ҰБТ есебі"], hasSources: false });
      const adminUrl = String(fetchMock.mock.calls[2]?.[0] || "");
      expect(adminUrl).toContain("has_sources=false");
      expect(adminUrl).toContain("admin/bank/tasks");

      await getAdminBankSources("a@example.com", "руст");
      expect(String(fetchMock.mock.calls[3]?.[0] || "")).toContain("admin/bank/sources");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
