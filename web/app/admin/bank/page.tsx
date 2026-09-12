"use client";
import BankTaskForm from "./_components/BankTaskForm";
import DuplicateDialog from "./_components/DuplicateDialog";
import HistoryDialog from "./_components/HistoryDialog";
import ImportPreviewDialog from "./_components/ImportPreviewDialog";
import JsonEditDialog from "./_components/JsonEditDialog";
import SnapshotDialog from "./_components/SnapshotDialog";
import UsageDialog from "./_components/UsageDialog";
import { createImportActions } from "./_components/createImportActions";
import { createVersionActions } from "./_components/createVersionActions";
import { BankFormState, ImportPreviewState, JsonEditState, PendingDedupState, SnapshotViewState, buildBankFormPreviewTask, buildMcqOptionsFromBankForm, createEmptyForm, formatDifficultyLabel, parseTaskToForm } from "./_components/model";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import UnrecognizedAnswersPanel from "@/components/admin/UnrecognizedAnswersPanel";
import MathRender from "@/components/ui/MathRender";
import {
  createAdminBankTask,
  deleteAdminBankTask,
  getAdminBankTasks,
  getAdminBankTopics,
  permanentlyDeleteAdminBankTask,
  restoreAdminBankTask,
  updateAdminBankTask
} from "@/lib/api";
import {
  isMcqQuestionType,
  serializeMcqAnswerLabels
} from "@/lib/question-options";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import {
  BankDifficulty,
  BankTask,
  BankTaskUsageItem,
  BankTaskVersionItem
} from "@/types";

export default function AdminBankPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("content", status, email);

  const [tab, setTab] = useState<"active" | "trash" | "answers">("active");
  const [tasks, setTasks] = useState<BankTask[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<BankDifficulty | "">("");
  const [topicFilterInput, setTopicFilterInput] = useState("");
  const [topicFilters, setTopicFilters] = useState<string[]>([]);
  const [topicFilterSuggestions, setTopicFilterSuggestions] = useState<string[]>([]);

  const [form, setForm] = useState<BankFormState>(createEmptyForm());
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [formTopicInput, setFormTopicInput] = useState("");
  const [formTopicSuggestions, setFormTopicSuggestions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
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
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const LIMIT = 20;
  const page = useMemo(() => Math.floor(offset / LIMIT) + 1, [offset]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / LIMIT)), [total]);
  const formPreviewTask = useMemo(
    () => ({ ...buildBankFormPreviewTask(form), id: editingTaskId ?? -1 }),
    [editingTaskId, form]
  );
  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    if (page <= 3) {
      [2, 3, 4, 5].forEach((item) => pages.add(item));
    }
    if (page >= totalPages - 2) {
      [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((item) => pages.add(item));
    }

    return Array.from(pages)
      .filter((item) => item >= 1 && item <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  const goToPage = (nextPage: number) => {
    setOffset((nextPage - 1) * LIMIT);
  };

  useEffect(() => {
    if (!form.imageFile) {
      setFormImagePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(form.imageFile);
    setFormImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [form.imageFile]);

  const fetchTasks = useCallback(async () => {
    if (!email || tab === "answers") return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await getAdminBankTasks(email, {
      search,
      difficulty: difficultyFilter,
      topics: topicFilters,
      limit: LIMIT,
      offset,
      trash: tab === "trash",
    });

    if (err) {
      setError(err);
      setTasks([]);
      setTotal(0);
    } else if (data) {
      setTasks(data.items || []);
      setTotal(data.total || 0);
    }

    setLoading(false);
  }, [email, search, difficultyFilter, topicFilters, offset, tab]);

  useEffect(() => {
    if (email) void fetchTasks();
  }, [email, fetchTasks]);

  useEffect(() => {
    if (!email) return;
    const q = topicFilterInput.trim();
    if (!q) {
      setTopicFilterSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await getAdminBankTopics(email, q, 10);
      setTopicFilterSuggestions((data?.items || []).filter((name) => !topicFilters.includes(name)));
    }, 180);

    return () => clearTimeout(timer);
  }, [email, topicFilterInput, topicFilters]);

  useEffect(() => {
    if (!email) return;
    const q = formTopicInput.trim();
    if (!q) {
      setFormTopicSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await getAdminBankTopics(email, q, 10);
      setFormTopicSuggestions((data?.items || []).filter((name) => !form.topics.includes(name)));
    }, 180);

    return () => clearTimeout(timer);
  }, [email, formTopicInput, form.topics]);

  const resetAndHideForm = () => {
    setForm(createEmptyForm());
    setShowForm(false);
    setEditingTaskId(null);
    setFormTopicInput("");
    setFormTopicSuggestions([]);
    setPendingDedup(null);
  };

  const addFilterTopic = (rawTopic: string) => {
    const topic = rawTopic.trim();
    if (!topic || topicFilters.includes(topic)) return;
    setTopicFilters((prev) => [...prev, topic]);
    setTopicFilterInput("");
    setTopicFilterSuggestions([]);
    setOffset(0);
  };

  const removeFilterTopic = (topic: string) => {
    setTopicFilters((prev) => prev.filter((value) => value !== topic));
    setOffset(0);
  };

  const addFormTopic = (rawTopic: string) => {
    const topic = rawTopic.trim();
    if (!topic || form.topics.includes(topic)) return;
    if (form.topics.length >= 10) {
      setError("Тапсырма үшін ең көбі 10 тақырып");
      return;
    }
    if (topic.length > 64) {
      setError("Тақырып 64 таңбадан аспауы керек");
      return;
    }
    setForm((prev) => ({ ...prev, topics: [...prev.topics, topic] }));
    setFormTopicInput("");
    setFormTopicSuggestions([]);
  };

  const removeFormTopic = (topic: string) => {
    setForm((prev) => ({ ...prev, topics: prev.topics.filter((value) => value !== topic) }));
  };

  const { normalizeImportTasksPayload, runBankImportDryRun, runBankImportConfirm, handleImportFileChange, handleExportJson } = createImportActions({
    email,
    setImporting,
    setImportResult,
    setError,
    setImportPreviewState,
    setOffset,
    fetchTasks,
    importPreviewState,
    setConfirmingImport,
    setExporting,
  });

  const buildAnswerAndPayload = (currentForm: BankFormState) => {
    let answer = currentForm.answer;
    let options: Array<{ label: string; text: string }> | null = null;
    let subquestions: Array<{ text: string; correct: string }> | null = null;

    if (isMcqQuestionType(currentForm.question_type)) {
      answer = serializeMcqAnswerLabels(currentForm.correctOptions);
      options = buildMcqOptionsFromBankForm(currentForm);
    } else if (currentForm.question_type === "tf") {
      answer = currentForm.correctTf;
    } else if (currentForm.question_type === "select") {
      if (!currentForm.subQuestion1.trim() || !currentForm.subQuestion2.trim()) {
        throw new Error("Сәйкестендіру үшін екі қосымша сұрақ мәтінін толтырыңыз");
      }
      answer = JSON.stringify([currentForm.correctSub1, currentForm.correctSub2]);
      options = [
        { label: "A", text: currentForm.optionA },
        { label: "B", text: currentForm.optionB },
        { label: "C", text: currentForm.optionC },
        { label: "D", text: currentForm.optionD },
      ];
      subquestions = [
        { text: currentForm.subQuestion1.trim(), correct: currentForm.correctSub1 },
        { text: currentForm.subQuestion2.trim(), correct: currentForm.correctSub2 },
      ];
    }

    return { answer, options, subquestions };
  };

  const submitBankForm = async (dedupConfirmed: boolean = false) => {
    if (!email) return;

    try {
      setSaving(true);
      setError(null);

      const { answer, options, subquestions } = buildAnswerAndPayload(form);
      const formData = new FormData();
      formData.append("text", form.text);
      formData.append("question_type", form.question_type);
      formData.append("answer_mode", form.answer_mode);
      formData.append("text_scale", form.text_scale);
      formData.append("answer", answer);
      formData.append("accepted_answers", JSON.stringify(normalizeAcceptedAnswers(form.acceptedAnswers)));
      formData.append("difficulty", form.difficulty);
      formData.append("topics", JSON.stringify(form.topics));
      if (options) formData.append("options", JSON.stringify(options));
      if (subquestions) formData.append("subquestions", JSON.stringify(subquestions));
      if (form.imageFile) formData.append("image", form.imageFile);
      if (form.removeImage) formData.append("remove_image", "true");
      if (dedupConfirmed) formData.append("dedup_confirmed", "true");
      if (editingTaskId && form.currentVersion != null) {
        formData.append("expected_current_version", String(form.currentVersion));
      }

      const { error: err, conflict } = editingTaskId
        ? await updateAdminBankTask(editingTaskId, formData, email)
        : await createAdminBankTask(formData, email);

      if (conflict?.code === "SIMILAR_TASKS_FOUND") {
        setPendingDedup({ similarTasks: conflict.similar_tasks || [] });
        setError(conflict.message || "Ұқсас тапсырмалар табылды");
        return;
      }
      if (conflict?.code === "VERSION_CONFLICT") {
        setError(conflict.message || "Тапсырма нұсқасы ескірген. Деректерді жаңартып, қайта көріңіз.");
        if (typeof conflict.current_version === "number") {
          setForm((prev) => ({ ...prev, currentVersion: conflict.current_version || null }));
        }
        return;
      }

      if (err) {
        setError(err);
      } else {
        setPendingDedup(null);
        resetAndHideForm();
        setOffset(0);
        await fetchTasks();
      }
    } catch (err: any) {
      setError(err?.message || "Тапсырманы сақтау қатесі");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBankForm(false);
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!email) return;
    if (!confirm("Тапсырманы себетке жылжыту керек пе?")) return;
    const { error: err } = await deleteAdminBankTask(taskId, email);
    if (err) {
      setError(err);
      return;
    }
    if (editingTaskId === taskId) resetAndHideForm();
    await fetchTasks();
  };

  const handleRestoreTask = async (taskId: number) => {
    if (!email) return;
    const { error: err } = await restoreAdminBankTask(taskId, email);
    if (err) {
      setError(err);
      return;
    }
    await fetchTasks();
  };

  const handlePermanentDeleteTask = async (taskId: number) => {
    if (!email) return;
    if (!confirm("Тапсырманы біржола жою керек пе? Бұл әрекетті қайтару мүмкін емес.")) return;
    const { error: err } = await permanentlyDeleteAdminBankTask(taskId, email);
    if (err) {
      setError(err);
      return;
    }
    if (editingTaskId === taskId) resetAndHideForm();
    await fetchTasks();
  };

  const startEdit = (task: BankTask) => {
    setEditingTaskId(task.id);
    setForm(parseTaskToForm(task));
    setShowForm(true);
    setFormTopicInput("");
    setFormTopicSuggestions([]);
    setPendingDedup(null);
  };

  const { openHistory, openSnapshot, openJsonEdit, saveJsonEdit, handleRollbackVersion, handleDeleteVersion, openUsage } = createVersionActions({
    email,
    setHistoryTask,
    setHistoryItems,
    setHistoryError,
    setSnapshotView,
    setJsonEdit,
    setHistoryLoading,
    setError,
    jsonEdit,
    fetchTasks,
    historyTask,
    setRollbackLoading,
    setDeleteVersionLoadingNo,
    snapshotView,
    setUsageTask,
    setUsageItems,
    setUsageError,
    setUsageLoading,
  });

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Әкімші панеліне кіру үшін аккаунтқа кіріңіз</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Тапсырмалар банкі
              </h1>
              <Link href="/admin" className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
                ← Әкімші панелі
              </Link>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
            {importResult && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                {importResult}
              </div>
            )}
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void handleImportFileChange(e)}
            />

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setTab("active");
                  setOffset(0);
                  resetAndHideForm();
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${tab === "active" ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              >
                Белсенді
              </button>
              <button
                onClick={() => {
                  setTab("trash");
                  setOffset(0);
                  resetAndHideForm();
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${tab === "trash" ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              >
                Себет
              </button>
              <button
                onClick={() => {
                  setTab("answers");
                  setOffset(0);
                  resetAndHideForm();
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${tab === "answers" ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              >
                Оқушы жауаптары
              </button>
            </div>

            {tab === "trash" && (
              <div className="mb-4 text-sm text-gray-700">
                Себеттегі тапсырмалар 30 күннен кейін автоматты түрде жойылады.
              </div>
            )}

            {tab === "answers" && email && <UnrecognizedAnswersPanel email={email} />}

            <div className={`bg-white/70 rounded-2xl p-4 border border-white/40 mb-4 space-y-3 ${tab === "answers" ? "hidden" : ""}`}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Мәтін бойынша іздеу"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <select
                  value={difficultyFilter}
                  onChange={(e) => {
                    setDifficultyFilter((e.target.value || "") as BankDifficulty | "");
                    setOffset(0);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Барлық күрделілік</option>
                  <option value="A">A (оңай)</option>
                  <option value="B">B (орташа)</option>
                  <option value="C">C (қиын)</option>
                </select>
                <button
                  onClick={() => {
                    setSearch("");
                    setDifficultyFilter("");
                    setTopicFilters([]);
                    setTopicFilterInput("");
                    setOffset(0);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg px-4 py-2"
                >
                  Сүзгілерді тазалау
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Тақырыптар (ANY)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {topicFilters.map((topic) => (
                    <button key={topic} onClick={() => removeFilterTopic(topic)} className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {topic} x
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topicFilterInput}
                    onChange={(e) => setTopicFilterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFilterTopic(topicFilterInput);
                      }
                    }}
                    placeholder="Сүзгіге тақырып қосу"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <button onClick={() => addFilterTopic(topicFilterInput)} className="bg-gray-200 hover:bg-gray-300 rounded-lg px-3">+</button>
                </div>
                {topicFilterSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topicFilterSuggestions.map((topic) => (
                      <button key={topic} onClick={() => addFilterTopic(topic)} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {tab === "active" && (
              <div className="mb-4 flex justify-end gap-2">
                <Link
                  href="/admin/bank/quality"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Сапа дашборды
                </Link>
                <Link
                  href="/admin/bank/audit"
                  className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Audit log
                </Link>
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={importing || confirmingImport}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {importing ? "Preview..." : "JSON импорт"}
                </button>
                <button
                  onClick={() => void handleExportJson()}
                  disabled={exporting}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {exporting ? "Экспортталуда..." : "JSON экспорт"}
                </button>
                <button
                  onClick={() => {
                    if (showForm) {
                      resetAndHideForm();
                      return;
                    }
                    setEditingTaskId(null);
                    setForm(createEmptyForm());
                    setShowForm(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {showForm ? "Пішінді жасыру" : "+ Тапсырма құру"}
                </button>
              </div>
            )}

            <BankTaskForm
              tab={tab}
              showForm={showForm}
              editingTaskId={editingTaskId}
              form={form}
              handleSubmitForm={handleSubmitForm}
              setForm={setForm}
              removeFormTopic={removeFormTopic}
              formTopicInput={formTopicInput}
              setFormTopicInput={setFormTopicInput}
              addFormTopic={addFormTopic}
              formTopicSuggestions={formTopicSuggestions}
              formPreviewTask={formPreviewTask}
              formImagePreview={formImagePreview}
              saving={saving}
              resetAndHideForm={resetAndHideForm}
            />

            {tab !== "answers" && (
              <>
                {loading ? (
                  <div className="text-center py-8 text-gray-600">Жүктелуде...</div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">Тапсырмалар табылмады</div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task, idx) => (
                      <div key={task.id} className="bg-white/70 rounded-2xl p-4 border border-white/40">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-gray-900 break-words ${getTaskTextScaleClass(normalizeTaskTextScale(task.text_scale))}`}>
                              {offset + idx + 1}. {task.text ? <MathRender inline latex={task.text} /> : `Тапсырма #${task.id}`}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Түрі: {task.question_type} · Күрделілік: {formatDifficultyLabel(task.difficulty)} · Нұсқа: v{task.current_version ?? 1} · Қолданыста: {task.active_usage_count ?? 0}
                            </div>
                            {task.topics.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {task.topics.map((topic) => (
                                  <span key={`${task.id}-${topic}`} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">{topic}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {tab === "active" ? (
                            <div className="flex flex-wrap gap-2 justify-end">
                              <button onClick={() => openHistory(task)} className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Тарих
                              </button>
                              <button onClick={() => openUsage(task)} className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Қай жерде қолданылады
                              </button>
                              <button onClick={() => startEdit(task)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Өңдеу
                              </button>
                              <button onClick={() => handleDeleteTask(task.id)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Себетке
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 justify-end">
                              <button onClick={() => openHistory(task)} className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Тарих
                              </button>
                              <button onClick={() => openUsage(task)} className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Қай жерде қолданылады
                              </button>
                              <button onClick={() => handleRestoreTask(task.id)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Қалпына келтіру
                              </button>
                              <button onClick={() => handlePermanentDeleteTask(task.id)} className="bg-red-700 hover:bg-red-800 text-white font-semibold py-1 px-3 rounded-lg text-sm">
                                Біржола жою
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">Бет {page} / {totalPages} · Барлығы: {total}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
                      disabled={offset === 0}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      ← Артқа
                    </button>
                    {paginationPages.map((pageNo, index) => (
                      <Fragment key={pageNo}>
                        {index > 0 && pageNo - paginationPages[index - 1] > 1 && (
                          <span className="px-1 text-sm text-gray-500">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => goToPage(pageNo)}
                          disabled={pageNo === page}
                          aria-current={pageNo === page ? "page" : undefined}
                          className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold ${pageNo === page
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                            }`}
                        >
                          {pageNo}
                        </button>
                      </Fragment>
                    ))}
                    <button
                      onClick={() => setOffset((prev) => prev + LIMIT)}
                      disabled={offset + LIMIT >= total}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Алға →
                    </button>
                  </div>
                </div>
              </>
            )}

            <DuplicateDialog
              pendingDedup={pendingDedup}
              setPendingDedup={setPendingDedup}
              submitBankForm={submitBankForm}
              saving={saving}
            />

            <ImportPreviewDialog
              importPreviewState={importPreviewState}
              setImportPreviewState={setImportPreviewState}
              runBankImportConfirm={runBankImportConfirm}
              confirmingImport={confirmingImport}
            />

            <HistoryDialog
              historyTask={historyTask}
              setHistoryTask={setHistoryTask}
              setSnapshotView={setSnapshotView}
              setJsonEdit={setJsonEdit}
              historyLoading={historyLoading}
              historyError={historyError}
              historyItems={historyItems}
              openSnapshot={openSnapshot}
              handleRollbackVersion={handleRollbackVersion}
              rollbackLoading={rollbackLoading}
              handleDeleteVersion={handleDeleteVersion}
              deleteVersionLoadingNo={deleteVersionLoadingNo}
              openJsonEdit={openJsonEdit}
            />

            <SnapshotDialog
              snapshotView={snapshotView}
              setSnapshotView={setSnapshotView}
            />

            <JsonEditDialog
              jsonEdit={jsonEdit}
              setJsonEdit={setJsonEdit}
              saveJsonEdit={saveJsonEdit}
            />

            <UsageDialog
              usageTask={usageTask}
              setUsageTask={setUsageTask}
              usageLoading={usageLoading}
              usageError={usageError}
              usageItems={usageItems}
            />
          </div>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}

