import type { ConstructorTask } from "@/types/constructor";

/** A piece of an answer key entry: plain text, or a formula as the bank stores it. */
export type AnswerPiece = { kind: "text"; text: string } | { kind: "math"; latex: string };

export type ConstructorLanguage = "kk" | "ru";

const WORDS: Record<ConstructorLanguage, { true: string; false: string }> = {
  kk: { true: "Дұрыс", false: "Жалған" },
  ru: { true: "Верно", false: "Неверно" },
};

/** Option labels of a choice answer: "C", '["A","C"]' or "A, C". */
export function parseAnswerLabels(answer: string | undefined | null): string[] {
  const value = (answer ?? "").trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
    } catch {
      // not JSON: fall through to the plain forms
    }
  }
  if (/^[A-Fa-f](\s*[,;]\s*[A-Fa-f])*$/.test(value)) return value.split(/\s*[,;]\s*/).map((label) => label.toUpperCase());
  return [value];
}

function optionText(task: ConstructorTask, label: string): string | null {
  return task.options.find((option) => option.label === label)?.text?.trim() || null;
}

function joinPieces(groups: AnswerPiece[][], separator: string): AnswerPiece[] {
  const pieces: AnswerPiece[] = [];
  groups.forEach((group, index) => {
    if (index > 0) pieces.push({ kind: "text", text: separator });
    pieces.push(...group);
  });
  return pieces;
}

function labelOrText(task: ConstructorTask, label: string, written: boolean): AnswerPiece[] {
  if (written) {
    const text = optionText(task, label);
    if (text) return [{ kind: "math", latex: text }];
  }
  return [{ kind: "text", text: label }];
}

/**
 * The correct answer of a task for the answer key. Choice tasks show option labels; a task the
 * student answers in writing (answer_mode "written") shows the option text instead, because its
 * options are not printed.
 */
export function taskAnswerPieces(task: ConstructorTask, language: ConstructorLanguage): AnswerPiece[] {
  const answer = (task.answer ?? "").trim();
  const written = task.answer_mode === "written";
  switch (task.question_type) {
    case "tf": {
      const value = answer.toLowerCase();
      if (["true", "1", "дұрыс", "верно"].includes(value)) return [{ kind: "text", text: WORDS[language].true }];
      if (["false", "0", "жалған", "неверно"].includes(value)) return [{ kind: "text", text: WORDS[language].false }];
      return answer ? [{ kind: "text", text: answer }] : [];
    }
    case "mcq":
    case "mcq6": {
      const labels = parseAnswerLabels(answer);
      return joinPieces(labels.map((label) => labelOrText(task, label, written)), written ? "; " : ", ");
    }
    case "select": {
      const labels = parseAnswerLabels(answer);
      const perSubquestion = task.subquestions.map((subquestion, index) => labels[index] || subquestion.correct || "");
      return joinPieces(
        perSubquestion.map((label, index) => [
          { kind: "text" as const, text: `${String.fromCharCode(65 + index)}–` },
          ...(label ? labelOrText(task, label, written) : [{ kind: "text" as const, text: "?" }]),
        ]),
        "; ",
      );
    }
    default:
      return answer ? [{ kind: "math", latex: answer }] : [];
  }
}
