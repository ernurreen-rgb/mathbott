export type MathVirtualKeyboardPreset = "default" | "student";

type MathKeyboardKeycap = {
  label?: string;
  tooltip?: string;
  latex?: string;
  insert?: string;
  class?: string;
  width?: 0.5 | 1 | 1.5 | 2 | 5;
  variants?: string[];
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

const studentMathKeyboard: MathVirtualKeyboardLayout = {
  id: "student-math",
  label: "123",
  tooltip: "Математикалық пернетақта",
  displayEditToolbar: false,
  layers: [
    {
      id: "student-math-main",
      style: `
        .ML__keyboard {
          --keyboard-accent-color: #7c3aed;
          --keyboard-background: #f5f3ff;
          --keyboard-border: #ddd6fe;
          --keycap-background: #ffffff;
          --keycap-background-hover: #faf5ff;
          --keycap-border: #ddd6fe;
          --keycap-border-bottom: #c4b5fd;
          --keycap-text: #312e81;
          --keycap-secondary-background: #ede9fe;
          --keycap-secondary-background-hover: #ddd6fe;
          --keycap-secondary-text: #5b21b6;
          --keycap-secondary-border: #c4b5fd;
          --keycap-secondary-border-bottom: #a78bfa;
        }

        @media (max-width: 640px) {
          .ML__keyboard {
            --keyboard-padding-horizontal: 4px;
            --keyboard-padding-top: 8px;
            --keycap-gap: 4px;
            --keycap-height: 46px;
            --keycap-font-size: 19px;
          }
        }
      `,
      rows: [
        [
          { latex: "\\frac{#@}{#0}", class: "small", tooltip: "Бөлшек" },
          { latex: "\\sqrt{#0}", class: "small", tooltip: "Түбір" },
          { latex: "#@^2", tooltip: "Квадрат" },
          { latex: "#@^{#?}", class: "small", tooltip: "Дәреже" },
          "[(]",
          "[)]",
          { latex: "x", variants: ["y", "z", "a", "b", "n", "t"] },
          { latex: "y", variants: ["x", "z", "a", "b", "n", "t"] },
          { label: "[backspace]", width: 2, class: "action hide-shift" },
        ],
        [
          "7",
          "8",
          "9",
          { latex: "\\div", label: "÷", class: "big-op" },
          "[*]",
          "\\pi",
          "\\%",
          "<",
          ">",
          "[=]",
        ],
        [
          "4",
          "5",
          "6",
          "[+]",
          "[-]",
          { latex: "\\le", label: "≤" },
          { latex: "\\ge", label: "≥" },
          { latex: "\\ne", label: "≠" },
          "[left]",
          "[right]",
        ],
        [
          "1",
          "2",
          "3",
          "0",
          { insert: "{,}", label: ",", tooltip: "Ондық үтір" },
          { insert: ".", label: ".", tooltip: "Ондық нүкте" },
          { latex: "\\in", label: "∈", variants: ["\\notin"], tooltip: "Жиынға тиістілік" },
          {
            latex: "\\mathbb{R}",
            label: "ℝ",
            variants: ["\\mathbb{N}", "\\mathbb{Z}", "\\mathbb{Q}"],
            tooltip: "Нақты сандар жиыны",
          },
          { label: "[hide-keyboard]", width: 2, class: "action" },
        ],
      ],
    },
  ],
};

const studentSetKeyboard: MathVirtualKeyboardLayout = {
  id: "student-sets",
  label: "∪",
  tooltip: "Жиындар мен аралықтар",
  displayEditToolbar: false,
  layers: [
    {
      id: "student-sets-main",
      rows: [
        [
          "[(]",
          "[)]",
          { insert: "[", label: "[" },
          { insert: "]", label: "]" },
          { latex: "\\in", label: "∈" },
          { latex: "\\notin", label: "∉" },
          { latex: "\\cup", label: "∪" },
          { latex: "\\infty", label: "∞" },
          { label: "[backspace]", width: 2, class: "action hide-shift" },
        ],
        [
          { latex: "\\mathbb{R}", label: "ℝ" },
          { latex: "\\mathbb{N}", label: "ℕ" },
          { latex: "\\mathbb{Z}", label: "ℤ" },
          { latex: "\\mathbb{Q}", label: "ℚ" },
          "x",
          "y",
          { insert: "{,}", label: ",", tooltip: "Ондық үтір" },
          { insert: ";", label: ";", tooltip: "Аралық шекараларын бөлу" },
          "[left]",
          "[right]",
        ],
        ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"],
        [
          "[+]",
          "[-]",
          { insert: ".", label: ".", tooltip: "Ондық нүкте" },
          { latex: "\\frac{#@}{#0}", class: "small", tooltip: "Бөлшек" },
          { latex: "\\sqrt{#0}", class: "small", tooltip: "Түбір" },
          "<",
          ">",
          { latex: "\\le", label: "≤" },
          { latex: "\\ge", label: "≥" },
          { label: "[hide-keyboard]", class: "action" },
        ],
      ],
    },
  ],
};

export const STUDENT_MATH_KEYBOARD_LAYOUTS: readonly MathVirtualKeyboardLayout[] = Object.freeze([
  studentMathKeyboard,
  studentSetKeyboard,
]);

export const getMathVirtualKeyboardLayouts = (
  preset: MathVirtualKeyboardPreset
): readonly ("default" | MathVirtualKeyboardLayout)[] =>
  preset === "student" ? STUDENT_MATH_KEYBOARD_LAYOUTS : ["default"];
