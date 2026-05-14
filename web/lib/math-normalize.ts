const KNOWN_LATEX_ENVIRONMENTS = [
  "smallmatrix",
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

export const normalizeLatexForMathDisplay = (value: string): string => {
  if (!value) return "";

  return value.replace(SPACED_ENVIRONMENT_COMMAND_RE, "\\$1{$2}");
};
