import type { LessonTask } from "@/types";
import { isTrialTaskAnswered } from "@/lib/trial-test-answer";

export type ReviewAnswer = {
  answer?: string;
  correct?: boolean;
  correct_answer?: string;
  task?: LessonTask;
};

export function getReviewTasks(currentTasks: LessonTask[], answers?: Record<number, ReviewAnswer> | null): LessonTask[] {
  const entries = Object.entries(answers || {});
  // Old attempts have no snapshots. Their original content cannot be recovered.
  if (!entries.some(([, result]) => result.task)) return currentTasks;
  const byId = new Map(currentTasks.map((task) => [task.id, task]));
  return entries.flatMap(([id, result]) => {
    const task = result.task || byId.get(Number(id));
    return task ? [{ ...task, id: Number(id) }] : [];
  }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
}

export type ReviewStatus = "correct" | "wrong" | "skipped";

/** Correct, wrong, or left unanswered, for colouring a task number. */
export function getReviewStatus(task: LessonTask, result?: ReviewAnswer | null): ReviewStatus {
  if (result?.correct) return "correct";
  return isTrialTaskAnswered(task, result?.answer) ? "wrong" : "skipped";
}
