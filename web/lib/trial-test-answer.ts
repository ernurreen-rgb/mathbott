import type { LessonTask } from "@/types";
import { getTaskAnswerMode } from "./answer-mode";
import { getTaskMcqCorrectCount, parseMcqAnswerLabels } from "./question-options";
import { parseWrittenAnswerSlots } from "./written-answer";

export type TrialAnswersMap = Record<number, string>;

const hasAnySelectAnswer = (value?: string): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.slice(0, 2).some((item) => String(item || "").trim().length > 0)
    );
  } catch {
    return false;
  }
};

/** Whether the student has provided at least one answer for a trial-test task (partial answers count). */
export const isTrialTaskAnswered = (task: LessonTask, value?: string): boolean => {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  if (task.question_type === "select") {
    return getTaskAnswerMode(task) === "written"
      ? parseWrittenAnswerSlots(value, 2).some((item) => item.trim().length > 0)
      : hasAnySelectAnswer(value);
  }
  if (task.question_type === "mcq" || task.question_type === "mcq6") {
    return getTaskAnswerMode(task) === "written"
      ? parseWrittenAnswerSlots(value, getTaskMcqCorrectCount(task)).some((item) => item.trim().length > 0)
      : parseMcqAnswerLabels(value).length > 0;
  }
  return true;
};

export const collectTrialTestAnswers = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): Record<string, string> => {
  const collected: Record<string, string> = {};
  for (const task of tasks) {
    const value = answers[task.id];
    if (isTrialTaskAnswered(task, value) && value != null) {
      collected[task.id.toString()] = value;
    }
  }
  return collected;
};

export const getAnsweredTrialTaskCount = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => tasks.reduce((count, task) => count + (isTrialTaskAnswered(task, answers[task.id]) ? 1 : 0), 0);

export const getTrialTaskAnswerProgress = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => (tasks.length > 0 ? (getAnsweredTrialTaskCount(tasks, answers) / tasks.length) * 100 : 0);
