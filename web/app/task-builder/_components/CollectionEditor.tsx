"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import BankWorksheetDocument, { type WorksheetAnswer } from "@/components/admin/BankWorksheetDocument";
import Icon from "@/components/ui/Icon";
import { exportTaskCollection, getTaskCollection, updateTaskCollection } from "@/lib/api/constructor";
import { answerKey, downloadCollectionPptx, worksheetTasks } from "@/lib/constructor-export";
import type { WorksheetTask } from "@/lib/bank-worksheet";
import { useI18n } from "@/lib/i18n/provider";
import type { ConstructorTask, TaskCollection, TaskCollectionSummary } from "@/types/constructor";
import BackgroundPicker from "./BackgroundPicker";
import TaskBrowser from "./TaskBrowser";
import TaskPreview from "./TaskPreview";

const MAX_TASKS = 100;
const SAVE_DELAY_MS = 800;

type SaveState = "saved" | "dirty" | "saving" | "error";
type Draft = { title: string; header: string; ids: number[] };
type PdfDocument = { title: string; brand: string; tasks: WorksheetTask[]; answers: WorksheetAnswer[] };

const snapshot = (draft: Draft) => JSON.stringify([draft.title.trim(), draft.header.trim(), draft.ids]);

export default function CollectionEditor({ collectionId, email, author }: { collectionId: number; email: string; author: string }) {
  const { t, locale } = useI18n();
  const [collection, setCollection] = useState<TaskCollection | null>(null);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [title, setTitle] = useState("");
  const [header, setHeader] = useState("");
  const [tasks, setTasks] = useState<ConstructorTask[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<"pdf" | "pptx" | null>(null);
  const [progress, setProgress] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);

  const draft = useRef<Draft>({ title: "", header: "", ids: [] });
  const saved = useRef("");
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));
  const pdfRoot = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const ids = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const selectedIds = useMemo(() => new Set(ids), [ids]);
  draft.current = { title, header, ids };

  useEffect(() => {
    let active = true;
    void getTaskCollection(collectionId, email).then((result) => {
      if (!active) return;
      if (!result.data) {
        setLoadError(result.status === 404 ? "missing" : "failed");
        return;
      }
      const loaded = result.data;
      setCollection(loaded);
      setTitle(loaded.title);
      setHeader(loaded.header_text);
      setTasks(loaded.tasks);
      saved.current = snapshot({ title: loaded.title, header: loaded.header_text, ids: loaded.tasks.map((task) => task.id) });
    });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [collectionId, email]);

  /** Save what is on screen, after any save already under way. Resolves false when saving failed. */
  const flush = useCallback((): Promise<boolean> => {
    saving.current = saving.current.then(async () => {
      const current = draft.current;
      const key = snapshot(current);
      if (key === saved.current) return true;
      setSaveState("saving");
      const result = await updateTaskCollection(collectionId, {
        ...(current.title.trim() ? { title: current.title.trim() } : {}),
        header_text: current.header.trim(),
        task_ids: current.ids,
      }, email);
      if (!result.data) {
        setSaveState("error");
        return false;
      }
      saved.current = key;
      setSaveState(snapshot(draft.current) === key ? "saved" : "dirty");
      return true;
    });
    return saving.current;
  }, [collectionId, email]);

  useEffect(() => {
    if (!collection) return;
    if (snapshot({ title, header, ids }) === saved.current) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [collection, title, header, ids, flush]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const toggle = (task: ConstructorTask) => {
    setTasks((current) => {
      if (current.some((item) => item.id === task.id)) return current.filter((item) => item.id !== task.id);
      if (current.length >= MAX_TASKS) return current;
      return [...current, task];
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    setTasks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const onImageChange = (summary: TaskCollectionSummary) => {
    setCollection((current) => (current ? { ...current, title_image: summary.title_image, background_image: summary.background_image } : current));
  };

  /** Save, then read the collection back with answers: the files show exactly what was saved. */
  const exported = async (): Promise<TaskCollection> => {
    if (!(await flush())) throw new Error("save");
    const result = await exportTaskCollection(collectionId, email);
    if (!result.data) throw new Error("export");
    return result.data;
  };

  const download = async (kind: "pdf" | "pptx") => {
    if (busy || !tasks.length) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(kind);
    setDownloadError(null);
    setProgress(t("constructor.preparingShort"));
    const onProgress = (done: number, total: number) => {
      if (!controller.signal.aborted) setProgress(t("constructor.preparing", { done, total }));
    };
    try {
      const full = await exported();
      if (kind === "pptx") {
        await downloadCollectionPptx(full, { language: locale, author: header.trim() || author, signal: controller.signal, onProgress });
      } else {
        flushSync(() => setPdfDocument({
          title: full.title,
          brand: full.header_text,
          tasks: worksheetTasks(full.tasks),
          answers: answerKey(full.tasks, locale),
        }));
        const documentRoot = pdfRoot.current?.firstElementChild;
        if (!(documentRoot instanceof HTMLElement)) throw new Error("render");
        const { exportBankWorksheet } = await import("@/lib/export-bank-worksheet");
        await exportBankWorksheet(documentRoot, full.title, onProgress, controller.signal, { author: full.header_text || author });
      }
    } catch (problem) {
      if (!controller.signal.aborted) {
        console.error("Constructor download failed", problem);
        setDownloadError(t("constructor.downloadFailed"));
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(null);
        setProgress("");
        setPdfDocument(null);
      }
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16 text-center">
        <p className="text-slate-700">{t(loadError === "missing" ? "constructor.notFound" : "constructor.loadError")}</p>
        <Link href="/task-builder" className="mt-4 inline-block font-semibold text-purple-700 hover:underline">{t("constructor.back")}</Link>
      </div>
    );
  }
  if (!collection) {
    return <div className="mx-auto max-w-6xl px-4 pt-6"><div className="h-12 w-72 animate-pulse rounded-xl bg-slate-200/70" /></div>;
  }

  const statusText = {
    saved: t("constructor.saved"),
    dirty: t("constructor.unsaved"),
    saving: t("constructor.saving"),
    error: t("constructor.saveFailed"),
  }[saveState];

  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <Link href="/task-builder" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-purple-700">
        <Icon name="arrowLeft" className="h-4 w-4" />
        {t("constructor.back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("constructor.collectionTitle")}</span>
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("constructor.collectionTitle")}
            className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-2xl font-bold text-slate-900 hover:border-slate-200 focus:border-purple-400 focus:bg-white focus:outline-none sm:text-3xl"
          />
        </label>
        <p role="status" className={`flex items-center gap-1.5 text-sm ${saveState === "error" ? "text-red-700" : "text-slate-500"}`}>
          <Icon name={saveState === "saved" ? "checkCircle" : saveState === "error" ? "alert" : "clock"} className="h-4 w-4" />
          {statusText}
          {saveState === "error" && (
            <button type="button" onClick={() => void flush()} className="font-semibold underline">{t("constructor.retry")}</button>
          )}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="order-2 lg:order-1">
          <TaskBrowser email={email} selectedIds={selectedIds} full={tasks.length >= MAX_TASKS} onToggle={toggle} />
        </div>

        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <section aria-labelledby="selection-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="selection-heading" className="text-lg font-bold text-slate-900">{t("constructor.selection")}</h2>
              <span className="text-sm text-slate-500">{t("constructor.selectionCount", { count: tasks.length, max: MAX_TASKS })}</span>
            </div>
            {tasks.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t("constructor.selectionEmpty")}</p>
            ) : (
              <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1 lg:max-h-[38vh]">
                {tasks.map((task, index) => (
                  <li key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2">
                    <span className="w-6 shrink-0 pt-0.5 text-right text-sm font-bold text-slate-700">{index + 1}.</span>
                    <div className="min-w-0 flex-1"><TaskPreview task={task} compact /></div>
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                        aria-label={t("constructor.moveUpAria", { n: index + 1 })}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                        <Icon name="chevronUp" className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === tasks.length - 1}
                        aria-label={t("constructor.moveDownAria", { n: index + 1 })}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                        <Icon name="chevronDown" className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => toggle(task)}
                        aria-label={t("constructor.removeAria", { n: index + 1 })}
                        className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-700">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {tasks.length >= MAX_TASKS && <p className="mt-2 text-xs text-amber-700">{t("constructor.full", { max: MAX_TASKS })}</p>}
          </section>

          {/* The file settings appear once there is something to download. */}
          {(tasks.length > 0 || busy !== null) && <section aria-labelledby="files-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 id="files-heading" className="text-lg font-bold text-slate-900">{t("constructor.files")}</h2>
            <label className="mt-3 block">
              <span className="text-sm font-semibold text-slate-800">{t("constructor.pdfHeader")}</span>
              <input
                value={header}
                maxLength={120}
                onChange={(event) => setHeader(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
              <span className="mt-1 block text-xs text-slate-500">{t("constructor.pdfHeaderHint")}</span>
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <BackgroundPicker collectionId={collectionId} email={email} kind="title" filename={collection.title_image}
                disabled={busy !== null} onChange={onImageChange} />
              <BackgroundPicker collectionId={collectionId} email={email} kind="background" filename={collection.background_image}
                disabled={busy !== null} onChange={onImageChange} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{t("constructor.imageFormats")}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void download("pdf")}
                disabled={busy !== null || tasks.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm font-bold text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              >
                <Icon name={busy === "pdf" ? "loader" : "file"} className={`h-4 w-4 ${busy === "pdf" ? "animate-spin" : ""}`} />
                {t("constructor.downloadPdf")}
              </button>
              <button
                type="button"
                onClick={() => void download("pptx")}
                disabled={busy !== null || tasks.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                <Icon name={busy === "pptx" ? "loader" : "download"} className={`h-4 w-4 ${busy === "pptx" ? "animate-spin" : ""}`} />
                {t("constructor.downloadPptx")}
              </button>
            </div>
            <p role="status" className="mt-2 text-xs text-slate-500">{progress || t("constructor.downloadHint")}</p>
            {downloadError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{downloadError}</p>}
          </section>}
        </aside>
      </div>

      {/* The PDF is drawn from this offscreen document, like the trial-test worksheet. */}
      <div ref={pdfRoot} aria-hidden="true" style={{ position: "fixed", left: "-20000px", top: 0 }}>
        {pdfDocument && (
          <BankWorksheetDocument
            title={pdfDocument.title}
            tasks={pdfDocument.tasks}
            brand={pdfDocument.brand}
            language={locale}
            answerKey={pdfDocument.answers}
          />
        )}
      </div>
    </main>
  );
}
