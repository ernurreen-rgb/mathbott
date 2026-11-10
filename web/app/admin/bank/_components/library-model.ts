import type { BankDifficulty, BankTaskSort, BankTaskUsageFilter, BankTwinsFilter, QuestionType } from "@/types";

export type BankLibraryFilters = {
  search: string;
  difficulty: BankDifficulty | "";
  questionType: QuestionType | "";
  usage: BankTaskUsageFilter;
  hasTopics: "" | "yes" | "no";
  topics: string[];
  topicMatch: "any" | "all";
  sort: BankTaskSort;
  /** Twins live under their source task; "only" lists them for maintenance. */
  twins: BankTwinsFilter;
  limit: number;
  offset: number;
};
export type BankSavedView = { id: string; name: string; filters: BankLibraryFilters };
export const emptyLibraryFilters = (): BankLibraryFilters => ({
  search: "", difficulty: "", questionType: "", usage: "all", hasTopics: "", topics: [],
  topicMatch: "any", sort: "newest", twins: "exclude", limit: 50, offset: 0,
});
export const questionTypeLabel = (type: string) => ({ input: "Жазбаша", tf: "Шын / Жалған", mcq: "4 нұсқа", mcq6: "6 нұсқа", select: "Сәйкестендіру" })[type] || type;

export function readLibraryFilters(value: unknown): BankLibraryFilters {
  const defaults = emptyLibraryFilters();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    search: typeof raw.search === "string" ? raw.search.slice(0, 500) : "",
    difficulty: ["A", "B", "C"].includes(String(raw.difficulty)) ? raw.difficulty as BankDifficulty : "",
    questionType: ["input", "tf", "mcq", "mcq6", "select"].includes(String(raw.questionType)) ? raw.questionType as QuestionType : "",
    usage: ["used", "unused"].includes(String(raw.usage)) ? raw.usage as BankTaskUsageFilter : "all",
    hasTopics: raw.hasTopics === "yes" || raw.hasTopics === "no" ? raw.hasTopics : "",
    topics: Array.isArray(raw.topics) ? Array.from(new Set(raw.topics.filter((t): t is string => typeof t === "string" && !!t.trim() && t.length <= 64))).slice(0, 20) : [],
    topicMatch: raw.topicMatch === "all" ? "all" : "any",
    sort: raw.sort === "oldest" || raw.sort === "updated" ? raw.sort : "newest",
    twins: raw.twins === "only" ? "only" : "exclude",
    limit: [20, 50, 100].includes(Number(raw.limit)) ? Number(raw.limit) : defaults.limit,
    offset: typeof raw.offset === "number" && Number.isInteger(raw.offset) && raw.offset >= 0 ? raw.offset : 0,
  };
}
