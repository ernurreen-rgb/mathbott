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

export interface TopicSelectionState {
  included: string[];
  excluded: string[];
}

/** Toggle a topic as included (removing it from excluded if present). */
export function toggleIncludedTopic(
  state: TopicSelectionState,
  topic: string,
  maxPerGroup = 20,
): TopicSelectionState {
  if (state.included.includes(topic)) {
    return {
      included: state.included.filter((item) => item !== topic),
      excluded: [...state.excluded],
    };
  }
  if (state.included.length >= maxPerGroup) {
    return { included: [...state.included], excluded: [...state.excluded] };
  }
  return {
    included: [...state.included, topic],
    excluded: state.excluded.filter((item) => item !== topic),
  };
}

/** Toggle a topic as excluded (removing it from included if present). */
export function toggleExcludedTopic(
  state: TopicSelectionState,
  topic: string,
  maxPerGroup = 20,
): TopicSelectionState {
  if (state.excluded.includes(topic)) {
    return {
      included: [...state.included],
      excluded: state.excluded.filter((item) => item !== topic),
    };
  }
  if (state.excluded.length >= maxPerGroup) {
    return { included: [...state.included], excluded: [...state.excluded] };
  }
  return {
    included: state.included.filter((item) => item !== topic),
    excluded: [...state.excluded, topic],
  };
}
