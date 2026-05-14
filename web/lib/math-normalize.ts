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
const MATHLIVE_TEXT_ESCAPE_RE = /\\(?:textbackslash|textbraceleft|textbraceright|lbrack|rbrack|textunderscore)\b/;
const LATEX_COMMAND_GROUP_SPACE_RE = /(\\[a-zA-Z]+)\s+([\[{])/g;
const LATEX_OPTIONAL_TO_REQUIRED_GROUP_SPACE_RE = /(\])\s+(\{)/g;

export const hasMathLiveTextEscapes = (value: string): boolean => MATHLIVE_TEXT_ESCAPE_RE.test(value);

const normalizeMathLiveTextEscapes = (value: string): string =>
  value
    .replace(/\\textbackslash\s*([a-zA-Z]+)/g, "\\$1")
    .replace(/\\textbackslash/g, "\\")
    .replace(/\\textbraceleft\s*/g, "{")
    .replace(/\s*\\textbraceright/g, "}")
    .replace(/\\(?:lbrack|textbracketleft)\s*/g, "[")
    .replace(/\s*\\(?:rbrack|textbracketright)/g, "]")
    .replace(/\\textunderscore\s*/g, "_")
    .replace(LATEX_COMMAND_GROUP_SPACE_RE, "$1$2")
    .replace(LATEX_OPTIONAL_TO_REQUIRED_GROUP_SPACE_RE, "$1$2");

export const normalizeLatexForMathDisplay = (value: string): string => {
  if (!value) return "";

  return normalizeMathLiveTextEscapes(value)
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
