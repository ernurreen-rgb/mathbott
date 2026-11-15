export type LessonFlowTask = { id: number; solved: boolean };

/**
 * Task that "Келесі" opens: the first unsolved task after the current one, then,
 * wrapping round, the first unsolved one before it, then the current task itself
 * when it is the only one left. Solved tasks are skipped, so after the first pass
 * the student goes straight from one mistake to the next. Null once all are solved.
 */
export function pickNextTaskId(tasks: LessonFlowTask[], currentIndex: number): number | null {
  const after = tasks.slice(currentIndex + 1).find((task) => !task.solved);
  if (after) return after.id;
  const before = tasks.slice(0, Math.max(0, currentIndex)).find((task) => !task.solved);
  if (before) return before.id;
  const current = tasks[currentIndex];
  return current && !current.solved ? current.id : null;
}
