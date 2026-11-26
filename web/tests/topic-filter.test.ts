import { describe, expect, it } from "vitest";
import {
  buildTopicTree,
  countSelectedDescendants,
  filterTopics,
  filterTopicTree,
  flattenVisibleTopicTree,
  toggleExcludedTopic,
  toggleIncludedTopic,
  toggleTopicSelection,
} from "@/lib/topic-filter";

const SAMPLE_TOPICS = [
  "Айналу денелері",
  "Алгебра",
  "Алгебралық бөлшек",
  "Алғашқы функция",
  "Аналитикалық геометрия",
  "Анықталмаған интеграл",
  "Анықталған интеграл",
  "Анықталған интеграл қолданылуы",
  "Интегралдар кестесі",
  "Сызықтық теңдеулер жүйесі",
  "Тёплиц матрицасы",
];

describe("filterTopics", () => {
  it("returns all topics in original order when query is empty or whitespace", () => {
    expect(filterTopics(SAMPLE_TOPICS, "")).toEqual(SAMPLE_TOPICS);
    expect(filterTopics(SAMPLE_TOPICS, "   ")).toEqual(SAMPLE_TOPICS);
  });

  it("matches case-insensitively including Kazakh Cyrillic letters and ё/е folding", () => {
    expect(filterTopics(SAMPLE_TOPICS, "АЛҒАШҚЫ")).toEqual(["Алғашқы функция"]);
    expect(filterTopics(SAMPLE_TOPICS, "алғашқы")).toEqual(["Алғашқы функция"]);
    expect(filterTopics(SAMPLE_TOPICS, "теплиц")).toEqual(["Тёплиц матрицасы"]);
  });

  it("ranks prefix matches before word-start matches before substring matches", () => {
    const result = filterTopics(SAMPLE_TOPICS, "интеграл");
    // Prefix match first
    expect(result[0]).toBe("Интегралдар кестесі");
    // Word-start matches next, preserving original order
    expect(result.slice(1)).toEqual([
      "Анықталмаған интеграл",
      "Анықталған интеграл",
      "Анықталған интеграл қолданылуы",
    ]);
  });

  it("supports multi-word partial queries across words", () => {
    expect(filterTopics(SAMPLE_TOPICS, "анықт қол")).toEqual([
      "Анықталған интеграл қолданылуы",
    ]);
    expect(filterTopics(SAMPLE_TOPICS, "геом анал")).toEqual([
      "Аналитикалық геометрия",
    ]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterTopics(SAMPLE_TOPICS, "вектор")).toEqual([]);
  });
});

describe("toggleTopicSelection", () => {
  it("adds and removes topics cleanly with unlimited default and honors explicit max", () => {
    expect(toggleTopicSelection([], "ҰБТ есебі")).toEqual(["ҰБТ есебі"]);
    expect(toggleTopicSelection(["ҰБТ есебі"], "Интеграл")).toEqual(["ҰБТ есебі", "Интеграл"]);
    expect(toggleTopicSelection(["ҰБТ есебі", "Интеграл"], "ҰБТ есебі")).toEqual(["Интеграл"]);
    expect(toggleTopicSelection(["A", "B"], "C", 2)).toEqual(["A", "B"]);
    const existing = Array.from({ length: 25 }, (_, i) => `Тақырып ${i + 1}`);
    expect(toggleTopicSelection(existing, "Тақырып 26")).toHaveLength(26);
  });
});

describe("toggleIncludedTopic / toggleExcludedTopic", () => {
  it("keeps included and excluded sets mutually exclusive", () => {
    let state = { included: [] as string[], excluded: [] as string[] };
    state = toggleIncludedTopic(state, "Виет теоремасы");
    expect(state).toEqual({ included: ["Виет теоремасы"], excluded: [] });

    state = toggleExcludedTopic(state, "Параметрлі теңдеу");
    expect(state).toEqual({ included: ["Виет теоремасы"], excluded: ["Параметрлі теңдеу"] });

    // Excluding an already-included tag moves it out of included.
    state = toggleExcludedTopic(state, "Виет теоремасы");
    expect(state).toEqual({ included: [], excluded: ["Параметрлі теңдеу", "Виет теоремасы"] });

    // Including an already-excluded tag moves it back to included.
    state = toggleIncludedTopic(state, "Виет теоремасы");
    expect(state).toEqual({ included: ["Виет теоремасы"], excluded: ["Параметрлі теңдеу"] });

    // Clicking exclude again removes the exclusion.
    state = toggleExcludedTopic(state, "Параметрлі теңдеу");
    expect(state).toEqual({ included: ["Виет теоремасы"], excluded: [] });
  });
});

describe("buildTopicTree / flattenVisibleTopicTree / filterTopicTree", () => {
  const SAMPLE_TREE = [
    { name: "Геометрия", parent: null },
    { name: "Планиметрия", parent: "Геометрия" },
    { name: "Тригонометрия", parent: null },
    { name: "Тригонометриялық теңдеулер", parent: "Тригонометрия" },
    { name: "Тригонометриялық теңсіздіктер", parent: "Тригонометрия" },
    { name: "Үшбұрыштар", parent: "Планиметрия" },
  ];

  it("shows only top-level sections when collapsed and expands branches selectively", () => {
    const tree = buildTopicTree(SAMPLE_TREE);
    expect(tree.hasHierarchy).toBe(true);
    expect(tree.roots.map((n) => n.name)).toEqual(["Геометрия", "Тригонометрия"]);
    expect(tree.byName.get("Геометрия")?.descendantCount).toBe(2);
    expect(tree.byName.get("Үшбұрыштар")?.path).toEqual(["Геометрия", "Планиметрия"]);

    expect(flattenVisibleTopicTree(tree.roots, new Set()).map((n) => n.name)).toEqual([
      "Геометрия",
      "Тригонометрия",
    ]);

    expect(flattenVisibleTopicTree(tree.roots, new Set(["Тригонометрия"])).map((n) => n.name)).toEqual([
      "Геометрия",
      "Тригонометрия",
      "Тригонометриялық теңдеулер",
      "Тригонометриялық теңсіздіктер",
    ]);

    expect(flattenVisibleTopicTree(tree.roots, new Set(["Геометрия", "Планиметрия"])).map((n) => [n.name, n.depth])).toEqual([
      ["Геометрия", 0],
      ["Планиметрия", 1],
      ["Үшбұрыштар", 2],
      ["Тригонометрия", 0],
    ]);
  });

  it("searches across nested subtopics and preserves ancestor breadcrumb paths", () => {
    const tree = buildTopicTree(SAMPLE_TREE);
    const matches = filterTopicTree(tree.roots, "үшбұрыш");
    expect(matches.map((n) => ({ name: n.name, path: n.path }))).toEqual([
      { name: "Үшбұрыштар", path: ["Геометрия", "Планиметрия"] },
    ]);

    // Multi-word search spanning parent section + subtopic works too.
    const crossMatches = filterTopicTree(tree.roots, "геометрия үшбұрыш");
    expect(crossMatches.map((n) => n.name)).toEqual(["Үшбұрыштар"]);
  });

  it("safely promotes orphans and cyclic nodes to roots without crashing", () => {
    const tree = buildTopicTree([
      { name: "A", parent: "B" },
      { name: "B", parent: "A" },
      { name: "Orphan", parent: "NonExistent" },
      { name: "Self", parent: "Self" },
    ]);
    expect(tree.hasHierarchy).toBe(false);
    expect(tree.roots.map((n) => n.name)).toEqual(["A", "B", "Orphan", "Self"]);
  });

  it("counts included and excluded descendants accurately", () => {
    const tree = buildTopicTree(SAMPLE_TREE);
    const trig = tree.byName.get("Тригонометрия")!;
    expect(
      countSelectedDescendants(
        trig,
        new Set(["Тригонометрия", "Тригонометриялық теңдеулер"]),
        new Set(["Тригонометриялық теңсіздіктер"]),
      ),
    ).toEqual({ included: 1, excluded: 1 });
  });
});
