import { isFactorGridComplete, parseFactorGridAnswer } from "./factor-grid";
import { getTaskMcqCorrectCount, isMcqAnswerComplete } from "./question-options";
import type { LessonTask } from "@/types";

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
    return isSelectAnswerComplete(value);
  }
  if (task.question_type === "factor_grid") {
    return isFactorGridComplete(parseFactorGridAnswer(value));
  }
  if (task.question_type === "mcq" || task.question_type === "mcq6") {
    return isMcqAnswerComplete(value, getTaskMcqCorrectCount(task));
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
