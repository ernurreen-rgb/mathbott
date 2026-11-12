'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPortal } from 'react-dom';
import MathRender from '@/components/ui/MathRender';
import { getAdminTrialTestTasks } from '@/lib/api/admin-trial-tests';
import {
  MAX_WORKSHEET_TASKS,
  trialPlacementToWorksheetTask,
  type WorksheetTask,
} from '@/lib/bank-worksheet';
import type { BankPlacementTask, TrialTest } from '@/types';
import BankWorksheetDocument from './BankWorksheetDocument';

export default function TrialTestWorksheetDialog({
  test,
  email,
  initialTasks,
  onClose,
}: {
  test: TrialTest;
  email: string;
  initialTasks?: BankPlacementTask[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(test.title || 'Сынақ тесті');
  const [tasks, setTasks] = useState<WorksheetTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renderGeneration, setRenderGeneration] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoadingTasks(true);
      setError(null);
      try {
        let rawTasks: BankPlacementTask[] = [];
        if (initialTasks && initialTasks.length > 0) {
          rawTasks = initialTasks;
        } else {
          const result = await getAdminTrialTestTasks(test.id, email);
          if (result.error) throw new Error(result.error);
          rawTasks = result.data || [];
        }

        // Sort by slot order and filter out completely empty slots
        const valid = [...rawTasks]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .filter((t) => (t.text && t.text.trim().length > 0) || (t.bank_task?.text && t.bank_task.text.trim().length > 0))
          .map(trialPlacementToWorksheetTask);

        if (active) {
          setTasks(valid);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Тест тапсырмаларын жүктеу мүмкін болмады.');
        }
      } finally {
        if (active) {
          setLoadingTasks(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [test.id, email, initialTasks]);

  const onMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;
    setTasks((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const onRemove = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const download = async () => {
    if (busy || !tasks.length || tasks.length > MAX_WORKSHEET_TASKS) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError(null);
    setProgress('PDF дайындалуда...');

    try {
      flushSync(() => {
        setRenderGeneration((value) => value + 1);
      });

      const documentRoot = root.current?.firstElementChild;
      if (!(documentRoot instanceof HTMLElement)) {
        throw new Error('PDF жинағы дайын емес. Қайта көріңіз.');
      }

      const { exportBankWorksheet } = await import('@/lib/export-bank-worksheet');
      await exportBankWorksheet(
        documentRoot,
        title,
        (done, total) => {
          if (!active.signal.aborted) setProgress(`PDF дайындалуда: ${done} / ${total}`);
        },
        active.signal
      );

      if (!active.signal.aborted) onClose();
    } catch (err) {
      if (!active.signal.aborted) {
        setError(err instanceof Error ? err.message : 'PDF құру мүмкін болмады. Қайта көріңіз.');
      }
    } finally {
      if (!active.signal.aborted) {
        setBusy(false);
        setProgress('');
      }
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-3 sm:p-6">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="worksheet-title"
          className="mx-auto max-w-3xl rounded-2xl bg-white p-5 text-gray-900 shadow-xl sm:p-7"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="worksheet-title" className="text-xl font-bold">
                Тестті PDF-ке айналдыру
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                «{test.title}» · {tasks.length} тапсырма · A4 · Оқушыға арналған (дұрыс жауаптар қосылмайды)
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="PDF терезесін жабу"
              className="rounded-lg px-3 py-2 hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          <label className="mb-5 block text-sm font-semibold">
            Жинақ атауы
            <input
              value={title}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
            />
          </label>

          {loadingTasks ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Тапсырмалар жүктелуде...
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Бұл тестте толтырылған тапсырмалар табылмады.
            </div>
          ) : (
            <ol className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="PDF есептерінің реті">
              {tasks.map((task, index) => (
                <li
                  key={`${task.id}-${index}`}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 p-3"
                >
                  <span className="font-bold">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-3 text-sm">
                      <MathRender latex={task.text} />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => onMove(index, -1)}
                      aria-label={`${index + 1}-тапсырманы жоғары жылжыту`}
                      className="rounded border px-2 py-1 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === tasks.length - 1}
                      onClick={() => onMove(index, 1)}
                      aria-label={`${index + 1}-тапсырманы төмен жылжыту`}
                      className="rounded border px-2 py-1 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(index)}
                      aria-label={`${index + 1}-тапсырманы жинақтан алып тастау`}
                      className="rounded border px-2 py-1 text-red-700 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-gray-600">
              {progress || 'Есептер осы ретпен бір PDF файлына жиналады.'}
            </p>
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy || loadingTasks || !tasks.length}
              className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {busy ? 'PDF дайындалуда...' : 'PDF жүктеу'}
            </button>
          </div>
        </section>
      </div>

      <div
        style={{ position: 'fixed', left: '-20000px', top: '0px' }}
        ref={root}
        aria-hidden="true"
      >
        <BankWorksheetDocument key={renderGeneration} title={title} tasks={tasks} />
      </div>
    </>,
    document.body
  );
}
