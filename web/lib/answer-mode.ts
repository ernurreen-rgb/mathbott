import type { AnswerMode, QuestionType } from "@/types";

export const supportsAnswerModeSwitch = (questionType?: QuestionType | string | null): boolean =>
  questionType === "mcq" || questionType === "mcq6" || questionType === "select";

export const getTaskAnswerMode = (task: {
  question_type?: QuestionType | string | null;
  answer_mode?: AnswerMode | string | null;
}): AnswerMode => {
  const questionType = task.question_type || "input";
  if (questionType === "input") return "written";
  if (!supportsAnswerModeSwitch(questionType)) return "choices";
  return task.answer_mode === "written" ? "written" : "choices";
};

export const normalizeAnswerModeForQuestionType = (
  answerMode: AnswerMode | string | null | undefined,
  questionType: QuestionType
): AnswerMode => getTaskAnswerMode({ answer_mode: answerMode, question_type: questionType });
