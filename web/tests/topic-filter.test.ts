import { describe, expect, it } from "vitest";
import { filterTopics, toggleExcludedTopic, toggleIncludedTopic, toggleTopicSelection } from "@/lib/topic-filter";

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
  it("adds and removes topics cleanly while enforcing max limit", () => {
    expect(toggleTopicSelection([], "ҰБТ есебі")).toEqual(["ҰБТ есебі"]);
    expect(toggleTopicSelection(["ҰБТ есебі"], "Интеграл")).toEqual(["ҰБТ есебі", "Интеграл"]);
    expect(toggleTopicSelection(["ҰБТ есебі", "Интеграл"], "ҰБТ есебі")).toEqual(["Интеграл"]);
    expect(toggleTopicSelection(["A", "B"], "C", 2)).toEqual(["A", "B"]);
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
