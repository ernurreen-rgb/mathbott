function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

/**
 * Filter and rank topic names for instant search:
 * 1. Matches all whitespace-separated query tokens (case-insensitive, ё -> е).
 * 2. Ranks full-prefix matches first, then word-start matches, then other matches,
 *    preserving the original order within each rank.
 */
export function filterTopics(topics: readonly string[], rawQuery: string): string[] {
  const query = normalizeForSearch(rawQuery);
  if (!query) return [...topics];

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...topics];

  const prefixMatches: string[] = [];
  const wordStartMatches: string[] = [];
  const otherMatches: string[] = [];

  for (const topic of topics) {
    const normalized = normalizeForSearch(topic);
    if (!tokens.every((token) => normalized.includes(token))) {
      continue;
    }

    if (normalized.startsWith(query)) {
      prefixMatches.push(topic);
    } else {
      const words = normalized.split(/[\s,./()\-–—]+/).filter(Boolean);
      const matchesWordStart = tokens.every((token) => words.some((word) => word.startsWith(token)));
      if (matchesWordStart) {
        wordStartMatches.push(topic);
      } else {
        otherMatches.push(topic);
      }
    }
  }

  return [...prefixMatches, ...wordStartMatches, ...otherMatches];
}

/** Toggle a topic in a multi-select filter while respecting the backend limit (20). */
export function toggleTopicSelection(
  selected: readonly string[],
  topic: string,
  maxSelected = 20,
): string[] {
  if (selected.includes(topic)) {
    return selected.filter((item) => item !== topic);
  }
  if (selected.length >= maxSelected) {
    return [...selected];
  }
  return [...selected, topic];
}
