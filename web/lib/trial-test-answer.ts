import type { LessonTask } from "@/types";
import { isTaskAnswerComplete } from "./task-answer";

export type TrialAnswersMap = Record<number, string>;

export const getAnsweredTrialTaskCount = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => tasks.reduce((count, task) => count + (isTaskAnswerComplete(task, answers[task.id]) ? 1 : 0), 0);

export const getTrialTaskAnswerProgress = (
  tasks: LessonTask[],
  answers: TrialAnswersMap
): number => (tasks.length > 0 ? (getAnsweredTrialTaskCount(tasks, answers) / tasks.length) * 100 : 0);
