"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import BankWorksheetDocument, { type WorksheetAnswer } from "@/components/admin/BankWorksheetDocument";
import Icon from "@/components/ui/Icon";
import { exportTaskCollection, getTaskCollection, updateTaskCollection } from "@/lib/api/constructor";
import { answerKey, customCollectionTitle, downloadCollectionPptx, reorderItems, worksheetTasks } from "@/lib/constructor-export";
import type { WorksheetTask } from "@/lib/bank-worksheet";
import { useI18n } from "@/lib/i18n/provider";
import { DEFAULT_PPTX_FONT, isPptxFont, PPTX_FONTS, type PptxFont } from "@/lib/pptx/fonts";
import type { ConstructorTask, TaskCollection, TaskCollectionSummary } from "@/types/constructor";
import BackgroundPicker from "./BackgroundPicker";
import TaskBrowser from "./TaskBrowser";
import TaskPreview from "./TaskPreview";

const MAX_TASKS = 100;
const SAVE_DELAY_MS = 800;

type SaveState = "saved" | "dirty" | "saving" | "error";
type Step = "pick" | "files";
type Draft = { title: string; header: string; font: PptxFont; ids: number[] };
type PdfDocument = { title: string; brand: string; tasks: WorksheetTask[]; answers: WorksheetAnswer[] };

const snapshot = (draft: Draft) => JSON.stringify([customCollectionTitle(draft.title), draft.header.trim(), draft.font, draft.ids]);

const isChunkLoadError = (problem: unknown): boolean =>
  problem instanceof Error &&
  (problem.name === "ChunkLoadError" ||
    /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(problem.message));

export default function CollectionEditor({ collectionId, email, author }: { collectionId: number; email: string; author: string }) {
  const { t, locale } = useI18n();
  const [collection, setCollection] = useState<TaskCollection | null>(null);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [title, setTitle] = useState("");
  const [font, setFont] = useState<PptxFont>(DEFAULT_PPTX_FONT);
  const [header, setHeader] = useState("");
  const [tasks, setTasks] = useState<ConstructorTask[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [step, setStep] = useState<Step>("pick");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"pdf" | "pptx" | null>(null);
  const [progress, setProgress] = useState("");
  const [downloadError, setDownloadError] = useState<{ message: string; reload?: boolean } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);

  const draft = useRef<Draft>({ title: "", header: "", font: DEFAULT_PPTX_FONT, ids: [] });
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const defaultTitleRef = useRef(t("constructor.defaultTitle"));
  const saved = useRef("");
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));
  const pdfRoot = useRef<HTMLDivElement>(null);
  const selectionListRef = useRef<HTMLOListElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ids = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const selectedIds = useMemo(() => new Set(ids), [ids]);
  draft.current = { title, header, font, ids };
  defaultTitleRef.current = t("constructor.defaultTitle");

  useEffect(() => {
    let active = true;
    loadedRef.current = false;
    void getTaskCollection(collectionId, email).then((result) => {
      if (!active) return;
      if (!result.data) {
        setLoadError(result.status === 404 ? "missing" : "failed");
        return;
      }
      const loaded = result.data;
      const initialTitle = customCollectionTitle(loaded.title);
      loadedRef.current = true;
      setCollection(loaded);
      setTitle(initialTitle);
      const loadedFont = isPptxFont(loaded.pptx_font) ? loaded.pptx_font : DEFAULT_PPTX_FONT;
      setHeader(loaded.header_text);
      setFont(loadedFont);
      setTasks(loaded.tasks);
      saved.current = snapshot({
        title: initialTitle, header: loaded.header_text, font: loadedFont, ids: loaded.tasks.map((task) => task.id),
      });
    });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [collectionId, email]);

  /** Save what is on screen, after any save already under way. Resolves false when saving failed. */
  const flush = useCallback((options?: { keepalive?: boolean }): Promise<boolean> => {
    if (!loadedRef.current) return Promise.resolve(true);
    saving.current = saving.current.then(async () => {
      const current = draft.current;
      const key = snapshot(current);
      if (key === saved.current) return true;
      if (mountedRef.current) setSaveState("saving");
      const result = await updateTaskCollection(collectionId, {
        title: current.title.trim() || defaultTitleRef.current,
        header_text: current.header.trim(),
        pptx_font: current.font,
        task_ids: current.ids,
      }, email, options);
      if (!result.data) {
        if (mountedRef.current) setSaveState("error");
        return false;
      }
      const canonicalSavedKey = snapshot({
        title: customCollectionTitle(result.data.title),
        header: current.header,
        font: current.font,
        ids: current.ids,
      });
      saved.current = canonicalSavedKey;
      if (mountedRef.current) {
        setSaveState(snapshot(draft.current) === canonicalSavedKey ? "saved" : "dirty");
      }
      return true;
    });
    return saving.current;
  }, [collectionId, email]);

  useEffect(() => {
    if (!collection) return;
    if (snapshot({ title, header, font, ids }) === saved.current) {
      setSaveState((prev) => (prev === "dirty" ? "saved" : prev));
      return;
    }
    setSaveState("dirty");
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [collection, title, header, font, ids, flush]);

  useEffect(() => {
    mountedRef.current = true;
    const onPageHide = () => {
      void flush({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      dragCleanupRef.current?.();
      window.removeEventListener("pagehide", onPageHide);
      void flush({ keepalive: true });
    };
  }, [flush]);

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
    setTasks((current) => reorderItems(current, index, index + direction));
  };

  const startTaskDrag = (event: React.PointerEvent<HTMLLIElement>, taskId: number) => {
    if (tasks.length < 2) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea")) return;
    // On touch screens, require grabbing the dedicated handle so normal vertical scrolling still works.
    if (event.pointerType === "touch" && !target?.closest("[data-drag-handle]")) return;

    if (event.pointerType === "mouse") {
      event.preventDefault();
    }

    const pointerId = event.pointerId;
    const startY = event.clientY;
    let active = event.pointerType === "touch";
    if (active) {
      setDraggingId(taskId);
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (!active) {
        if (Math.abs(moveEvent.clientY - startY) < 5) return;
        active = true;
        setDraggingId(taskId);
        document.body.style.userSelect = "none";
      }
      moveEvent.preventDefault();

      // Gentle auto-scroll near viewport top/bottom edges.
      const edge = 64;
      if (moveEvent.clientY < edge) {
        window.scrollBy(0, -10);
      } else if (moveEvent.clientY > window.innerHeight - edge) {
        window.scrollBy(0, 10);
      }

      const listEl = selectionListRef.current;
      if (!listEl) return;
      const rows = Array.from(listEl.querySelectorAll<HTMLLIElement>("[data-task-item-id]"));
      const currentIndex = rows.findIndex((row) => Number(row.dataset.taskItemId) === taskId);
      if (currentIndex < 0) return;

      let targetIndex = currentIndex;
      for (let i = 0; i < currentIndex; i += 1) {
        const rect = rows[i].getBoundingClientRect();
        if (moveEvent.clientY < rect.top + rect.height * 0.5) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === currentIndex) {
        for (let i = rows.length - 1; i > currentIndex; i -= 1) {
          const rect = rows[i].getBoundingClientRect();
          if (moveEvent.clientY > rect.top + rect.height * 0.5) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex !== currentIndex) {
        setTasks((current) => {
          const from = current.findIndex((item) => item.id === taskId);
          if (from < 0 || from === targetIndex) return current;
          return reorderItems(current, from, targetIndex);
        });
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.body.style.userSelect = "";
      setDraggingId(null);
      if (dragCleanupRef.current === cleanup) {
        dragCleanupRef.current = null;
      }
    };

    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      cleanup();
    };

    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
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
        const pdfTitle = customCollectionTitle(full.title);
        flushSync(() => setPdfDocument({
          title: pdfTitle,
          brand: full.header_text,
          tasks: worksheetTasks(full.tasks),
          answers: answerKey(full.tasks, locale),
        }));
        const documentRoot = pdfRoot.current?.firstElementChild;
        if (!(documentRoot instanceof HTMLElement)) throw new Error("render");
        const { exportBankWorksheet } = await import("@/lib/export-bank-worksheet");
        await exportBankWorksheet(documentRoot, pdfTitle, onProgress, controller.signal, { author: full.header_text || author });
      }
    } catch (problem) {
      if (!controller.signal.aborted) {
        console.error("Constructor download failed", problem);
        if (isChunkLoadError(problem)) {
          setDownloadError({ message: t("constructor.refreshToDownload"), reload: true });
        } else if (locale === "kk" && problem instanceof Error && /^[А-ЯЁӘҒҚҢӨҰҮҺІ]/.test(problem.message)) {
          setDownloadError({ message: problem.message });
        } else {
          setDownloadError({ message: t("constructor.downloadFailed") });
        }
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
    <main className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:px-6 lg:px-8">
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
            className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-2xl font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-purple-400 focus:bg-white focus:outline-none sm:text-3xl"
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

      <div
        role="tablist"
        aria-label={t("constructor.stepsAria")}
        className="mt-4 inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={step === "pick"}
          onClick={() => setStep("pick")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
            step === "pick" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${step === "pick" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
            1
          </span>
          {t("constructor.stepPick")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={step === "files"}
          disabled={tasks.length === 0 && busy === null}
          onClick={() => setStep("files")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none ${
            step === "files" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${step === "files" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
            2
          </span>
          {t("constructor.stepFiles")}
          {tasks.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${step === "files" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
              {tasks.length}
            </span>
          )}
        </button>
      </div>

      {/* Step 1: full-width task browser (kept mounted so filters and loaded pages stay intact). */}
      <div className={step === "pick" ? "mt-5" : "hidden"}>
        <TaskBrowser email={email} selectedIds={selectedIds} full={tasks.length >= MAX_TASKS} onToggle={toggle} />

        {tasks.length > 0 && (
          <div className="sticky bottom-20 z-20 mt-6 md:bottom-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center gap-2.5 text-sm">
                <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-purple-100 px-2 font-bold text-purple-700">
                  {tasks.length}
                </span>
                <span className="font-semibold text-slate-800">
                  {t("constructor.selectedSummary", { count: tasks.length, max: MAX_TASKS })}
                </span>
                {tasks.length >= MAX_TASKS && (
                  <span className="text-xs text-amber-700">{t("constructor.full", { max: MAX_TASKS })}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("files");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-purple-700"
              >
                {t("constructor.proceedToFiles")}
                <Icon name="arrowRight" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: selected tasks order on the left, file settings and downloads on the right. */}
      {step === "files" && (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <section aria-labelledby="selection-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2.5">
                <h2 id="selection-heading" className="text-lg font-bold text-slate-900">{t("constructor.selection")}</h2>
                <span className="text-sm text-slate-500">{t("constructor.selectionCount", { count: tasks.length, max: MAX_TASKS })}</span>
              </div>
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-100"
              >
                <Icon name="plus" className="h-4 w-4" />
                {t("constructor.addMoreTasks")}
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-500">{t("constructor.selectionEmpty")}</p>
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700"
                >
                  <Icon name="arrowLeft" className="h-4 w-4" />
                  {t("constructor.stepPick")}
                </button>
              </div>
            ) : (
              <ol ref={selectionListRef} className="mt-4 space-y-2.5">
                {tasks.map((task, index) => {
                  const isDragging = draggingId === task.id;
                  return (
                    <li
                      key={task.id}
                      data-task-item-id={task.id}
                      onPointerDown={(event) => startTaskDrag(event, task.id)}
                      title={tasks.length > 1 ? t("constructor.dragToReorder") : undefined}
                      className={`flex items-start gap-2 rounded-xl border p-3 transition-colors ${
                        isDragging
                          ? "relative z-10 cursor-grabbing border-purple-400 bg-purple-50/90 shadow-md ring-2 ring-purple-200"
                          : tasks.length > 1
                            ? "cursor-grab border-slate-100 bg-white hover:border-purple-200 hover:bg-slate-50/60"
                            : "border-slate-100 bg-white"
                      }`}
                    >
                      {tasks.length > 1 && (
                        <span
                          data-drag-handle
                          aria-hidden="true"
                          className="mt-0.5 flex shrink-0 touch-none items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-500"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="5.5" cy="3.5" r="1.25" />
                            <circle cx="10.5" cy="3.5" r="1.25" />
                            <circle cx="5.5" cy="8" r="1.25" />
                            <circle cx="10.5" cy="8" r="1.25" />
                            <circle cx="5.5" cy="12.5" r="1.25" />
                            <circle cx="10.5" cy="12.5" r="1.25" />
                          </svg>
                        </span>
                      )}
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
                  );
                })}
              </ol>
            )}
            {tasks.length >= MAX_TASKS && <p className="mt-2 text-xs text-amber-700">{t("constructor.full", { max: MAX_TASKS })}</p>}
          </section>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <section aria-labelledby="files-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-800">{t("constructor.pptxFont")}</span>
                <select
                  value={font}
                  onChange={(event) => setFont(isPptxFont(event.target.value) ? event.target.value : DEFAULT_PPTX_FONT)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  {PPTX_FONTS.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {/* A sample in the chosen font, as the browser has it; the deck itself only names the font. */}
                <span className="mt-1 block truncate text-base text-slate-800" style={{ fontFamily: `"${font}", Arial, sans-serif` }}>
                  Есеп №1: Аа Әә Ғғ Ұұ 123
                </span>
                <span className="mt-1 block text-xs text-slate-500">{t("constructor.pptxFontHint")}</span>
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
              {downloadError && (
                <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
                  {downloadError.message}
                  {downloadError.reload && (
                    <>
                      {" "}
                      <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
                        {t("constructor.reloadPage")}
                      </button>
                    </>
                  )}
                </p>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* The PDF is drawn from this offscreen document, like the trial-test worksheet. */}
      <div ref={pdfRoot} aria-hidden="true" style={{ position: "fixed", left: "-20000px", top: 0 }}>
        {pdfDocument && (
          <BankWorksheetDocument
            title={pdfDocument.title}
            tasks={pdfDocument.tasks}
            brand={pdfDocument.brand}
            language={locale}
            answerKey={pdfDocument.answers}
            allowEmptyHeader
          />
        )}
      </div>
    </main>
  );
}
