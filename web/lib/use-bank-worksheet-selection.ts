'use client';

import { useRef, useState } from 'react';
import type { BankTask } from '@/types';
import { MAX_WORKSHEET_TASKS } from './bank-worksheet';

export function useBankWorksheetSelection(email: string | null) {
  const [state, setState] = useState<{ owner: string | null; tasks: BankTask[] }>({ owner: email, tasks: [] });
  const activeOwner = useRef(email);
  activeOwner.current = email;
  const selected = state.owner === email ? state.tasks : [];
  const update = (change: (tasks: BankTask[]) => BankTask[]) => setState((previous) => activeOwner.current !== email
    ? previous : { owner: email, tasks: change(previous.owner === email ? previous.tasks : []) });
  return {
    selected,
    toggle: (task: BankTask) => update((tasks) => tasks.some((item) => item.id === task.id)
      ? tasks.filter((item) => item.id !== task.id)
      : tasks.length < MAX_WORKSHEET_TASKS ? [...tasks, task] : tasks),
    togglePage: (page: BankTask[]) => update((tasks) => {
      const ids = new Set(tasks.map((task) => task.id));
      if (page.every((task) => ids.has(task.id))) {
        const pageIds = new Set(page.map((task) => task.id));
        return tasks.filter((task) => !pageIds.has(task.id));
      }
      const combined = [...tasks, ...page.filter((task) => !ids.has(task.id))];
      return combined.length <= MAX_WORKSHEET_TASKS ? combined : tasks;
    }),
    remove: (id: number) => update((tasks) => tasks.filter((task) => task.id !== id)),
    clear: () => update(() => []),
    move: (id: number, direction: -1 | 1) => update((tasks) => {
      const index = tasks.findIndex((task) => task.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= tasks.length) return tasks;
      const reordered = [...tasks];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    }),
  };
}
