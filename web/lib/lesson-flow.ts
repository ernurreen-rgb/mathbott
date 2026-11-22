export type LessonFlowTask = { id: number; solved: boolean };

/**
 * Task that "Келесі" opens: the first unsolved task after the current one, then,
 * wrapping round, the first unsolved one before it, then the current task itself
 * when it is the only one left. Solved tasks are skipped, so after the first pass
 * the student goes straight from one mistake to the next. Null once all are solved.
 */
export function pickNextTaskId(
  tasks: LessonFlowTask[],
  currentIndex: number,
  options?: { browseCompleted?: boolean }
): number | null {
  if (options?.browseCompleted && tasks.length > 0 && tasks.every((task) => task.solved)) {
    const next = tasks[currentIndex + 1];
    return next ? next.id : null;
  }
  const after = tasks.slice(currentIndex + 1).find((task) => !task.solved);
  if (after) return after.id;
  const before = tasks.slice(0, Math.max(0, currentIndex)).find((task) => !task.solved);
  if (before) return before.id;
  const current = tasks[currentIndex];
  return current && !current.solved ? current.id : null;
}

export type LessonFlowMini = { id: number; index: number; completed: boolean; pendingReview: number };
export type StepAfterReview =
  | { kind: "mini"; id: number }
  | { kind: "review"; id: number }
  | { kind: "lesson"; id: number }
  | { kind: "section" };

/**
 * Where a finished mistake review leads, so the student goes straight on without an extra
 * screen: the next unfinished mini-lesson (wrapping round), then another mini-lesson's
 * unfinished review, then the next lesson once it is open, otherwise back to the section.
 */
export function pickStepAfterReview(
  minis: LessonFlowMini[],
  reviewedMiniId: number,
  nextLesson: { id: number; locked: boolean } | null | undefined
): StepAfterReview {
  const ordered = [...minis].sort((a, b) => a.index - b.index);
  const at = ordered.findIndex((mini) => mini.id === reviewedMiniId);
  const others = [...ordered.slice(at + 1), ...ordered.slice(0, Math.max(at, 0))];
  const unfinished = others.find((mini) => !mini.completed);
  if (unfinished) return { kind: "mini", id: unfinished.id };
  const review = others.find((mini) => mini.pendingReview > 0);
  if (review) return { kind: "review", id: review.id };
  if (nextLesson && !nextLesson.locked) return { kind: "lesson", id: nextLesson.id };
  return { kind: "section" };
}
