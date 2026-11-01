# Legacy lint matcher interface

The ESLint 8 plugins used by Next 15 still import minimatch 3 as a callable
CommonJS module. Current upstream security fixes are in minimatch 11, whose
module exports a namespace instead. This private adapter forwards the callable
interface and its helper properties to the real, pinned minimatch 11 package.
It contains no matching or brace-expansion engine and does not claim to be an
upstream minimatch release.

`eslint-plugin-import` also uses `makeRe(pattern).test(path)`. The adapter
implements that predicate with `Minimatch.match`; it does not provide a RegExp
or support consumers that inspect legacy regex/set internals. In particular,
glob 7 cannot use this adapter. The scoped flat-cache/rimraf and modern glob
overrides remove that consumer from the installed tree.

The override applies only to minimatch below version 9. Modern consumers use
upstream minimatch 11 directly. A root dev dependency reserves the legacy module
slot; `.npmrc` keeps its local source linked so npm 10 and 11 resolve that slot
consistently during clean installs. Its real upstream dependency is installed too.
Docker dependency layers must copy this directory and `.npmrc` before install.

Remove this adapter and its version-specific overrides when the lint plugins
support the patched upstream API. Compatibility tests exercise real lint rules,
ESLint file selection, cache deletion, and glob/coverage traversal.
