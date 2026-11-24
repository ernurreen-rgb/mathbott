import { describe, expect, it } from "vitest";
import { filterTopics } from "@/lib/topic-filter";

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
