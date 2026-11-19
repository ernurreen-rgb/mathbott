// Whether a student's answer is complete enough to check or submit. One rule for the lesson,
// the mistake review, the trial test and the admin preview.
import { getTaskAnswerMode } from "./answer-mode";
import { getTaskMcqCorrectCount, isMcqAnswerComplete } from "./question-options";
import { isWrittenAnswerComplete } from "./written-answer";
import type { LessonTask } from "@/types";

/** A select answer is a JSON pair of option labels, one per subquestion. */
export const isSelectAnswerComplete = (value?: string): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length >= 2 && parsed.every((v) => String(v).trim());
  } catch {
    return false;
  }
};

export const isTaskAnswerComplete = (task: LessonTask, value?: string): boolean => {
  if (task.question_type === "select") {
    return getTaskAnswerMode(task) === "written"
      ? isWrittenAnswerComplete(value, 2)
      : isSelectAnswerComplete(value);
  }
  if (task.question_type === "mcq" || task.question_type === "mcq6") {
    return getTaskAnswerMode(task) === "written"
      ? isWrittenAnswerComplete(value, getTaskMcqCorrectCount(task))
      : isMcqAnswerComplete(value, 1);
  }
  return typeof value === "string" && value.trim().length > 0;
};
