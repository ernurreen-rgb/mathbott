const KNOWN_LATEX_ENVIRONMENTS = [
  "smallmatrix",
  "dcases",
  "rcases",
  "alignedat",
  "gathered",
  "aligned",
  "array",
  "bmatrix",
  "cases",
  "gather",
  "pmatrix",
  "split",
  "vmatrix",
  "Vmatrix",
  "matrix",
];

const KNOWN_LATEX_ENVIRONMENT_PATTERN = KNOWN_LATEX_ENVIRONMENTS.join("|");
const SPACED_ENVIRONMENT_COMMAND_RE = new RegExp(
  `\\\\(begin|end)\\s+(${KNOWN_LATEX_ENVIRONMENT_PATTERN})`,
  "g"
);
const REDUNDANT_CASES_WRAPPER_RE =
  /\\left\\\{\s*\\begin\{(cases|dcases)\}([\s\S]*?)\\end\{\1\}\s*\\right\./g;
const SIMPLE_TEXT_COMMAND_RE = /\\text\{([^{}]*)\}/g;
const LATEX_SPACING_COMMAND_RE = /(^|[^\\])\\(?: |,|:|;|quad|qquad)/g;

export const normalizeLatexForMathDisplay = (value: string): string => {
  if (!value) return "";

  return value
    .replace(SPACED_ENVIRONMENT_COMMAND_RE, "\\$1{$2}")
    .replace(REDUNDANT_CASES_WRAPPER_RE, "\\begin{$1}$2\\end{$1}");
};

export const normalizeMathFieldValueForStorage = (value: string): string => {
  if (!value) return "";

  return normalizeLatexForMathDisplay(value)
    .replace(SIMPLE_TEXT_COMMAND_RE, (_match, inner: string) => inner)
    .replace(LATEX_SPACING_COMMAND_RE, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};
