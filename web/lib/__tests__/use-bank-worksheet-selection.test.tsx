import { act, renderHook } from '@testing-library/react';
import { useBankWorksheetSelection } from '../use-bank-worksheet-selection';
import { MAX_WORKSHEET_TASKS } from '../bank-worksheet';
import type { BankTask } from '@/types';

const task = (id: number) => ({ id, text: `Есеп ${id}` } as BankTask);

it('keeps a unique ordered selection across bank pages and supports reordering/removal', () => {
  const { result } = renderHook(() => useBankWorksheetSelection('teacher@e2e.invalid'));
  act(() => result.current.togglePage([task(1), task(2)]));
  act(() => result.current.togglePage([task(2), task(3)]));
  expect(result.current.selected.map(({ id }) => id)).toEqual([1, 2, 3]);
  act(() => result.current.move(3, -1));
  expect(result.current.selected.map(({ id }) => id)).toEqual([1, 3, 2]);
  act(() => result.current.remove(3));
  act(() => result.current.togglePage([task(1), task(2)]));
  expect(result.current.selected).toEqual([]);
});

it('does not expose another account selection and respects the export limit', () => {
  const { result, rerender } = renderHook(({ email }) => useBankWorksheetSelection(email), {
    initialProps: { email: 'first@e2e.invalid' },
  });
  act(() => result.current.togglePage(Array.from({ length: MAX_WORKSHEET_TASKS + 1 }, (_, i) => task(i + 1))));
  expect(result.current.selected).toHaveLength(0); // Never silently select only part of a page.
  act(() => result.current.togglePage(Array.from({ length: MAX_WORKSHEET_TASKS }, (_, i) => task(i + 1))));
  act(() => result.current.toggle(task(999)));
  expect(result.current.selected).toHaveLength(MAX_WORKSHEET_TASKS);
  const oldRemove = result.current.remove;
  rerender({ email: 'second@e2e.invalid' });
  expect(result.current.selected).toEqual([]);
  act(() => result.current.toggle(task(9)));
  act(() => oldRemove(9));
  expect(result.current.selected.map(({ id }) => id)).toEqual([9]);
});
