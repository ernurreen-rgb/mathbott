'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPortal } from 'react-dom';
import MathRender from '@/components/ui/MathRender';
import { getAdminBankTask } from '@/lib/api/admin-bank';
import { MAX_WORKSHEET_TASKS, worksheetTask, type WorksheetTask } from '@/lib/bank-worksheet';
import type { BankTask } from '@/types';
import BankWorksheetDocument from './BankWorksheetDocument';

export default function BankWorksheetDialog({ email, tasks, onMove, onRemove, onClose }: {
  email: string;
  tasks: BankTask[];
  onMove: (id: number, direction: -1 | 1) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('Есептер жинағы');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renderTasks, setRenderTasks] = useState<WorksheetTask[]>([]);
  const [renderGeneration, setRenderGeneration] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  const download = async () => {
    if (busy || !tasks.length || tasks.length > MAX_WORKSHEET_TASKS) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError(null);
    setProgress('Есептер жүктелуде...');
    try {
      const fresh: WorksheetTask[] = [];
      // Re-read selected tasks, preserving order and refusing partial/stale exports.
      for (let start = 0; start < tasks.length; start += 4) {
        const group = await Promise.all(tasks.slice(start, start + 4).map(async (task) => {
          const result = await getAdminBankTask(task.id, email);
          if (!result.data || result.error) throw new Error(`Банк №${task.id} есебін жүктеу мүмкін болмады. Қайта көріңіз немесе оны жинақтан алып тастаңыз.`);
          return worksheetTask(result.data);
        }));
        active.signal.throwIfAborted();
        fresh.push(...group);
      }
      flushSync(() => { setRenderTasks(fresh); setRenderGeneration((value) => value + 1); });
      const documentRoot = root.current?.firstElementChild;
      if (!(documentRoot instanceof HTMLElement)) throw new Error('PDF жинағы дайын емес. Қайта көріңіз.');
      const { exportBankWorksheet } = await import('@/lib/export-bank-worksheet');
      await exportBankWorksheet(documentRoot, title, (done, total) => {
        if (!active.signal.aborted) setProgress(`PDF дайындалуда: ${done} / ${total}`);
      }, active.signal);
      if (!active.signal.aborted) onClose();
    } catch (error) {
      if (!active.signal.aborted) setError(error instanceof Error ? error.message : 'PDF құру мүмкін болмады. Қайта көріңіз.');
    } finally {
      if (!active.signal.aborted) { setBusy(false); setProgress(''); }
    }
  };

  return createPortal(<>
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="worksheet-title"
        className="mx-auto max-w-3xl rounded-2xl bg-white p-5 text-gray-900 shadow-xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 id="worksheet-title" className="text-xl font-bold">PDF жинағын дайындау</h2>
            <p className="mt-1 text-sm text-gray-600">{tasks.length} есеп · A4 · Оқушыға арналған, дұрыс жауаптар қосылмайды.</p></div>
          <button type="button" onClick={onClose} aria-label="PDF терезесін жабу" className="rounded-lg px-3 py-2 hover:bg-gray-100">✕</button>
        </div>
        <label className="mb-5 block text-sm font-semibold">Жинақ атауы
          <input value={title} maxLength={120} disabled={busy} onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" />
        </label>
        <ol className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="PDF есептерінің реті">
          {tasks.map((task, index) => <li key={task.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
            <span className="font-bold">{index + 1}.</span>
            <div className="min-w-0 flex-1"><div className="text-xs text-gray-500">Банк №{task.id}</div>
              <div className="line-clamp-3 text-sm"><MathRender latex={task.text} /></div></div>
            <div className="flex shrink-0 gap-1">
              <button type="button" disabled={busy || index === 0} onClick={() => onMove(task.id, -1)} aria-label={`${index + 1}-есепті жоғары жылжыту`} className="rounded border px-2 py-1 disabled:opacity-30">↑</button>
              <button type="button" disabled={busy || index === tasks.length - 1} onClick={() => onMove(task.id, 1)} aria-label={`${index + 1}-есепті төмен жылжыту`} className="rounded border px-2 py-1 disabled:opacity-30">↓</button>
              <button type="button" disabled={busy} onClick={() => onRemove(task.id)} aria-label={`Банк №${task.id} есебін жинақтан алып тастау`} className="rounded border px-2 py-1 text-red-700 disabled:opacity-30">✕</button>
            </div>
          </li>)}
        </ol>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-gray-600">{progress || 'Есептер осы ретпен бір PDF файлына жиналады.'}</p>
          <button type="button" onClick={() => void download()} disabled={busy || !tasks.length}
            className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-700 disabled:opacity-50">
            {busy ? 'PDF дайындалуда...' : 'PDF жүктеу'}
          </button>
        </div>
      </section>
    </div>
    <div ref={root} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 720, pointerEvents: 'none' }}>
      <BankWorksheetDocument key={renderGeneration} title={title} tasks={renderTasks} />
    </div>
  </>, document.body);
}
