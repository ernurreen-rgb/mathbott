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

/** Toggle a topic in a multi-select filter (unlimited by default unless maxSelected is passed). */
export function toggleTopicSelection(
  selected: readonly string[],
  topic: string,
  maxSelected = Number.POSITIVE_INFINITY,
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
  maxPerGroup = Number.POSITIVE_INFINITY,
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
  maxPerGroup = Number.POSITIVE_INFINITY,
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

export interface TopicHierarchyItem {
  name: string;
  parent: string | null;
}

export interface TopicTreeNode {
  name: string;
  parent: string | null;
  depth: number;
  /** Ancestor names from top-level section down to immediate parent (excluding this node). */
  path: string[];
  children: TopicTreeNode[];
  /** Total number of descendants at all nested levels. */
  descendantCount: number;
}

export interface TopicTree {
  roots: TopicTreeNode[];
  byName: Map<string, TopicTreeNode>;
  hasHierarchy: boolean;
}

/**
 * Build a safe cycle-free topic tree from flat `{ name, parent }` entries,
 * preserving sibling order from the input. Nodes whose parent is missing,
 * self-referential, or part of a cycle are safely promoted to roots.
 */
export function buildTopicTree(items: readonly TopicHierarchyItem[]): TopicTree {
  const orderedNames: string[] = [];
  const rawParentByName = new Map<string, string | null>();
  for (const item of items) {
    if (!item.name || rawParentByName.has(item.name)) continue;
    orderedNames.push(item.name);
    rawParentByName.set(item.name, item.parent && item.parent !== item.name ? item.parent : null);
  }

  // Resolve effective parent for every node, breaking cycles or missing parents.
  const effectiveParent = new Map<string, string | null>();
  for (const name of orderedNames) {
    const candidate = rawParentByName.get(name) ?? null;
    if (!candidate || !rawParentByName.has(candidate)) {
      effectiveParent.set(name, null);
      continue;
    }
    const seen = new Set<string>([name]);
    let cur: string | null = candidate;
    let hasCycle = false;
    while (cur) {
      if (seen.has(cur)) {
        hasCycle = true;
        break;
      }
      seen.add(cur);
      const next: string | null = rawParentByName.get(cur) ?? null;
      cur = next && rawParentByName.has(next) ? next : null;
    }
    effectiveParent.set(name, hasCycle ? null : candidate);
  }

  const childrenMap = new Map<string, string[]>();
  const rootNames: string[] = [];
  for (const name of orderedNames) {
    const parent = effectiveParent.get(name) ?? null;
    if (!parent) {
      rootNames.push(name);
    } else {
      const siblings = childrenMap.get(parent);
      if (siblings) siblings.push(name);
      else childrenMap.set(parent, [name]);
    }
  }

  const byName = new Map<string, TopicTreeNode>();
  const buildNode = (name: string, parent: string | null, depth: number, path: string[]): TopicTreeNode => {
    const childNames = childrenMap.get(name) ?? [];
    const childPath = [...path, name];
    const children = childNames.map((childName) => buildNode(childName, name, depth + 1, childPath));
    const descendantCount = children.reduce((sum, child) => sum + 1 + child.descendantCount, 0);
    const node: TopicTreeNode = { name, parent, depth, path, children, descendantCount };
    byName.set(name, node);
    return node;
  };

  const roots = rootNames.map((name) => buildNode(name, null, 0, []));
  const hasHierarchy = orderedNames.some((name) => effectiveParent.get(name) !== null);
  return { roots, byName, hasHierarchy };
}

/** Top-level sections that start expanded automatically when opening the topic tree. */
const DEFAULT_EXPANDED_SECTION_NORMS = new Set(["алгебра"]);

/** Return root topic names that should be expanded automatically by default. */
export function getDefaultExpandedTopics(roots: readonly TopicTreeNode[]): string[] {
  return roots
    .filter((node) => node.children.length > 0 && DEFAULT_EXPANDED_SECTION_NORMS.has(normalizeForSearch(node.name)))
    .map((node) => node.name);
}

/** Pre-order list of visible tree nodes given the currently expanded parent topic names. */
export function flattenVisibleTopicTree(
  roots: readonly TopicTreeNode[],
  expanded: ReadonlySet<string>,
): TopicTreeNode[] {
  const result: TopicTreeNode[] = [];
  const visit = (nodes: readonly TopicTreeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0 && expanded.has(node.name)) {
        visit(node.children);
      }
    }
  };
  visit(roots);
  return result;
}

/**
 * Search across all topics and subtopics in the tree, returning ranked nodes with
 * their ancestor `path` intact for breadcrumb display.
 */
export function filterTopicTree(roots: readonly TopicTreeNode[], rawQuery: string): TopicTreeNode[] {
  const all: TopicTreeNode[] = [];
  const collect = (nodes: readonly TopicTreeNode[]) => {
    for (const node of nodes) {
      all.push(node);
      if (node.children.length > 0) collect(node.children);
    }
  };
  collect(roots);

  const query = normalizeForSearch(rawQuery);
  if (!query) return all;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return all;

  const prefixMatches: TopicTreeNode[] = [];
  const wordStartMatches: TopicTreeNode[] = [];
  const otherNameMatches: TopicTreeNode[] = [];
  const pathMatches: TopicTreeNode[] = [];

  for (const node of all) {
    const normalizedName = normalizeForSearch(node.name);
    if (tokens.every((token) => normalizedName.includes(token))) {
      if (normalizedName.startsWith(query)) {
        prefixMatches.push(node);
      } else {
        const words = normalizedName.split(/[\s,./()\-–—]+/).filter(Boolean);
        const matchesWordStart = tokens.every((token) => words.some((word) => word.startsWith(token)));
        if (matchesWordStart) {
          wordStartMatches.push(node);
        } else {
          otherNameMatches.push(node);
        }
      }
      continue;
    }

    if (node.path.length > 0) {
      const normalizedFullPath = normalizeForSearch(`${node.path.join(" ")} ${node.name}`);
      if (tokens.every((token) => normalizedFullPath.includes(token))) {
        pathMatches.push(node);
      }
    }
  }

  return [...prefixMatches, ...wordStartMatches, ...otherNameMatches, ...pathMatches];
}

/** Count how many descendants (excluding the node itself) are currently included or excluded. */
export function countSelectedDescendants(
  node: TopicTreeNode,
  includedSet: ReadonlySet<string>,
  excludedSet: ReadonlySet<string>,
): { included: number; excluded: number } {
  let included = 0;
  let excluded = 0;
  const walk = (children: readonly TopicTreeNode[]) => {
    for (const child of children) {
      if (includedSet.has(child.name)) included += 1;
      if (excludedSet.has(child.name)) excluded += 1;
      if (child.children.length > 0) walk(child.children);
    }
  };
  walk(node.children);
  return { included, excluded };
}
