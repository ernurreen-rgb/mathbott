"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";
import StudentTaskPreview from "@/components/admin/StudentTaskPreview";
import UnrecognizedAnswersPanel from "@/components/admin/UnrecognizedAnswersPanel";
import BankWorksheetDialog from "@/components/admin/BankWorksheetDialog";
import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import { hasContentAccess, hasReviewAccess, hasSuperAccess } from "@/lib/admin-access";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { useBankWorksheetSelection } from "@/lib/use-bank-worksheet-selection";
import { getMcqEditorLabels, isMcqQuestionType, serializeMcqAnswerLabels } from "@/lib/question-options";
import { createAdminBankTask, deleteAdminBankTask, getAdminBankCatalog, getAdminBankTask, getAdminBankTasks, getAdminBankTopics, permanentlyDeleteAdminBankTask, restoreAdminBankTask, updateAdminBankTask } from "@/lib/api";
import type { BankCatalogResponse, BankTask, BankTaskUsageItem, BankTaskVersionItem } from "@/types";
import BankLibrary, { type BankLibraryTab } from "./BankLibrary";
import BankTaskForm from "./BankTaskForm";
import BankTaskDetail from "./BankTaskDetail";
import DuplicateDialog from "./DuplicateDialog";
import HistoryDialog from "./HistoryDialog";
import ImportPreviewDialog from "./ImportPreviewDialog";
import JsonEditDialog from "./JsonEditDialog";
import SnapshotDialog from "./SnapshotDialog";
import UsageDialog from "./UsageDialog";
import { createImportActions } from "./createImportActions";
import { createVersionActions } from "./createVersionActions";
import { useBankLibraryPreferences } from "./useBankLibraryPreferences";
import { questionTypeLabel } from "./library-model";
import { buildBankFormPreviewTask, buildMcqOptionsFromBankForm, createEmptyForm, parseTaskToForm, type BankFormState, type ImportPreviewState, type JsonEditState, type PendingDedupState, type SnapshotViewState } from "./model";
import styles from "../BankWorkspace.module.css";

type WorkspaceMode = "view" | "edit" | "student";
const modes: WorkspaceMode[] = ["view", "edit", "student"];
const signature = (form: BankFormState) => JSON.stringify({ ...form, imageFile: form.imageFile ? [form.imageFile.name, form.imageFile.size, form.imageFile.lastModified] : null });

function workspaceUrl(task: number | "new" | null, mode: WorkspaceMode = "view", replace = false) {
  const url = new URL(window.location.href);
  if (task === null) { url.searchParams.delete("task"); url.searchParams.delete("mode"); }
  else { url.searchParams.set("task", String(task)); if (mode === "view") url.searchParams.delete("mode"); else url.searchParams.set("mode", mode); }
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function BankWorkspace() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { access, loading: accessLoading } = useAdminPageAccess("content", status, email);
  const authorized = !accessLoading && !!access?.is_admin && hasContentAccess(access.role);
  const preferences = useBankLibraryPreferences(email);
  const { filters, setFilters } = preferences;
  const worksheet = useBankWorksheetSelection(email);
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const [tab, setTab] = useState<BankLibraryTab>("active");
  const [tasks, setTasks] = useState<BankTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<BankCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState("");
  const [debouncedTopicSearch, setDebouncedTopicSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const listRequest = useRef(0);
  const catalogRequest = useRef(0);
  const [form, setForm] = useState<BankFormState>(createEmptyForm);
  const [baseline, setBaseline] = useState(() => signature(createEmptyForm()));
  const [showForm, setShowForm] = useState(false);
  const [workspaceTask, setWorkspaceTask] = useState<BankTask | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("view");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [formTopicInput, setFormTopicInput] = useState("");
  const [formTopicSuggestions, setFormTopicSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [reloadingForm, setReloadingForm] = useState(false);
  const formGenerationRef = useRef(0);
  const listScroll = useRef(0);
  const leaveApproved = useRef(false);
  const restoreScroll = useRef(false);
  const isDirty = showForm && !workspaceLoading && signature(form) !== baseline;
  const workspaceRef = useRef({ open: showForm, task: workspaceTask, id: editingTaskId, dirty: isDirty, mode: workspaceMode, busy: saving || reloadingForm || workspaceLoading });
  workspaceRef.current = { open: showForm, task: workspaceTask, id: editingTaskId, dirty: isDirty, mode: workspaceMode, busy: saving || reloadingForm || workspaceLoading };
  const [importing, setImporting] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [pendingDedup, setPendingDedup] = useState<PendingDedupState | null>(null);
  const [importPreviewState, setImportPreviewState] = useState<ImportPreviewState | null>(null);
  const [historyTask, setHistoryTask] = useState<BankTask | null>(null);
  const [historyItems, setHistoryItems] = useState<BankTaskVersionItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [snapshotView, setSnapshotView] = useState<SnapshotViewState | null>(null);
  const [jsonEdit, setJsonEdit] = useState<JsonEditState | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [deleteVersionLoadingNo, setDeleteVersionLoadingNo] = useState<number | null>(null);
  const [usageTask, setUsageTask] = useState<BankTask | null>(null);
  const [usageItems, setUsageItems] = useState<BankTaskUsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const formPreviewTask = useMemo(() => ({ ...buildBankFormPreviewTask(form), id: editingTaskId ?? -1 }), [editingTaskId, form]);
  const previewTask = workspaceTask ? { ...workspaceTask, ...formPreviewTask, topics: form.topics, difficulty: form.difficulty } : null;
  const setOffset = useCallback((value: SetStateAction<number>) => setFilters((previous) => ({ ...previous, offset: typeof value === "function" ? value(previous.offset) : value })), [setFilters]);

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 250); return () => clearTimeout(timer); }, [filters.search]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedTopicSearch(topicSearch.trim()), 200); return () => clearTimeout(timer); }, [topicSearch]);
  useEffect(() => () => { listRequest.current += 1; catalogRequest.current += 1; formGenerationRef.current += 1; }, []);
  useEffect(() => {
    if (!form.imageFile) { setFormImagePreview(null); return; }
    const url = URL.createObjectURL(form.imageFile);
    setFormImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);
  useEffect(() => {
    if (!email || !authorized || !formTopicInput.trim()) { setFormTopicSuggestions([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await getAdminBankTopics(email, formTopicInput.trim(), 10);
      if (!cancelled) setFormTopicSuggestions((data?.items || []).filter((name) => !form.topics.includes(name)));
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [email, authorized, formTopicInput, form.topics]);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!leaveApproved.current) { event.preventDefault(); event.returnValue = ""; } };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("Сақталмаған өзгерістер бар. Өзгерістерді сақтамай шығу керек пе?")) { event.preventDefault(); event.stopPropagation(); }
      else leaveApproved.current = true;
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLink, true); leaveApproved.current = false; };
  }, [isDirty]);
  useEffect(() => {
    if (showForm || loading || !restoreScroll.current) return;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top: listScroll.current, behavior: "instant" }); restoreScroll.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [showForm, loading]);

  const fetchTasks = useCallback(async () => {
    const request = ++listRequest.current;
    if (!email || !authorized || !preferences.ready || tab === "answers" || filters.search.trim() !== debouncedSearch) return;
    setLoading(true); setListError(null);
    const { data, error: err } = await getAdminBankTasks(email, {
      search: debouncedSearch, difficulty: filters.difficulty, topics: filters.topics, limit: filters.limit, offset: filters.offset,
      trash: tab === "trash", questionType: filters.questionType, usage: filters.usage,
      hasTopics: filters.hasTopics ? filters.hasTopics === "yes" : undefined, topicMatch: filters.topicMatch, sort: filters.sort,
    });
    if (request !== listRequest.current) return;
    if (err) { setListError(err); setTasks([]); setTotal(0); }
    else if (data) {
      setTasks(data.items || []); setTotal(data.total || 0);
      if (filters.offset > 0 && filters.offset >= data.total) setOffset(data.total ? Math.floor((data.total - 1) / filters.limit) * filters.limit : 0);
    }
    setLoading(false);
  }, [email, authorized, preferences.ready, tab, filters, debouncedSearch, setOffset]);
  const fetchCatalog = useCallback(async () => {
    const request = ++catalogRequest.current;
    if (!email || !authorized) return;
    setCatalogLoading(true);
    const { data, error: err } = await getAdminBankCatalog(email, debouncedTopicSearch);
    if (request !== catalogRequest.current) return;
    setCatalogError(err); if (data) setCatalog(data); setCatalogLoading(false);
  }, [email, authorized, debouncedTopicSearch]);
  useEffect(() => { void fetchTasks(); }, [fetchTasks]);
  useEffect(() => { void fetchCatalog(); }, [fetchCatalog]);

  const populateTask = (task: BankTask, mode: WorkspaceMode) => {
    const next = parseTaskToForm(task);
    setWorkspaceTask(task); setEditingTaskId(task.id); setForm(next); setBaseline(signature(next));
    setWorkspaceMode(task.deleted_at && mode === "edit" ? "view" : mode); setShowForm(true);
    setFormTopicInput(""); setFormTopicSuggestions([]); setPendingDedup(null); setVersionConflict(false); setWorkspaceError(null); setError(null);
  };
  const resetAndHideForm = (updateUrl = true) => {
    formGenerationRef.current += 1; setShowForm(false); setWorkspaceTask(null); setEditingTaskId(null);
    const next = createEmptyForm(); setForm(next); setBaseline(signature(next)); setWorkspaceMode("view");
    setFormTopicInput(""); setFormTopicSuggestions([]); setPendingDedup(null); setVersionConflict(false);
    setReloadingForm(false); setWorkspaceLoading(false); setWorkspaceError(null); setSaving(false); setError(null);
    restoreScroll.current = true;
    if (updateUrl) workspaceUrl(null, "view", true);
  };
  const canLeave = () => !workspaceRef.current.busy && (!workspaceRef.current.dirty || window.confirm("Сақталмаған өзгерістер бар. Өзгерістерді сақтамай шығу керек пе?"));
  const openTask = async (taskOrId: BankTask | number, mode: WorkspaceMode = "view", updateUrl = true) => {
    if (!email || !authorized || !canLeave()) return;
    const id = typeof taskOrId === "number" ? taskOrId : taskOrId.id;
    const generation = ++formGenerationRef.current;
    if (!workspaceRef.current.open) listScroll.current = window.scrollY;
    const cached = typeof taskOrId === "number" ? tasks.find((item) => item.id === id) : taskOrId;
    if (cached) populateTask(cached, mode);
    else { setWorkspaceTask(null); setEditingTaskId(id); setShowForm(true); setWorkspaceMode(mode); }
    setWorkspaceLoading(true); setWorkspaceError(null); setError(null);
    if (updateUrl) workspaceUrl(id, mode);
    window.scrollTo({ top: 0, behavior: "instant" });
    const { data, error: err } = await getAdminBankTask(id, email);
    if (generation !== formGenerationRef.current) return;
    if (!data || err) setWorkspaceError(err || "Есепті жүктеу мүмкін болмады.");
    else populateTask(data, mode);
    setWorkspaceLoading(false);
  };
  const openNewTask = (updateUrl = true) => {
    if (!canLeave()) return;
    if (!workspaceRef.current.open) listScroll.current = window.scrollY;
    formGenerationRef.current += 1;
    const next = createEmptyForm(); setForm(next); setBaseline(signature(next)); setWorkspaceTask(null); setEditingTaskId(null);
    setShowForm(true); setWorkspaceMode("edit"); setWorkspaceLoading(false); setWorkspaceError(null); setVersionConflict(false); setPendingDedup(null);
    setError(null); setFormTopicInput(""); setFormTopicSuggestions([]);
    if (updateUrl) workspaceUrl("new", "edit");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const cancelEditing = () => {
    if (!canLeave()) return;
    if (workspaceTask) { populateTask(workspaceTask, "view"); workspaceUrl(workspaceTask.id, "view", true); }
    else resetAndHideForm();
  };
  const switchMode = (mode: WorkspaceMode) => { setWorkspaceMode(mode); workspaceUrl(editingTaskId ?? "new", mode, true); };
  const refreshAll = async () => {
    await Promise.all([fetchTasks(), fetchCatalog()]);
    const current = workspaceRef.current;
    if (!email || !current.open || !current.id || current.dirty) return;
    const generation = formGenerationRef.current;
    const { data } = await getAdminBankTask(current.id, email);
    if (generation === formGenerationRef.current && data && !workspaceRef.current.dirty) populateTask(data, workspaceRef.current.mode);
  };
  const navigation = useRef({ openTask, openNewTask, resetAndHideForm });
  navigation.current = { openTask, openNewTask, resetAndHideForm };
  const initialized = useRef(false);
  useEffect(() => {
    if (!authorized || !preferences.ready) return;
    const navigate = () => {
      const params = new URLSearchParams(window.location.search);
      const target = params.get("task");
      const mode: WorkspaceMode = modes.includes(params.get("mode") as WorkspaceMode) ? params.get("mode") as WorkspaceMode : "view";
      const current = workspaceRef.current;
      if (current.busy) { workspaceUrl(current.id ?? "new", current.mode, true); return; }
      if (current.open && String(current.id ?? "new") === target) { setWorkspaceMode(current.task?.deleted_at && mode === "edit" ? "view" : mode); return; }
      if (current.dirty && !window.confirm("Сақталмаған өзгерістер бар. Өзгерістерді сақтамай шығу керек пе?")) { workspaceUrl(current.id ?? "new", current.mode); return; }
      // The dirty choice was handled above; the called open function reads the same ref.
      workspaceRef.current = { ...current, dirty: false };
      if (target === "new") navigation.current.openNewTask(false);
      else if (target && /^\d{1,15}$/.test(target) && Number(target) > 0) void navigation.current.openTask(Number(target), mode, false);
      else if (current.open) navigation.current.resetAndHideForm(false);
    };
    if (!initialized.current) { initialized.current = true; navigate(); }
    window.addEventListener("popstate", navigate);
    return () => { window.removeEventListener("popstate", navigate); initialized.current = false; };
  }, [authorized, preferences.ready]);

  const addFormTopic = (raw: string) => {
    const topic = raw.trim();
    if (!topic || form.topics.some((value) => value.toLowerCase() === topic.toLowerCase())) return;
    if (form.topics.length >= 10 || topic.length > 64) { setError("Ең көбі 10 тақырып, әр тақырып 64 таңбадан аспауы керек."); return; }
    setForm((previous) => ({ ...previous, topics: [...previous.topics, topic] })); setFormTopicInput(""); setFormTopicSuggestions([]);
  };
  const { handleImportFileChange, handleExportJson, runBankImportConfirm } = createImportActions({
    email, setImporting, setImportResult, setError, setImportPreviewState, setOffset, fetchTasks: refreshAll,
    importPreviewState, setConfirmingImport, setExporting,
  });
  const submitBankForm = async (dedupConfirmed = false) => {
    if (!email || saving || reloadingForm || workspaceLoading || workspaceError || versionConflict) return;
    const generation = formGenerationRef.current;
    try {
      setSaving(true); setError(null);
      if (form.legacyOptionCount != null) throw new Error("Сақтаудан бұрын 4 немесе 6 жауап нұсқасын таңдаңыз");
      let answer = form.answer;
      let options = null;
      let subquestions = null;
      if (isMcqQuestionType(form.question_type)) { answer = serializeMcqAnswerLabels(form.correctOptions.filter((label) => getMcqEditorLabels(form.question_type).includes(label))); options = buildMcqOptionsFromBankForm(form); }
      else if (form.question_type === "tf") answer = form.correctTf;
      else if (form.question_type === "select") {
        if (!form.subQuestion1.trim() || !form.subQuestion2.trim()) throw new Error("Сәйкестендіру үшін екі қосымша сұрақ мәтінін толтырыңыз");
        answer = JSON.stringify([form.correctSub1, form.correctSub2]);
        options = [{ label: "A", text: form.optionA }, { label: "B", text: form.optionB }, { label: "C", text: form.optionC }, { label: "D", text: form.optionD }];
        subquestions = [{ text: form.subQuestion1.trim(), correct: form.correctSub1 }, { text: form.subQuestion2.trim(), correct: form.correctSub2 }];
      }
      const body = new FormData();
      for (const [key, value] of Object.entries({ text: form.text, question_type: form.question_type, answer_mode: form.answer_mode, text_scale: form.text_scale, answer, difficulty: form.difficulty })) body.append(key, value);
      body.append("accepted_answers", JSON.stringify(normalizeAcceptedAnswers(form.acceptedAnswers))); body.append("topics", JSON.stringify(form.topics));
      // Explicit empty arrays clear fields when a task changes type.
      body.append("options", JSON.stringify(options || [])); body.append("subquestions", JSON.stringify(subquestions || []));
      if (form.imageFile) body.append("image", form.imageFile);
      if (form.removeImage) body.append("remove_image", "true");
      if (dedupConfirmed) body.append("dedup_confirmed", "true");
      if (editingTaskId && form.currentVersion != null) body.append("expected_current_version", String(form.currentVersion));
      const result = editingTaskId ? await updateAdminBankTask(editingTaskId, body, email) : await createAdminBankTask(body, email);
      if (generation !== formGenerationRef.current) return;
      if (result.conflict?.code === "SIMILAR_TASKS_FOUND") { setPendingDedup({ similarTasks: result.conflict.similar_tasks || [] }); setError(result.conflict.message); return; }
      if (result.conflict?.code === "VERSION_CONFLICT") { setVersionConflict(true); setPendingDedup(null); return; }
      if (result.error || !result.data) { setError(result.error || "Есепті сақтау мүмкін болмады."); return; }
      populateTask(result.data, "view"); workspaceUrl(result.data.id, "view", true); setImportResult(`Есеп #${result.data.id} сақталды.`);
      await Promise.all([fetchTasks(), fetchCatalog()]);
    } catch (err) { if (generation === formGenerationRef.current) setError(err instanceof Error ? err.message : "Есепті сақтау қатесі"); }
    finally { if (generation === formGenerationRef.current) setSaving(false); }
  };
  const reloadConflictedForm = async () => {
    if (!email || !editingTaskId || !versionConflict || saving || reloadingForm) return;
    const generation = formGenerationRef.current; setReloadingForm(true); setError(null);
    const { data, error: err } = await getAdminBankTask(editingTaskId, email);
    if (generation !== formGenerationRef.current) return;
    if (!data || err || data.deleted_at || !Number.isInteger(data.current_version)) setError(err || "Есептің жаңа нұсқасын жүктеу мүмкін болмады.");
    else populateTask(data, "edit");
    setReloadingForm(false);
  };
  const handleDeleteTask = async (id: number) => {
    if (!email || !window.confirm("Есепті себетке жылжыту керек пе?")) return;
    const { error: err } = await deleteAdminBankTask(id, email);
    if (err) { setError(err); return; }
    worksheet.remove(id); if (editingTaskId === id) resetAndHideForm(); await refreshAll();
  };
  const handleRestoreTask = async (id: number) => {
    if (!email) return;
    const { data, error: err } = await restoreAdminBankTask(id, email);
    if (err) { setError(err); return; }
    if (editingTaskId === id && data) populateTask(data, "view"); await refreshAll();
  };
  const handlePermanentDeleteTask = async (id: number) => {
    if (!email || !window.confirm("Есепті біржола жою керек пе? Бұл әрекетті қайтару мүмкін емес.")) return;
    const { error: err } = await permanentlyDeleteAdminBankTask(id, email);
    if (err) { setError(err); return; }
    worksheet.remove(id); if (editingTaskId === id) resetAndHideForm(); await refreshAll();
  };
  const { openHistory, openSnapshot, openJsonEdit, saveJsonEdit, handleRollbackVersion, handleDeleteVersion, openUsage } = createVersionActions({
    email, setHistoryTask, setHistoryItems, setHistoryError, setSnapshotView, setJsonEdit, setHistoryLoading, setError, jsonEdit,
    fetchTasks: refreshAll, historyTask, setRollbackLoading, setDeleteVersionLoadingNo, snapshotView, setUsageTask, setUsageItems, setUsageError, setUsageLoading,
  });

  if (status === "loading" || accessLoading || (authorized && !preferences.ready)) return <div className={styles.loading}>Банк жүктелуде...</div>;
  if (!session || !authorized) return <div className={styles.loading}>Қолжетім жоқ.</div>;
  const imageSrc = form.removeImage ? null : formImagePreview || undefined;
  const busy = saving || reloadingForm || workspaceLoading;
  return <div className={styles.page}>
    <DesktopNav />
    <main className={`${styles.main} md:ml-64`}><div className={styles.shell}>
      {(error || (!showForm && listError)) && <div role="alert" className={styles.alert}>{error || listError}</div>}
      {importResult && <div role="status" className={styles.notice}><span>{importResult}</span><button type="button" aria-label="Хабарламаны жабу" onClick={() => setImportResult(null)}><Icon name="close" /></button></div>}
      <input ref={importFileInputRef} type="file" accept=".json,application/json" hidden onChange={(e) => void handleImportFileChange(e)} />
      {!showForm ? <BankLibrary tab={tab} onTabChange={(next) => { setTab(next); setError(null); }} filters={filters} onFiltersChange={setFilters}
        catalog={catalog} catalogLoading={catalogLoading} catalogError={catalogError} topicSearch={topicSearch} onTopicSearchChange={setTopicSearch}
        savedViews={preferences.views} onSaveView={preferences.saveView} onRemoveView={preferences.removeView}
        tasks={tasks} total={total} loading={loading || filters.search.trim() !== debouncedSearch}
        selected={worksheet.selected} onToggle={worksheet.toggle} onTogglePage={() => worksheet.togglePage(tasks)} onClearSelection={worksheet.clear} onPdf={() => setWorksheetOpen(true)}
        onOpen={(task) => void openTask(task)} onCreate={() => openNewTask()} onImport={() => importFileInputRef.current?.click()} onExport={() => void handleExportJson()}
        importing={importing || confirmingImport} exporting={exporting} canReview={hasReviewAccess(access?.role)} canDeletePermanently={hasSuperAccess(access?.role)}
        onRestore={(id) => void handleRestoreTask(id)} onDeletePermanently={(id) => void handlePermanentDeleteTask(id)} answersPanel={<UnrecognizedAnswersPanel email={email!} />} />
        : <section className={styles.taskShell} aria-label="Есеппен жұмыс">
          <button type="button" className={styles.back} onClick={() => { if (!busy && canLeave()) resetAndHideForm(); }} disabled={busy}><Icon name="arrowLeft" /> Есептер тізіміне</button>
          <header className={styles.taskHeader}><div><h1>{editingTaskId ? `Банк №${editingTaskId}` : "Жаңа есеп"}</h1><p>{form.topics.length ? form.topics.join(" / ") : "Тақырып берілмеген"}{editingTaskId ? ` · v${form.currentVersion ?? "—"}` : ""}</p></div>
            <div className={styles.actions}><span className={styles.level}>{form.difficulty}</span><span className={styles.subtitle}>{questionTypeLabel(form.question_type)}</span>
              {workspaceTask && <details className={styles.menu}><summary className={styles.button}>Әрекеттер <Icon name="chevronDown" /></summary><div className={styles.menuPanel}>
                <button type="button" className={styles.quiet} disabled={busy} onClick={() => void openHistory(workspaceTask)}><Icon name="clock" /> Тарих</button>
                <button type="button" className={styles.quiet} disabled={busy} onClick={() => void openUsage(workspaceTask)}><Icon name="share" /> Қай жерде қолданылады</button>
                {workspaceTask.deleted_at ? <><button type="button" className={styles.quiet} disabled={busy} onClick={() => void handleRestoreTask(workspaceTask.id)}>Қалпына келтіру</button>{hasSuperAccess(access?.role) && <button type="button" className={styles.danger} disabled={busy} onClick={() => void handlePermanentDeleteTask(workspaceTask.id)}>Біржола жою</button>}</> : <button type="button" className={styles.danger} disabled={busy} onClick={() => void handleDeleteTask(workspaceTask.id)}><Icon name="trash" /> Себетке</button>}
              </div></details>}
            </div>
          </header>
          <nav className={styles.tabs} aria-label="Есеп режимдері">{[{ mode: "view", label: "Есеп" }, { mode: "edit", label: "Өңдеу" }, { mode: "student", label: "Оқушы көрінісі" }].map(({ mode, label }) => <button type="button" key={mode} className={styles.tab} aria-pressed={workspaceMode === mode} disabled={busy || !!workspaceError || (mode === "view" && !workspaceTask) || (mode === "edit" && !!workspaceTask?.deleted_at)} onClick={() => switchMode(mode as WorkspaceMode)}>{label}</button>)}{isDirty && <span className={styles.dirty}>Сақталмаған өзгеріс</span>}</nav>
          {workspaceLoading ? <div className={styles.loading}>Есеп жүктелуде...</div> : workspaceError ? <div role="alert" className={styles.alert}>{workspaceError}<br /><button type="button" className={styles.button} onClick={() => editingTaskId && void openTask(editingTaskId, workspaceMode, false)}>Қайта жүктеу</button></div> : <>
            {workspaceTask?.deleted_at && <div className={styles.alert}>Есеп себетте. Өңдеу үшін оны қалпына келтіріңіз.</div>}
            {workspaceMode === "view" && previewTask && <><BankTaskDetail task={previewTask} imageSrc={imageSrc} /><footer className={styles.taskFooter}><p>Қолданыста: {workspaceTask?.active_usage_count ?? 0} · Таңдау мен сүзгілер тізімге қайтқанда сақталады</p><div className={styles.actions}>{!workspaceTask?.deleted_at && <><button type="button" className={styles.button} onClick={() => worksheet.toggle(workspaceTask!)}>{worksheet.selected.some((task) => task.id === editingTaskId) ? "PDF таңдауынан алу" : "PDF үшін таңдау"}</button><button type="button" className={styles.primary} onClick={() => switchMode("edit")}><Icon name="edit" /> Есепті өңдеу</button></>}</div></footer></>}
            {workspaceMode === "edit" && <BankTaskForm tab="active" showForm editingTaskId={editingTaskId} form={form} setForm={setForm}
              handleSubmitForm={async (event) => { event.preventDefault(); await submitBankForm(); }} removeFormTopic={(topic) => setForm((previous) => ({ ...previous, topics: previous.topics.filter((value) => value !== topic) }))}
              formTopicInput={formTopicInput} setFormTopicInput={setFormTopicInput} addFormTopic={addFormTopic} formTopicSuggestions={formTopicSuggestions}
              formPreviewTask={formPreviewTask} formImagePreview={formImagePreview} saving={saving} versionConflict={versionConflict} reloading={reloadingForm}
              reloadTask={reloadConflictedForm} resetAndHideForm={cancelEditing} className={styles.form} hidePreview />}
            {workspaceMode === "student" && <StudentTaskPreview task={formPreviewTask} imageSrc={imageSrc} initialViewport="desktop" className={styles.studentPreview}
              onTextScaleChange={workspaceTask?.deleted_at ? undefined : (text_scale) => setForm((previous) => ({ ...previous, text_scale }))} />}
          </>}
        </section>}
    </div></main>
    {worksheetOpen && email && <BankWorksheetDialog key={email} email={email} tasks={worksheet.selected} onMove={worksheet.move} onRemove={worksheet.remove} onClose={() => setWorksheetOpen(false)} />}
    <DuplicateDialog pendingDedup={pendingDedup} setPendingDedup={setPendingDedup} submitBankForm={submitBankForm} saving={saving} />
    <ImportPreviewDialog importPreviewState={importPreviewState} setImportPreviewState={setImportPreviewState} runBankImportConfirm={runBankImportConfirm} confirmingImport={confirmingImport} />
    <HistoryDialog historyTask={historyTask} setHistoryTask={setHistoryTask} setSnapshotView={setSnapshotView} setJsonEdit={setJsonEdit} historyLoading={historyLoading} historyError={historyError} historyItems={historyItems} openSnapshot={openSnapshot} handleRollbackVersion={handleRollbackVersion} rollbackLoading={rollbackLoading} handleDeleteVersion={handleDeleteVersion} deleteVersionLoadingNo={deleteVersionLoadingNo} openJsonEdit={openJsonEdit} />
    <SnapshotDialog snapshotView={snapshotView} setSnapshotView={setSnapshotView} />
    <JsonEditDialog jsonEdit={jsonEdit} setJsonEdit={setJsonEdit} saveJsonEdit={saveJsonEdit} />
    <UsageDialog usageTask={usageTask} setUsageTask={setUsageTask} usageLoading={usageLoading} usageError={usageError} usageItems={usageItems} />
    <MobileNav currentPage="admin" />
  </div>;
}
