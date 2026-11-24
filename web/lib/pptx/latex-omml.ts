/**
 * LaTeX → Office Math (OMML), the native equations of PowerPoint, plus a linear text version.
 *
 * The task bank stores formulas as the LaTeX that MathLive writes. PowerPoint shows OMML as an
 * equation the teacher can edit in place (Insert → Equation), the way equations typed in
 * PowerPoint itself are stored. The text version goes into the fallback that apps without
 * equation support show instead (mc:Fallback), and into the answer key.
 *
 * The parser covers the LaTeX of school mathematics. A command it does not know is shown as its
 * name and reported in `unsupported`, so tests can catch gaps instead of losing content.
 */

export type MathStyle = "math" | "plain" | "bold" | "text";

export type MathNode =
  | { t: "run"; text: string; style: MathStyle }
  | { t: "row"; items: MathNode[] }
  | { t: "frac"; num: MathNode; den: MathNode; noBar?: boolean }
  | { t: "rad"; body: MathNode; index?: MathNode }
  | { t: "scripts"; base: MathNode; sub?: MathNode; sup?: MathNode }
  | { t: "delim"; open: string; close: string; body: MathNode }
  | { t: "func"; name: MathNode; arg: MathNode }
  | { t: "acc"; chr: string; body: MathNode }
  | { t: "bar"; pos: "top" | "bot"; body: MathNode }
  | { t: "nary"; chr: string; sub?: MathNode; sup?: MathNode; body: MathNode; under: boolean }
  | { t: "lim"; pos: "low" | "upp"; base: MathNode; lim: MathNode }
  | { t: "matrix"; rows: MathNode[][] }
  | { t: "eqarr"; rows: MathNode[] }
  | { t: "box"; body: MathNode };

const run = (text: string, style: MathStyle = "math"): MathNode => ({ t: "run", text, style });
const row = (items: MathNode[]): MathNode => (items.length === 1 ? items[0] : { t: "row", items });
const EMPTY: MathNode = { t: "row", items: [] };

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const SYMBOLS: Record<string, string> = {
  infty: "∞", cdot: "⋅", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", bullet: "∙",
  le: "≤", leq: "≤", leqslant: "⩽", ge: "≥", geq: "≥", geqslant: "⩾", ne: "≠", neq: "≠", lt: "<", gt: ">",
  approx: "≈", sim: "∼", simeq: "≃", cong: "≅", equiv: "≡", propto: "∝", ll: "≪", gg: "≫",
  nless: "≮", ngtr: "≯", nleq: "≰", ngeq: "≱",
  to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔",
  Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓",
  longrightarrow: "⟶", Longrightarrow: "⟹", longleftrightarrow: "⟷", Longleftrightarrow: "⟺",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
  cup: "∪", cap: "∩", setminus: "∖", smallsetminus: "∖", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬", wedge: "∧", land: "∧", vee: "∨", lor: "∨",
  angle: "∠", measuredangle: "∡", triangle: "△", perp: "⊥", parallel: "∥", nparallel: "∦",
  circ: "∘", degree: "°", prime: "′", partial: "∂", nabla: "∇", ell: "ℓ", hbar: "ℏ",
  cdots: "⋯", ldots: "…", dots: "…", dotsc: "…", dotsb: "⋯", vdots: "⋮", ddots: "⋱",
  mid: "∣", nmid: "∤", vert: "|", lvert: "|", rvert: "|", Vert: "‖", lVert: "‖", rVert: "‖",
  langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  lbrace: "{", rbrace: "}", lbrack: "[", rbrack: "]", backslash: "\\", colon: ":",
  therefore: "∴", because: "∵", square: "□", Box: "□", blacksquare: "■", checkmark: "✓",
  complement: "∁", aleph: "ℵ", Re: "ℜ", Im: "ℑ", wp: "℘", oplus: "⊕", otimes: "⊗", odot: "⊙",
  S: "§", P: "¶", dag: "†", copyright: "©", textdegree: "°", textperthousand: "‰",
};

const ESCAPED_CHARS: Record<string, string> = {
  "%": "%", "$": "$", "#": "#", "&": "&", "_": "_", "{": "{", "}": "}", "|": "‖",
};

const SPACES: Record<string, string> = {
  ",": " ", thinspace: " ", ":": " ", ">": " ", medspace: " ", ";": " ",
  thickspace: " ", " ": " ", quad: " ", qquad: "  ", enspace: " ", "!": "",
  negthinspace: "", negmedspace: "", negthickspace: "",
};

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "tg", "cot", "ctg", "cotg", "sec", "csc", "cosec", "arcsin", "arccos", "arctan",
  "arctg", "arccot", "arcctg", "sinh", "cosh", "tanh", "coth", "th", "ch", "sh", "cth", "ln", "lg", "log",
  "exp", "det", "deg", "dim", "gcd", "hom", "ker", "arg", "sgn", "Pr", "lcm", "НОД", "НОК",
]);
const LIMIT_FUNCTIONS = new Set(["lim", "limsup", "liminf", "max", "min", "sup", "inf"]);
const LIMIT_NAMES: Record<string, string> = { limsup: "lim sup", liminf: "lim inf" };

const NARY: Record<string, { chr: string; under: boolean }> = {
  sum: { chr: "∑", under: true }, prod: { chr: "∏", under: true }, coprod: { chr: "∐", under: true },
  bigcup: { chr: "⋃", under: true }, bigcap: { chr: "⋂", under: true },
  int: { chr: "∫", under: false }, iint: { chr: "∬", under: false }, iiint: { chr: "∭", under: false },
  oint: { chr: "∮", under: false },
};

const ACCENTS: Record<string, string> = {
  vec: "⃗", overrightarrow: "⃗", hat: "̂", widehat: "̂", tilde: "̃",
  widetilde: "̃", dot: "̇", ddot: "̈", acute: "́", grave: "̀", check: "̌",
  breve: "̆", overleftarrow: "⃖", overleftrightarrow: "⃡", mathring: "̊",
};

const DELIMITER_COMMANDS: Record<string, string> = {
  lbrace: "{", rbrace: "}", "{": "{", "}": "}", langle: "⟨", rangle: "⟩", vert: "|", lvert: "|", rvert: "|",
  "|": "‖", Vert: "‖", lVert: "‖", rVert: "‖", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  lbrack: "[", rbrack: "]", backslash: "\\", uparrow: "↑", downarrow: "↓",
};

const SIZED_DELIMITERS = new Set([
  "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "Biggl", "Biggr", "bigm", "Bigm",
]);

const IGNORED = new Set([
  "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle", "limits", "nolimits", "nonumber", "notag",
  "relax", "strut", "mathstrut", "allowbreak", "nobreak", "newline", "centering", "middle",
]);

const ENV_DELIMITERS: Record<string, [string, string]> = {
  pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"],
  matrix: ["", ""], smallmatrix: ["", ""], array: ["", ""],
};
const CASES_ENVS = new Set(["cases", "dcases", "rcases", "cases*"]);
const ALIGN_ENVS = new Set([
  "aligned", "align", "align*", "gathered", "gather", "gather*", "split", "alignedat", "eqnarray", "eqnarray*",
]);

const DOUBLE_STRUCK: Record<string, string> = { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" };
const SCRIPT_LETTERS: Record<string, string> = { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ" };

const OPEN_BRACKETS: Record<string, true> = { "(": true, "[": true };
const CLOSE_BRACKETS: Record<string, true> = { ")": true, "]": true };
const NO_ARGUMENT_AFTER = /^[+\-−=<>≤≥≠,;:)\]}&|!?.]$/;

type Stop = { brace?: boolean; bracket?: boolean; right?: boolean; env?: boolean; optional?: boolean };

class LatexParser {
  i = 0;
  readonly unsupported = new Set<string>();

  constructor(private readonly s: string) {}

  parse(): MathNode {
    const items = this.parseRow({});
    return row(items);
  }

  private peek(offset = 0) {
    return this.s[this.i + offset] ?? "";
  }

  private skipSpaces() {
    let skipped = false;
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) {
      this.i += 1;
      skipped = true;
    }
    return skipped;
  }

  /** Reads `\name` (letters, with an optional `*`) or `\x` (one character), then the spaces after a word. */
  private readCommand(): string {
    this.i += 1; // backslash
    const start = this.i;
    if (/[A-Za-z]/.test(this.peek())) {
      while (/[A-Za-z]/.test(this.peek())) this.i += 1;
      if (this.peek() === "*") this.i += 1;
      const name = this.s.slice(start, this.i);
      this.skipSpaces();
      return name;
    }
    if (this.i < this.s.length) this.i += 1;
    return this.s.slice(start, this.i);
  }

  private atStop(stop: Stop): boolean {
    const ch = this.peek();
    if (!ch) return true;
    if (stop.brace && ch === "}") return true;
    if (stop.optional && ch === "]") return true;
    if (stop.bracket && CLOSE_BRACKETS[ch]) return true;
    if (ch === "\\") {
      const rest = this.s.slice(this.i + 1);
      if (stop.right && /^right(?![A-Za-z])/.test(rest)) return true;
      if (stop.env && (rest.startsWith("\\") || /^end(?![A-Za-z])/.test(rest))) return true;
    }
    if (stop.env && ch === "&") return true;
    return false;
  }

  parseRow(stop: Stop): MathNode[] {
    const items: MathNode[] = [];
    const openBrackets: number[] = [];
    while (this.i < this.s.length) {
      const spaced = this.skipSpaces();
      if (this.atStop(stop)) {
        // A closing bracket the row did not open belongs to the caller (a function argument in brackets).
        if (!(CLOSE_BRACKETS[this.peek()] && openBrackets.length && stop.bracket)) break;
      }
      const ch = this.peek();
      if (spaced && items.length && /[A-Za-z0-9]$/.test(lastRunText(items)) && /[A-Za-z0-9]/.test(ch)) {
        items.push(run(" "));
      }
      if (ch === "}") {
        this.i += 1; // a stray closing brace
        continue;
      }
      if (ch === "^" || ch === "_") {
        this.i += 1;
        const script = this.parseArgument();
        attachScript(items, ch === "^" ? "sup" : "sub", script);
        continue;
      }
      if (ch === "'") {
        let primes = "";
        while (this.peek() === "'") {
          primes += "′";
          this.i += 1;
        }
        attachScript(items, "sup", run(primes.length === 2 ? "″" : primes.length === 3 ? "‴" : primes));
        continue;
      }
      if (OPEN_BRACKETS[ch]) {
        this.i += 1;
        openBrackets.push(items.length);
        items.push(run(ch));
        continue;
      }
      if (CLOSE_BRACKETS[ch]) {
        this.i += 1;
        const opened = openBrackets.pop();
        if (opened === undefined) {
          items.push(run(ch));
          continue;
        }
        const open = (items[opened] as { text: string }).text;
        const body = items.splice(opened);
        items.push({ t: "delim", open, close: ch, body: row(body.slice(1)) });
        continue;
      }
      const atom = this.parseAtom(false);
      if (atom) items.push(atom);
    }
    return mergeRuns(items);
  }

  /** One argument: a {group}, one command or one character (`\frac19`, `x^2`). */
  parseArgument(): MathNode {
    this.skipSpaces();
    const ch = this.peek();
    if (!ch) return EMPTY;
    if (ch === "{") return this.parseGroup();
    if (ch === "\\") return this.parseAtom(true) ?? EMPTY;
    this.i += 1;
    return charRun(ch);
  }

  private parseGroup(): MathNode {
    this.i += 1; // {
    const items = this.parseRow({ brace: true });
    if (this.peek() === "}") this.i += 1;
    return row(items);
  }

  /** The raw text of a {group}, braces balanced, for \text and environment names. */
  private readRawGroup(): string {
    this.skipSpaces();
    if (this.peek() !== "{") {
      const ch = this.peek();
      this.i += ch ? 1 : 0;
      return ch;
    }
    let depth = 0;
    const start = this.i + 1;
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === "\\") {
        this.i += 2;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          this.i += 1;
          return this.s.slice(start, this.i - 1);
        }
      }
      this.i += 1;
    }
    return this.s.slice(start);
  }

  private readDelimiter(): string {
    this.skipSpaces();
    const ch = this.peek();
    if (ch === "\\") {
      const name = this.readCommand();
      return DELIMITER_COMMANDS[name] ?? (name === "." ? "" : name);
    }
    this.i += ch ? 1 : 0;
    return ch === "." ? "" : ch === "<" ? "⟨" : ch === ">" ? "⟩" : ch;
  }

  parseAtom(single: boolean): MathNode | null {
    const ch = this.peek();
    if (ch === "{") return this.parseGroup();
    if (ch === "\\") return this.parseCommand(this.readCommand());
    this.i += 1;
    if (ch === "$") return null;
    if (ch === "~") return run(" ");
    if (!single && /[0-9]/.test(ch)) {
      let number = ch;
      for (;;) {
        if (/[0-9]/.test(this.peek()) || (/[.,]/.test(this.peek()) && /[0-9]/.test(this.peek(1)))) {
          number += this.peek();
          this.i += 1;
        } else if (/^\{[.,]\}[0-9]/.test(this.s.slice(this.i, this.i + 4))) {
          number += this.peek(1); // 0{,}4: MathLive's decimal comma
          this.i += 3;
        } else {
          break;
        }
      }
      return run(number);
    }
    return charRun(ch);
  }

  private parseCommand(name: string): MathNode | null {
    if (name in SPACES) return SPACES[name] ? run(SPACES[name]) : null;
    if (name in ESCAPED_CHARS) return run(ESCAPED_CHARS[name], "plain");
    if (name === "\\") return null; // a line break outside an environment
    if (IGNORED.has(name)) return null;
    if (name in GREEK) return run(GREEK[name]);
    if (name in SYMBOLS) return run(SYMBOLS[name]);

    switch (name) {
      case "frac": case "dfrac": case "tfrac": case "cfrac": {
        const num = this.parseArgument();
        return { t: "frac", num, den: this.parseArgument() };
      }
      case "binom": case "dbinom": case "tbinom": {
        const num = this.parseArgument();
        return { t: "delim", open: "(", close: ")", body: { t: "frac", num, den: this.parseArgument(), noBar: true } };
      }
      case "sqrt": {
        this.skipSpaces();
        let index: MathNode | undefined;
        if (this.peek() === "[") {
          this.i += 1;
          index = row(this.parseRow({ optional: true }));
          if (this.peek() === "]") this.i += 1;
        }
        return { t: "rad", body: this.parseArgument(), index };
      }
      case "left": {
        const open = this.readDelimiter();
        const body = this.parseRow({ right: true });
        let close = "";
        if (this.peek() === "\\" && /^right(?![A-Za-z])/.test(this.s.slice(this.i + 1))) {
          this.readCommand();
          close = this.readDelimiter();
        }
        return { t: "delim", open, close, body: row(body) };
      }
      case "right":
        this.readDelimiter();
        return null;
      case "not": {
        this.skipSpaces();
        const next = this.parseArgument();
        const text = next.t === "run" ? next.text : "";
        const negated: Record<string, string> = { "=": "≠", "∈": "∉", "<": "≮", ">": "≯", "≤": "≰", "≥": "≱", "∥": "∦", "∣": "∤", "⊂": "⊄", "⊆": "⊈", "≡": "≢", "∼": "≁", "∃": "∄" };
        return run(negated[text] ?? `${text}̸`);
      }
      case "text": case "textrm": case "textup": case "textnormal": case "mbox": case "hbox": case "textit": case "textsf": case "texttt": {
        const text = unescapeText(this.readRawGroup());
        // The bank writes a leading minus as \text{-}: it is the minus sign, not a hyphen.
        return text.trim() === "-" ? run("−") : run(text, "text");
      }
      case "textbf":
        return run(unescapeText(this.readRawGroup()), "bold");
      case "mathrm": case "mathup": case "rm": case "mathsf": case "mathtt":
        return restyle(this.parseArgument(), "plain");
      case "mathbf": case "boldsymbol": case "bm": case "bf":
        return restyle(this.parseArgument(), "bold");
      case "mathit": case "it":
        return this.parseArgument();
      case "mathbb": case "Bbb":
        return mapLetters(this.parseArgument(), (letter) => DOUBLE_STRUCK[letter] ?? doubleStruck(letter));
      case "mathcal": case "mathscr":
        return mapLetters(this.parseArgument(), (letter) => SCRIPT_LETTERS[letter] ?? letter);
      case "mathfrak":
        return this.parseArgument();
      case "operatorname": case "operatorname*": {
        const fname = restyle(this.parseArgument(), "plain");
        return this.parseFunction(fname, name.endsWith("*"));
      }
      case "overline": case "bar":
        return { t: "bar", pos: "top", body: this.parseArgument() };
      case "underline":
        return { t: "bar", pos: "bot", body: this.parseArgument() };
      case "overset": case "stackrel": {
        const lim = this.parseArgument();
        return { t: "lim", pos: "upp", base: this.parseArgument(), lim };
      }
      case "underset": {
        const lim = this.parseArgument();
        return { t: "lim", pos: "low", base: this.parseArgument(), lim };
      }
      case "overbrace": case "underbrace":
        return this.parseArgument();
      case "boxed": case "fbox": case "framebox":
        return { t: "box", body: this.parseArgument() };
      case "color":
        this.readRawGroup();
        return null;
      case "textcolor": case "colorbox":
        this.readRawGroup();
        return this.parseArgument();
      case "phantom": case "hphantom": case "vphantom":
        this.parseArgument();
        return null;
      case "hspace": case "hspace*": case "hskip": case "kern": case "mkern": case "mspace":
        this.readRawGroup();
        return run(" ");
      case "pmod": {
        const body = this.parseArgument();
        return { t: "delim", open: "(", close: ")", body: row([run("mod", "plain"), run(" "), body]) };
      }
      case "bmod": case "mod":
        return run(" mod ", "plain");
      case "begin":
        return this.parseEnvironment(this.readRawGroup().trim());
      case "end":
        this.readRawGroup();
        return null;
      default:
        break;
    }
    if (SIZED_DELIMITERS.has(name)) return run(this.readDelimiter());
    if (name in ACCENTS) return { t: "acc", chr: ACCENTS[name], body: this.parseArgument() };
    if (name in NARY) return this.parseNary(NARY[name]);
    if (FUNCTIONS.has(name)) return this.parseFunction(run(name, "plain"), false);
    if (LIMIT_FUNCTIONS.has(name)) return this.parseFunction(run(LIMIT_NAMES[name] ?? name, "plain"), true);

    this.unsupported.add(name);
    return run(name, "plain");
  }

  /** `\log_2 56`, `\sin^2 x`, `\lim_{x\to0} f(x)`: the name with its scripts, then one argument. */
  private parseFunction(name: MathNode, limits: boolean): MathNode {
    let fname = name;
    for (;;) {
      this.skipSpaces();
      if (this.peek() === "\\" && /^(limits|nolimits)(?![A-Za-z])/.test(this.s.slice(this.i + 1))) {
        this.readCommand();
        continue;
      }
      const ch = this.peek();
      if (ch !== "_" && ch !== "^") break;
      this.i += 1;
      const script = this.parseArgument();
      if (limits && ch === "_") {
        fname = { t: "lim", pos: "low", base: fname, lim: script };
      } else {
        fname = withScript(fname, ch === "^" ? "sup" : "sub", script);
      }
    }
    const arg = this.parseFunctionArgument();
    return arg ? { t: "func", name: fname, arg } : fname;
  }

  private parseFunctionArgument(): MathNode | null {
    // Spacing between a function and its argument (\log_2\, 8) is the function's own spacing.
    for (;;) {
      this.skipSpaces();
      const spacing = this.s.slice(this.i).match(/^\\(?:[,;:! ]|quad(?![A-Za-z])|qquad(?![A-Za-z]))/);
      if (!spacing) break;
      this.i += spacing[0].length;
    }
    const ch = this.peek();
    if (!ch || ch === "}" || ch === "&" || ch === "^" || ch === "_" || NO_ARGUMENT_AFTER.test(ch)) return null;
    if (ch === "\\") {
      const rest = this.s.slice(this.i + 1);
      if (/^(right|end|\\)(?![A-Za-z])/.test(rest)) return null;
      const word = rest.match(/^[A-Za-z]+/)?.[0] ?? rest[0];
      if (word && (SYMBOLS[word] && /^[=<>≤≥≠≈∼≡→⇒⇔∈∉⊂⊆∪∩±∓×÷⋅∘]$/.test(SYMBOLS[word]))) return null;
    }
    let argument: MathNode | null;
    if (OPEN_BRACKETS[ch]) {
      this.i += 1;
      const body = this.parseRow({ bracket: true });
      const close = CLOSE_BRACKETS[this.peek()] ? this.s[this.i++] : "";
      argument = { t: "delim", open: ch, close, body: row(body) };
    } else {
      argument = this.parseAtom(false);
    }
    if (!argument) return null;
    // Scripts on the argument stay with it: \sin x^2.
    for (;;) {
      const save = this.i;
      this.skipSpaces();
      const next = this.peek();
      if (next !== "^" && next !== "_") {
        this.i = save;
        break;
      }
      this.i += 1;
      argument = withScript(argument, next === "^" ? "sup" : "sub", this.parseArgument());
    }
    return argument;
  }

  private parseNary(spec: { chr: string; under: boolean }): MathNode {
    let sub: MathNode | undefined;
    let sup: MathNode | undefined;
    let under = spec.under;
    for (;;) {
      this.skipSpaces();
      if (this.peek() === "\\" && /^(limits|nolimits)(?![A-Za-z])/.test(this.s.slice(this.i + 1))) {
        under = this.readCommand() === "limits";
        continue;
      }
      const ch = this.peek();
      if (ch !== "_" && ch !== "^") break;
      this.i += 1;
      if (ch === "_") sub = this.parseArgument();
      else sup = this.parseArgument();
    }
    const body = this.parseFunctionArgument() ?? EMPTY;
    return { t: "nary", chr: spec.chr, sub, sup, body, under };
  }

  private parseEnvironment(name: string): MathNode {
    if (name === "array" || name === "alignedat") this.readRawGroup(); // column spec / column count
    const rows: MathNode[][] = [];
    let cells: MathNode[] = [];
    for (;;) {
      const cell = this.parseRow({ env: true });
      cells.push(row(cell));
      const ch = this.peek();
      if (ch === "&") {
        this.i += 1;
        continue;
      }
      if (ch === "\\" && this.peek(1) === "\\") {
        this.i += 2;
        if (this.peek() === "[") this.readUntil("]"); // \\[2mm]
        rows.push(cells);
        cells = [];
        continue;
      }
      if (ch === "\\" && /^end(?![A-Za-z])/.test(this.s.slice(this.i + 1))) {
        this.readCommand();
        this.readRawGroup();
      }
      rows.push(cells);
      break;
    }
    const filled = rows.filter((cellsOfRow) => cellsOfRow.some((cell) => !isEmpty(cell)));
    if (CASES_ENVS.has(name)) {
      const eqarr: MathNode = { t: "eqarr", rows: filled.map((cellsOfRow) => joinCells(cellsOfRow, run(" "))) };
      return name === "rcases"
        ? { t: "delim", open: "", close: "}", body: eqarr }
        : { t: "delim", open: "{", close: "", body: eqarr };
    }
    if (ALIGN_ENVS.has(name)) return { t: "eqarr", rows: filled.map((cellsOfRow) => joinCells(cellsOfRow, null)) };
    if (!(name in ENV_DELIMITERS)) this.unsupported.add(`env:${name}`);
    const [open, close] = ENV_DELIMITERS[name] ?? ["", ""];
    const matrix: MathNode = { t: "matrix", rows: filled.length ? filled : [[EMPTY]] };
    return open || close ? { t: "delim", open, close, body: matrix } : matrix;
  }

  private readUntil(end: string) {
    while (this.i < this.s.length && this.s[this.i] !== end) this.i += 1;
    this.i += 1;
  }
}

function charRun(ch: string): MathNode {
  if (ch === "-") return run("−");
  if (ch === "*") return run("∗");
  return run(ch);
}

function lastRunText(items: MathNode[]): string {
  const last = items[items.length - 1];
  return last?.t === "run" && last.style === "math" ? last.text : "";
}

function isEmpty(node: MathNode): boolean {
  return node.t === "row" && node.items.length === 0;
}

function joinCells(cells: MathNode[], separator: MathNode | null): MathNode {
  const items: MathNode[] = [];
  cells.forEach((cell, index) => {
    if (index > 0 && separator) items.push(separator);
    items.push(cell);
  });
  return row(items);
}

function withScript(base: MathNode, kind: "sub" | "sup", script: MathNode): MathNode {
  if (base.t === "scripts" && !base[kind]) return { ...base, [kind]: script };
  return { t: "scripts", base, [kind]: script };
}

function attachScript(items: MathNode[], kind: "sub" | "sup", script: MathNode) {
  const base = items.pop() ?? EMPTY;
  // A script after a run of digits or letters belongs to its last character only when letters
  // are involved (ab^2 is a·b²); a number keeps all its digits (10^2).
  if (base.t === "run" && base.style === "math" && base.text.length > 1 && !/^[0-9.,]+$/.test(base.text)) {
    const chars = Array.from(base.text);
    const lastChar = chars.pop() as string;
    items.push(run(chars.join(""), base.style));
    items.push(withScript(run(lastChar, base.style), kind, script));
    return;
  }
  items.push(withScript(base, kind, script));
}

function mergeRuns(items: MathNode[]): MathNode[] {
  const merged: MathNode[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (item.t === "row") {
      // Inline groups ({...} that are not an argument) flatten into the row.
      merged.push(...item.items);
      continue;
    }
    if (item.t === "run" && last?.t === "run" && last.style === item.style) {
      merged[merged.length - 1] = run(last.text + item.text, item.style);
      continue;
    }
    merged.push(item);
  }
  return merged;
}

function restyle(node: MathNode, style: MathStyle): MathNode {
  switch (node.t) {
    case "run":
      return node.style === "text" ? node : run(node.text, style);
    case "row":
      return { t: "row", items: node.items.map((item) => restyle(item, style)) };
    default:
      return node;
  }
}

function mapLetters(node: MathNode, map: (letter: string) => string): MathNode {
  if (node.t === "run") return run(Array.from(node.text).map((ch) => (/[A-Za-z]/.test(ch) ? map(ch) : ch)).join(""), "plain");
  if (node.t === "row") return { t: "row", items: node.items.map((item) => mapLetters(item, map)) };
  return node;
}

function doubleStruck(letter: string): string {
  const code = letter.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d538 + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d552 + code - 97);
  return letter;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\([%$#&_{}])/g, "$1")
    .replace(/\\(?:,|;|:|!| |quad|qquad)/g, " ")
    .replace(/~/g, " ")
    .replace(/\\[A-Za-z]+\s*/g, (command) => {
      const name = command.slice(1).trim();
      return GREEK[name] ?? SYMBOLS[name] ?? "";
    })
    .replace(/[{}$]/g, "");
}

export function parseLatex(latex: string): { node: MathNode; unsupported: string[] } {
  const parser = new LatexParser(latex || "");
  const node = parser.parse();
  return { node, unsupported: Array.from(parser.unsupported) };
}

// ---------------------------------------------------------------------------------------------
// OMML

export interface OmmlOptions {
  /** Font size in hundredths of a point (2400 = 24 pt). */
  size: number;
  /** Text colour, hex without #. */
  color?: string;
  lang?: string;
}

const MATH_FONT = '<a:latin typeface="Cambria Math" panose="02040503050406030204" pitchFamily="18" charset="0"/>'
  + '<a:ea typeface="Cambria Math" panose="02040503050406030204" pitchFamily="18" charset="0"/>'
  + '<a:cs typeface="Cambria Math" panose="02040503050406030204" pitchFamily="18" charset="0"/>';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 cannot carry at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

function runProperties(options: OmmlOptions, italic: boolean, bold = false): string {
  const fill = options.color ? `<a:solidFill><a:srgbClr val="${options.color}"/></a:solidFill>` : "";
  return `<a:rPr lang="${options.lang ?? "kk-KZ"}" sz="${options.size}"${bold ? ' b="1"' : ""} i="${italic ? 1 : 0}" dirty="0">${fill}${MATH_FONT}</a:rPr>`;
}

function ctrl(options: OmmlOptions): string {
  return `<m:ctrlPr>${runProperties(options, true)}</m:ctrlPr>`;
}

/** PowerPoint stores italic math letters as the Unicode mathematical italic characters. */
export function mathItalic(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code === 0x68) out += "ℎ";
    else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(0x1d44e + code - 0x61);
    else if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(0x1d434 + code - 0x41);
    else if (code >= 0x3b1 && code <= 0x3c9) out += String.fromCodePoint(0x1d6fc + code - 0x3b1);
    else out += ch;
  }
  return out;
}

const ITALIC_LETTERS = /[A-Za-zα-ω]+/g;

function singleRun(text: string, style: MathStyle, options: OmmlOptions, italic: boolean): string {
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  // \text is upright math too: PowerPoint can draw a stray dash beside "normal text" (m:nor).
  const styleProps = style === "math"
    ? ""
    : style === "bold"
      ? '<m:sty m:val="b"/>'
      : '<m:sty m:val="p"/>';
  const mathProps = styleProps ? `<m:rPr>${styleProps}</m:rPr>` : "";
  return `<m:r>${mathProps}${runProperties(options, italic, style === "bold")}<m:t${space}>${escapeXml(text)}</m:t></m:r>`;
}

/**
 * Math runs are split where letters meet digits or operators, as PowerPoint itself stores them:
 * PowerPoint does not draw an italic letter that shares a run with "3" or "+" (3𝑎−4𝑏 shows 3−4).
 */
function runXml(node: { text: string; style: MathStyle }, options: OmmlOptions): string {
  if (!node.text) return "";
  if (node.style !== "math") return singleRun(node.text, node.style, options, false);
  const pieces: Array<{ text: string; italic: boolean }> = [];
  let cursor = 0;
  for (const match of node.text.matchAll(ITALIC_LETTERS)) {
    const at = match.index ?? 0;
    if (at > cursor) pieces.push({ text: node.text.slice(cursor, at), italic: false });
    pieces.push({ text: mathItalic(match[0]), italic: true });
    cursor = at + match[0].length;
  }
  if (cursor < node.text.length) pieces.push({ text: node.text.slice(cursor), italic: false });
  return pieces.map((piece) => singleRun(piece.text, "math", options, piece.italic)).join("");
}

function chrAttr(tag: string, value: string): string {
  return `<m:${tag} m:val="${escapeXml(value)}"/>`;
}

export function mathNodeToOmml(node: MathNode, options: OmmlOptions): string {
  const o = (child: MathNode | undefined) => (child ? mathNodeToOmml(child, options) : "");
  switch (node.t) {
    case "run":
      return runXml(node, options);
    case "row":
      return node.items.map(o).join("");
    case "frac":
      return `<m:f><m:fPr>${node.noBar ? chrAttr("type", "noBar") : ""}${ctrl(options)}</m:fPr>`
        + `<m:num>${o(node.num)}</m:num><m:den>${o(node.den)}</m:den></m:f>`;
    case "rad":
      return `<m:rad><m:radPr>${node.index ? "" : chrAttr("degHide", "on")}${ctrl(options)}</m:radPr>`
        + `<m:deg>${o(node.index)}</m:deg><m:e>${o(node.body)}</m:e></m:rad>`;
    case "scripts": {
      if (node.sub && node.sup) {
        return `<m:sSubSup><m:sSubSupPr>${ctrl(options)}</m:sSubSupPr><m:e>${o(node.base)}</m:e>`
          + `<m:sub>${o(node.sub)}</m:sub><m:sup>${o(node.sup)}</m:sup></m:sSubSup>`;
      }
      if (node.sub) {
        return `<m:sSub><m:sSubPr>${ctrl(options)}</m:sSubPr><m:e>${o(node.base)}</m:e><m:sub>${o(node.sub)}</m:sub></m:sSub>`;
      }
      return `<m:sSup><m:sSupPr>${ctrl(options)}</m:sSupPr><m:e>${o(node.base)}</m:e><m:sup>${o(node.sup)}</m:sup></m:sSup>`;
    }
    case "delim": {
      const begin = node.open === "(" ? "" : chrAttr("begChr", node.open);
      const end = node.close === ")" ? "" : chrAttr("endChr", node.close);
      return `<m:d><m:dPr>${begin}${end}${ctrl(options)}</m:dPr><m:e>${o(node.body)}</m:e></m:d>`;
    }
    case "func":
      return `<m:func><m:funcPr>${ctrl(options)}</m:funcPr><m:fName>${o(node.name)}</m:fName><m:e>${o(node.arg)}</m:e></m:func>`;
    case "acc":
      return `<m:acc><m:accPr>${chrAttr("chr", node.chr)}${ctrl(options)}</m:accPr><m:e>${o(node.body)}</m:e></m:acc>`;
    case "bar":
      return `<m:bar><m:barPr>${chrAttr("pos", node.pos)}${ctrl(options)}</m:barPr><m:e>${o(node.body)}</m:e></m:bar>`;
    case "nary":
      return `<m:nary><m:naryPr>${chrAttr("chr", node.chr)}${chrAttr("limLoc", node.under ? "undOvr" : "subSup")}`
        + `${node.sub ? "" : chrAttr("subHide", "on")}${node.sup ? "" : chrAttr("supHide", "on")}${ctrl(options)}</m:naryPr>`
        + `<m:sub>${o(node.sub)}</m:sub><m:sup>${o(node.sup)}</m:sup><m:e>${o(node.body)}</m:e></m:nary>`;
    case "lim": {
      const tag = node.pos === "low" ? "limLow" : "limUpp";
      return `<m:${tag}><m:${tag}Pr>${ctrl(options)}</m:${tag}Pr><m:e>${o(node.base)}</m:e><m:lim>${o(node.lim)}</m:lim></m:${tag}>`;
    }
    case "matrix": {
      const columns = Math.max(1, ...node.rows.map((cells) => cells.length));
      const rows = node.rows
        .map((cells) => {
          const padded = [...cells, ...Array.from({ length: columns - cells.length }, () => EMPTY)];
          return `<m:mr>${padded.map((cell) => `<m:e>${o(cell)}</m:e>`).join("")}</m:mr>`;
        })
        .join("");
      return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr>${chrAttr("count", String(columns))}${chrAttr("mcJc", "center")}</m:mcPr></m:mc></m:mcs>`
        + `${ctrl(options)}</m:mPr>${rows}</m:m>`;
    }
    case "eqarr":
      // The lines of a system, one under the other. PowerPoint centres them, as in its own
      // "cases" template; it ignores alignment points and matrix column alignment here.
      return `<m:eqArr><m:eqArrPr>${ctrl(options)}</m:eqArrPr>${node.rows.map((line) => `<m:e>${o(line)}</m:e>`).join("")}</m:eqArr>`;
    case "box":
      return `<m:borderBox><m:borderBoxPr>${ctrl(options)}</m:borderBoxPr><m:e>${o(node.body)}</m:e></m:borderBox>`;
  }
}

// ---------------------------------------------------------------------------------------------
// Linear text

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "−": "⁻", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", "′": "′", "″": "″", "∘": "°",
};
const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "−": "₋", "-": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", i: "ᵢ", x: "ₓ", k: "ₖ", m: "ₘ",
};

function scriptText(node: MathNode, table: Record<string, string>, marker: string): string {
  const text = mathNodeToText(node);
  const chars = Array.from(text);
  if (chars.length && chars.every((ch) => table[ch])) return chars.map((ch) => table[ch]).join("");
  return chars.length === 1 ? `${marker}${text}` : `${marker}(${text})`;
}

function isSimple(node: MathNode): boolean {
  return node.t === "run" ? !/[+−\-=<>,;: ]/.test(node.text) : node.t !== "row" && node.t !== "frac" && node.t !== "func";
}

function wrap(node: MathNode): string {
  const text = mathNodeToText(node);
  return isSimple(node) ? text : `(${text})`;
}

export function mathNodeToText(node: MathNode): string {
  switch (node.t) {
    case "run":
      return node.text;
    case "row":
      return node.items.map(mathNodeToText).join("");
    case "frac":
      return `${wrap(node.num)}/${wrap(node.den)}`;
    case "rad": {
      const index = node.index ? mathNodeToText(node.index) : "";
      const sign = index === "" ? "√" : index === "3" ? "∛" : index === "4" ? "∜" : `${scriptText(node.index as MathNode, SUPERSCRIPTS, "^")}√`;
      return `${sign}${wrap(node.body)}`;
    }
    case "scripts":
      return `${wrap(node.base)}${node.sub ? scriptText(node.sub, SUBSCRIPTS, "_") : ""}${node.sup ? scriptText(node.sup, SUPERSCRIPTS, "^") : ""}`;
    case "delim":
      return `${node.open}${mathNodeToText(node.body)}${node.close}`;
    case "func": {
      const arg = mathNodeToText(node.arg);
      return `${mathNodeToText(node.name)}${node.arg.t === "delim" ? "" : " "}${arg}`;
    }
    case "acc":
      return `${mathNodeToText(node.body)}${node.chr}`;
    case "bar":
      return Array.from(mathNodeToText(node.body)).map((ch) => `${ch}${node.pos === "top" ? "̅" : "̲"}`).join("");
    case "nary":
      return `${node.chr}${node.sub ? scriptText(node.sub, SUBSCRIPTS, "_") : ""}${node.sup ? scriptText(node.sup, SUPERSCRIPTS, "^") : ""} ${mathNodeToText(node.body)}`;
    case "lim":
      return node.pos === "low"
        ? `${mathNodeToText(node.base)}${scriptText(node.lim, SUBSCRIPTS, "_")}`
        : `${mathNodeToText(node.base)}${scriptText(node.lim, SUPERSCRIPTS, "^")}`;
    case "matrix":
      return node.rows.map((cells) => cells.map(mathNodeToText).join(" ")).join("; ");
    case "eqarr":
      return node.rows.map(mathNodeToText).join("; ");
    case "box":
      return mathNodeToText(node.body);
  }
}

/** One formula: `<m:oMath>` for PowerPoint, the same formula as text, and the commands it did not know. */
/** A formula that starts with a sign ("−3"): after a label PowerPoint would space it as minus. */
function startsWithSign(node: MathNode): boolean {
  const first = node.t === "row" ? node.items[0] : node;
  return first?.t === "run" && /^[−+±∓]/.test(first.text);
}

export function latexToOmml(
  latex: string,
  options: OmmlOptions,
): { omml: string; inner: string; text: string; unsupported: string[] } {
  const { node, unsupported } = parseLatex(latex);
  // A box makes the sign unary again: "A) −3", not "A) − 3".
  const inner = startsWithSign(node)
    ? `<m:box><m:boxPr>${ctrl(options)}</m:boxPr><m:e>${mathNodeToOmml(node, options)}</m:e></m:box>`
    : mathNodeToOmml(node, options);
  return { omml: `<m:oMath>${inner}</m:oMath>`, inner, text: mathNodeToText(node), unsupported };
}
