import { getTaskMcqCorrectCount, isMcqAnswerComplete } from "./question-options";
import type { LessonTask } from "@/types";
import { isWrittenAnswerComplete } from "./written-answer";
import { getTaskAnswerMode } from "./answer-mode";

export type TrialAnswersMap = Record<number, string>;

export const isSelectAnswerComplete = (value?: string): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length >= 2 && parsed.every((v) => String(v).trim());
  } catch {
    return false;
  }
};

export const isTrialTaskAnswerComplete = (task: LessonTask, value?: string): boolean => {
  if (task.question_type === "select") {
    return getTaskAnswerMode(task) === "written"
      ? isWrittenAnswerComplete(value, 2)
      : isSelectAnswerComplete(value);
  }
  if (task.question_type === "mcq" || task.question_type === "mcq6") {
    const requiredCount = getTaskMcqCorrectCount(task);
    return getTaskAnswerMode(task) === "written"
      ? isWrittenAnswerComplete(value, requiredCount)
      : isMcqAnswerComplete(value, requiredCount);
  }
  return typeof value === "string" && value.trim().length > 0;
};

export const getAnsweredTrialTaskCount = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => tasks.reduce((count, task) => count + (isTrialTaskAnswerComplete(task, answers[task.id]) ? 1 : 0), 0);

export const getTrialTaskAnswerProgress = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => (tasks.length > 0 ? (getAnsweredTrialTaskCount(tasks, answers) / tasks.length) * 100 : 0);
