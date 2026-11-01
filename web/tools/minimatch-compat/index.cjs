// Older ESLint plugins expect require('minimatch') to be callable. Delegate
// all matching to the patched upstream implementation; do not copy its engine.
const modern = require('minimatch-modern');

function normalizePattern(pattern) {
  return typeof pattern === 'string' ? pattern.trim() : pattern;
}

function create(defaults = {}) {
  const optionsFor = (options) => {
    const merged = { ...defaults, ...options };
    // v3 accepts native Windows glob paths by default (ESLint constructs them).
    return {
      ...merged,
      windowsPathsNoEscape: !!merged.windowsPathsNoEscape ||
        (process.platform === 'win32' && !merged.allowWindowsEscape),
    };
  };
  const match = (path, pattern, options) =>
    modern.minimatch(path, normalizePattern(pattern), optionsFor(options));
  class Minimatch extends modern.Minimatch {
    constructor(pattern, options) {
      super(normalizePattern(pattern), optionsFor(options));
    }
    static defaults(options) {
      return create({ ...defaults, ...options }).Minimatch;
    }
  }

  Object.assign(match, modern.minimatch, {
    Minimatch,
    minimatch: match,
    defaults: (options) => create({ ...defaults, ...options }),
    filter: (pattern, options) => (path) => match(path, pattern, options),
    match: (list, pattern, options) =>
      modern.match(list, normalizePattern(pattern), optionsFor(options)),
    braceExpand: (pattern, options) =>
      modern.braceExpand(normalizePattern(pattern), optionsFor(options)),
    // import/no-internal-modules only needs .test(), not RegExp internals.
    makeRe: (pattern, options) => {
      const matcher = new Minimatch(pattern, options);
      return { test: (value) => matcher.match(value) };
    },
  });
  return match;
}

module.exports = create();
