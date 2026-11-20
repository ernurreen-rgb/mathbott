import { tr } from "@/lib/i18n/translate";

export type MathVirtualKeyboardPreset = "default" | "student";

type MathKeyboardKeycap = {
  label?: string;
  tooltip?: string;
  latex?: string;
  insert?: string;
  key?: string;
  command?: string | [string, ...unknown[]];
  class?: string;
};

export type MathVirtualKeyboardLayout = {
  id: string;
  label: string;
  tooltip?: string;
  displayEditToolbar?: boolean;
  layers: Array<{
    id: string;
    style?: string;
    rows: Array<Array<string | MathKeyboardKeycap>>;
  }>;
};

export const STUDENT_KEYBOARD_MAIN_LAYER = "student-math-main";
export const STUDENT_KEYBOARD_MORE_LAYER = "student-math-more";
/** Class of the "hide keyboard" key: MathFieldInput also releases the field's focus on it. */
export const STUDENT_KEYBOARD_HIDE_KEY_CLASS = "qm-hide";

/*
 * Student keyboard: two layers on the same 6 x 5 grid, so the keyboard never changes height.
 *
 *   main                                 more (inequalities, intervals, sets)
 *   x   y   pi  (   )   <-               <   >   <=  >=  !=  <-
 *   7   8   9   /   a/b sqrt             7   8   9   (   )   inf
 *   4   5   6   *   x^2 x^n              4   5   6   [   ]   union
 *   1   2   3   -   <-  ->               1   2   3   ;   in  R
 *   0   ,   =   +   hide more            0   -   Z   N   Q   main
 *
 * Every key inserts LaTeX that the answer checker (bot/utils/math_*.py) understands:
 * no functions, no |x| (the checker cannot compare it), no percent sign.
 * No keycap defines `variants`, so there is no long-press panel and no variant markers, and the
 * hover tooltips are hidden (the `tooltip` of a keycap only serves as its aria-label).
 */
const keyboardStyle = `
  .ML__keyboard {
    --keyboard-accent-color: #7c3aed;
    --keyboard-background: #eceef3;
    --keyboard-border: #d6d9e3;
    --keyboard-padding-horizontal: 6px;
    --keyboard-padding-top: 8px;
    --keyboard-padding-bottom: 6px;
    --keycap-gap: 6px;
    --keycap-height: 52px;
    --keycap-font-size: 24px;
    --keycap-glyph-size: 22px;
    --keycap-glyph-size-lg: 26px;
    --box-placeholder-color: #7c3aed;
    --box-placeholder-pressed-color: #ffffff;
  }

  @media (max-width: 400px), (max-height: 700px) {
    .ML__keyboard {
      --keycap-height: 48px;
      --keycap-gap: 5px;
      --keycap-font-size: 22px;
    }
  }

  @media (max-height: 560px) {
    .ML__keyboard {
      --keycap-height: 42px;
    }
  }

  .MLK__shift,
  .ML__keyboard [data-tooltip]::after {
    display: none !important;
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__rows {
    --k-bg: #ffffff;
    --k-bg-hover: #f7f5ff;
    --k-bg-pressed: #7c3aed;
    --k-fg: #1f2430;
    width: 100%;
    max-width: 440px;
    align-self: center;
    align-items: stretch;
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--_keycap-gap);
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div {
    float: none;
    width: auto;
    min-width: 0;
    height: var(--_keycap-height);
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: var(--k-bg);
    color: var(--k-fg);
    box-shadow: 0 1px 0 rgba(31, 36, 48, 0.16), 0 1px 3px rgba(31, 36, 48, 0.08);
    font-size: var(--_keycap-font-size);
    font-weight: 500;
    line-height: 1;
    overflow: hidden;
    transition: background-color 0.08s ease, transform 0.05s ease;
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div .ML__latex {
    font-size: 1.12em;
  }

  @media (hover: hover) {
    :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div:hover {
      background: var(--k-bg-hover);
      color: var(--k-fg);
    }
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.is-pressed,
  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.is-active {
    background: var(--k-bg-pressed);
    color: #ffffff;
    box-shadow: none;
    transform: translateY(1px);
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.qm-fn {
    --k-bg: #e1e4ee;
    --k-bg-hover: #d7dbe8;
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.qm-op {
    --k-bg: #ede9fe;
    --k-bg-hover: #e2dafd;
    --k-fg: #5b21b6;
    font-size: calc(var(--_keycap-font-size) * 1.2);
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.qm-act {
    --k-bg: #d3d7e4;
    --k-bg-hover: #c8cddc;
  }

  :is(#${STUDENT_KEYBOARD_MAIN_LAYER}, #${STUDENT_KEYBOARD_MORE_LAYER}) .MLK__row > div.qm-switch {
    --k-bg: #7c3aed;
    --k-bg-hover: #6d28d9;
    --k-bg-pressed: #5b21b6;
    --k-fg: #ffffff;
    font-size: calc(var(--_keycap-font-size) * 0.75);
    font-weight: 600;
    white-space: nowrap;
  }
`;

// `name` is the accessible name of a key (MathLive uses `tooltip` as aria-label); the visible
// hover tooltip is switched off in the style above.
const digit = (value: string): MathKeyboardKeycap => ({ label: value, latex: value, class: "qm-digit" });
const operator = (latex: string, label: string, name: string): MathKeyboardKeycap => ({
  label,
  latex,
  tooltip: name,
  class: "qm-op",
});
const symbol = (latex: string, name: string): MathKeyboardKeycap => ({ latex, tooltip: name, class: "qm-fn" });
const action = (label: string, name: string): MathKeyboardKeycap => ({ label, tooltip: name, class: "qm-act" });
const switchLayer = (label: string, layer: string, name: string): MathKeyboardKeycap => ({
  label,
  tooltip: name,
  command: ["switchKeyboardLayer", layer],
  class: "qm-switch",
});

// Brackets are plain characters, not MathLive "smart fences": a fence pairs itself and cannot be
// closed by a different delimiter, but intervals such as (-inf; 2] are written exactly like that.
const character = (value: string, name: string, className = "qm-fn"): MathKeyboardKeycap => ({
  insert: value,
  label: value,
  tooltip: name,
  class: className,
});

// `{,}` is a decimal comma (no spacing after it), the form the answer checker expects.
const decimalComma = (): MathKeyboardKeycap => ({
  ...character("{,}", tr("kbd.decimalComma"), "qm-digit"),
  label: ",",
});

const mainLayer = (): MathVirtualKeyboardLayout["layers"][number] => ({
  id: STUDENT_KEYBOARD_MAIN_LAYER,
  style: keyboardStyle,
  rows: [
    [
      symbol("x", "x"),
      symbol("y", "y"),
      symbol("\\pi", tr("kbd.pi")),
      character("(", tr("kbd.openParen")),
      character(")", tr("kbd.closeParen")),
      action("[backspace]", tr("kbd.backspace")),
    ],
    [
      digit("7"),
      digit("8"),
      digit("9"),
      operator("\\div", "&divide;", tr("kbd.divide")),
      symbol("\\frac{#@}{#0}", tr("kbd.fraction")),
      symbol("\\sqrt{#0}", tr("kbd.sqrt")),
    ],
    [
      digit("4"),
      digit("5"),
      digit("6"),
      // Inserts \cdot like the editors' keyboard does: the checker compares expressions it cannot
      // evaluate (e.g. 3\cdot\sqrt{2}) as plain text, so teachers' answers and students' must agree.
      operator("\\cdot", "&times;", tr("kbd.multiply")),
      symbol("#@^2", tr("kbd.square")),
      symbol("#@^{#?}", tr("kbd.power")),
    ],
    [
      digit("1"),
      digit("2"),
      digit("3"),
      operator("-", "&minus;", tr("kbd.minus")),
      action("[left]", tr("kbd.left")),
      action("[right]", tr("kbd.right")),
    ],
    [
      digit("0"),
      decimalComma(),
      operator("=", "=", tr("kbd.equals")),
      operator("+", "+", tr("kbd.plus")),
      { ...action("[hide-keyboard]", tr("kbd.hide")), class: `qm-act ${STUDENT_KEYBOARD_HIDE_KEY_CLASS}` },
      switchLayer("≤ ∞", STUDENT_KEYBOARD_MORE_LAYER, tr("kbd.moreLayer")),
    ],
  ],
});

const moreLayer = (): MathVirtualKeyboardLayout["layers"][number] => ({
  id: STUDENT_KEYBOARD_MORE_LAYER,
  rows: [
    [
      symbol("<", tr("kbd.less")),
      symbol(">", tr("kbd.greater")),
      symbol("\\le", tr("kbd.le")),
      symbol("\\ge", tr("kbd.ge")),
      symbol("\\ne", tr("kbd.ne")),
      action("[backspace]", tr("kbd.backspace")),
    ],
    [
      digit("7"),
      digit("8"),
      digit("9"),
      character("(", tr("kbd.openParen")),
      character(")", tr("kbd.closeParen")),
      symbol("\\infty", tr("kbd.infinity")),
    ],
    [
      digit("4"),
      digit("5"),
      digit("6"),
      character("[", tr("kbd.openBracket")),
      character("]", tr("kbd.closeBracket")),
      symbol("\\cup", tr("kbd.union")),
    ],
    [
      digit("1"),
      digit("2"),
      digit("3"),
      character(";", tr("kbd.semicolon")),
      symbol("\\in", tr("kbd.in")),
      symbol("\\mathbb{R}", tr("kbd.reals")),
    ],
    [
      digit("0"),
      operator("-", "&minus;", tr("kbd.minus")),
      symbol("\\mathbb{Z}", tr("kbd.integers")),
      symbol("\\mathbb{N}", tr("kbd.naturals")),
      symbol("\\mathbb{Q}", tr("kbd.rationals")),
      switchLayer("123", STUDENT_KEYBOARD_MAIN_LAYER, tr("kbd.mainLayer")),
    ],
  ],
});

// MathLive normalizes layers in place, so every assignment gets a fresh copy.
const buildStudentKeyboardLayouts = (): MathVirtualKeyboardLayout[] => [
  {
    id: "student-math",
    label: "123",
    displayEditToolbar: false,
    layers: [mainLayer(), moreLayer()],
  },
];

export const getMathVirtualKeyboardLayouts = (
  preset: MathVirtualKeyboardPreset
): readonly ("default" | MathVirtualKeyboardLayout)[] =>
  preset === "student" ? buildStudentKeyboardLayouts() : ["default"];
