"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import {
  createAdminBankTask,
  deleteAdminBankTask,
  deleteAdminBankTaskVersion,
  getAdminBankTasks,
  getAdminBankTaskUsage,
  getAdminBankTaskVersion,
  getAdminBankTaskVersions,
  getAdminBankTopics,
  importAdminBankTasks,
  permanentlyDeleteAdminBankTask,
  rollbackAdminBankTask,
  restoreAdminBankTask,
  updateAdminBankTask,
} from "@/lib/api";
import { parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import {
  BankDifficulty,
  BankImportPreviewResponse,
  BankTask,
  BankTaskSimilarCandidate,
  BankTaskUsageItem,
  BankTaskVersionItem,
  QuestionType,
  TaskTextScale,
} from "@/types";

type BankFormState = {
  text: string;
  question_type: QuestionType;
  text_scale: TaskTextScale;
  answer: string;
  difficulty: BankDifficulty;
  currentVersion: number | null;
  imageFile: File | null;
  existingImageFilename: string | null;
  removeImage: boolean;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  optionF: string;
  correctOption: "A" | "B" | "C" | "D" | "E" | "F";
  correctTf: "true" | "false";
  subQuestion1: string;
  subQuestion2: string;
  correctSub1: "A" | "B" | "C" | "D";
  correctSub2: "A" | "B" | "C" | "D";
  factorTopLeft: string;
  factorTopRight: string;
  factorBottomLeft: string;
  factorBottomRight: string;
  topics: string[];
};

type PendingDedupState = {
  similarTasks: BankTaskSimilarCandidate[];
};

type ImportPreviewState = {
  payload: Record<string, any> | Array<Record<string, any>>;
  preview: BankImportPreviewResponse;
};

type SnapshotViewState = {
  taskId: number;
  versionNo: number;
  snapshot: any;
};

const createEmptyForm = (): BankFormState => ({
  text: "",
  question_type: "mcq",
  text_scale: "md",
  answer: "",
  difficulty: "B",
  currentVersion: null,
  imageFile: null,
  existingImageFilename: null,
  removeImage: false,
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  optionE: "",
  optionF: "",
  correctOption: "A",
  correctTf: "true",
  subQuestion1: "",
  subQuestion2: "",
  correctSub1: "A",
  correctSub2: "A",
  factorTopLeft: "",
  factorTopRight: "",
  factorBottomLeft: "",
  factorBottomRight: "",
  topics: [],
});

const parseTaskToForm = (task: BankTask): BankFormState => {
  const form = createEmptyForm();
  form.text = task.text || "";
  form.question_type = (task.question_type || "input") as QuestionType;
  form.text_scale = normalizeTaskTextScale(task.text_scale);
  form.answer = task.answer || "";
  form.difficulty = (task.difficulty || "B") as BankDifficulty;
  form.currentVersion = typeof task.current_version === "number" ? task.current_version : null;
  form.existingImageFilename = task.image_filename || null;
  form.topics = Array.isArray(task.topics) ? task.topics : [];

  const options = Array.isArray(task.options) ? task.options : [];
  form.optionA = options.find((o) => o.label === "A")?.text || "";
  form.optionB = options.find((o) => o.label === "B")?.text || "";
  form.optionC = options.find((o) => o.label === "C")?.text || "";
  form.optionD = options.find((o) => o.label === "D")?.text || "";
  form.optionE = options.find((o) => o.label === "E")?.text || "";
  form.optionF = options.find((o) => o.label === "F")?.text || "";

  if (task.question_type === "mcq" || task.question_type === "mcq6") {
    form.correctOption = (task.answer || "A") as BankFormState["correctOption"];
  }
  if (task.question_type === "tf") {
    form.correctTf = task.answer === "false" ? "false" : "true";
  }
  if (task.question_type === "factor_grid") {
    const [topLeft, topRight, bottomLeft, bottomRight] = parseFactorGridAnswer(task.answer || "");
    form.factorTopLeft = topLeft;
    form.factorTopRight = topRight;
    form.factorBottomLeft = bottomLeft;
    form.factorBottomRight = bottomRight;
  }

  const subquestions = Array.isArray(task.subquestions) ? task.subquestions : [];
  if (task.question_type === "select") {
    if (subquestions.length >= 2) {
      form.subQuestion1 = subquestions[0]?.text || "";
      form.subQuestion2 = subquestions[1]?.text || "";
      form.correctSub1 = (subquestions[0]?.correct || "A") as BankFormState["correctSub1"];
      form.correctSub2 = (subquestions[1]?.correct || "A") as BankFormState["correctSub2"];
    } else {
      try {
        const parsed = JSON.parse(task.answer || "[]");
        if (Array.isArray(parsed) && parsed.length >= 2) {
          form.correctSub1 = (parsed[0] || "A") as BankFormState["correctSub1"];
          form.correctSub2 = (parsed[1] || "A") as BankFormState["correctSub2"];
        }
      } catch {
        // no-op
      }
    }
  }

  return form;
};

const formatDifficultyLabel = (difficulty: BankDifficulty): string => {
  if (difficulty === "A") return "A (оңай)";
  if (difficulty === "B") return "B (орташа)";
  return "C (қиын)";
};

export default function AdminBankPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("content", status, email);

  const [tab, setTab] = useState<"active" | "trash">("active");
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
  const [formTopicInput, setFormTopicInput] = useState("");
  const [formTopicSuggestions, setFormTopicSuggestions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [pendingDedup, setPendingDedup] = useState<PendingDedupState | null>(null);
  const [importPreviewState, setImportPreviewState] = useState<ImportPreviewState | null>(null);
  const [historyTask, setHistoryTask] = useState<BankTask | null>(null);
  const [historyItems, setHistoryItems] = useState<BankTaskVersionItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [snapshotView, setSnapshotView] = useState<SnapshotViewState | null>(null);
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

  const fetchTasks = useCallback(async () => {
    if (!email) return;
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

  const normalizeImportTasksPayload = (
    value: unknown
  ): Record<string, any> | Array<Record<string, any>> => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error("JSON массиві бос болмауы керек");
      }
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`tasks[${i}] объект болуы керек`);
        }
      }
      return value as Array<Record<string, any>>;
    }
    if (value && typeof value === "object") {
      return value as Record<string, any>;
    }
    throw new Error("JSON объект немесе объекттер массиві болуы керек");
  };

  const runBankImportDryRun = async (payload: Record<string, any> | Array<Record<string, any>>) => {
    if (!email) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    setImportPreviewState(null);

    const { preview, data, error: err, conflict, validation } = await importAdminBankTasks(email, payload, {
      mode: "dry_run",
    });

    if (validation?.code === "IMPORT_VALIDATION_FAILED") {
      setError("JSON импортында валидация қатесі бар");
      setImportPreviewState({
        payload,
        preview: {
          mode: "dry_run",
          preview_token: "",
          expires_at: "",
          summary: {
            total_tasks: Array.isArray(payload) ? payload.length : 1,
            valid_count: 0,
            invalid_count: validation.errors.length,
            duplicate_count: 0,
            can_confirm: false,
            requires_dedup_confirmation: false,
          },
          validation_errors: validation.errors || [],
          duplicate_conflicts: [],
        },
      });
      setImporting(false);
      return;
    }

    if (conflict?.code === "SIMILAR_TASKS_FOUND") {
      setError(conflict.message || "Ұқсас тапсырмалар табылды");
      setImportPreviewState({
        payload,
        preview: {
          mode: "dry_run",
          preview_token: "",
          expires_at: "",
          summary: {
            total_tasks: Array.isArray(payload) ? payload.length : 1,
            valid_count: Array.isArray(payload) ? payload.length : 1,
            invalid_count: 0,
            duplicate_count: conflict.conflicts?.length || 1,
            can_confirm: true,
            requires_dedup_confirmation: true,
          },
          validation_errors: [],
          duplicate_conflicts:
            conflict.conflicts && conflict.conflicts.length > 0
              ? conflict.conflicts
              : [{ index: conflict.task_index ?? 0, similar_tasks: conflict.similar_tasks || [] }],
        },
      });
      setImporting(false);
      return;
    }

    if (err) {
      setError(err);
      setImporting(false);
      return;
    }

    if (preview) {
      setImportPreviewState({ payload, preview });
    } else if (data) {
      // Defensive fallback if backend unexpectedly returns confirm payload for dry_run mode.
      setImportResult(`Импорт сәтті аяқталды: ${data.created_count}`);
      setOffset(0);
      await fetchTasks();
    }

    setImporting(false);
  };

  const runBankImportConfirm = async (dedupConfirmed: boolean) => {
    if (!email || !importPreviewState) return;
    const { payload, preview } = importPreviewState;
    setConfirmingImport(true);
    setError(null);
    setImportResult(null);

    const { data, error: err, conflict, validation } = await importAdminBankTasks(email, payload, {
      mode: "confirm",
      previewToken: preview.preview_token,
      dedupConfirmed,
    });

    if (validation?.code === "IMPORT_VALIDATION_FAILED") {
      setError("JSON импортын растау кезінде валидация қатесі табылды");
      setImportPreviewState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          preview: {
            ...prev.preview,
            summary: {
              ...prev.preview.summary,
              invalid_count: validation.errors.length,
              valid_count: Math.max(0, prev.preview.summary.total_tasks - validation.errors.length),
              can_confirm: false,
            },
            validation_errors: validation.errors || [],
          },
        };
      });
      setConfirmingImport(false);
      return;
    }

    if (conflict?.code === "SIMILAR_TASKS_FOUND") {
      setError(conflict.message || "Ұқсас тапсырмалар табылды");
      setImportPreviewState((prev) => {
        if (!prev) return prev;
        const conflicts =
          conflict.conflicts && conflict.conflicts.length > 0
            ? conflict.conflicts
            : [{ index: conflict.task_index ?? 0, similar_tasks: conflict.similar_tasks || [] }];
        return {
          ...prev,
          preview: {
            ...prev.preview,
            summary: {
              ...prev.preview.summary,
              duplicate_count: conflicts.length,
              requires_dedup_confirmation: conflicts.length > 0,
              can_confirm: prev.preview.summary.invalid_count === 0,
            },
            duplicate_conflicts: conflicts,
          },
        };
      });
      setConfirmingImport(false);
      return;
    }

    if (err) {
      setError(err);
      setConfirmingImport(false);
      return;
    }

    if (data) {
      setImportPreviewState(null);
      setImportResult(`Импорт сәтті аяқталды: ${data.created_count}`);
      setOffset(0);
      await fetchTasks();
    }

    setConfirmingImport(false);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !email) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const payload = normalizeImportTasksPayload(parsed);
      await runBankImportDryRun(payload);
    } catch (err: any) {
      setImportPreviewState(null);
      setImportResult(null);
      setError(err?.message || "JSON оқу немесе талдау қатесі");
    } finally {
      e.target.value = "";
    }
  };

  const buildAnswerAndPayload = (currentForm: BankFormState) => {
    let answer = currentForm.answer;
    let options: Array<{ label: string; text: string }> | null = null;
    let subquestions: Array<{ text: string; correct: string }> | null = null;

    if (currentForm.question_type === "mcq" || currentForm.question_type === "mcq6") {
      answer = currentForm.correctOption;
      options = [
        { label: "A", text: currentForm.optionA },
        { label: "B", text: currentForm.optionB },
        { label: "C", text: currentForm.optionC },
        { label: "D", text: currentForm.optionD },
      ];
      if (currentForm.question_type === "mcq6") {
        options.push({ label: "E", text: currentForm.optionE });
        options.push({ label: "F", text: currentForm.optionF });
      }
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
    } else if (currentForm.question_type === "factor_grid") {
      answer = serializeFactorGridAnswer([
        currentForm.factorTopLeft,
        currentForm.factorTopRight,
        currentForm.factorBottomLeft,
        currentForm.factorBottomRight,
      ]);
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
      formData.append("text_scale", form.text_scale);
      formData.append("answer", answer);
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

  const openHistory = async (task: BankTask) => {
    if (!email) return;
    setHistoryTask(task);
    setHistoryItems([]);
    setHistoryError(null);
    setSnapshotView(null);
    setHistoryLoading(true);
    const { data, error: err } = await getAdminBankTaskVersions(task.id, email, { limit: 100, offset: 0 });
    if (err) setHistoryError(err);
    else setHistoryItems(data?.items || []);
    setHistoryLoading(false);
  };

  const openSnapshot = async (taskId: number, versionNo: number) => {
    if (!email) return;
    const { data, error: err } = await getAdminBankTaskVersion(taskId, versionNo, email);
    if (err || !data) {
      setError(err || "Нұсқа snapshot-ын жүктеу мүмкін болмады");
      return;
    }
    setSnapshotView({ taskId, versionNo, snapshot: data.snapshot });
  };

  const handleRollbackVersion = async (task: BankTask, versionNo: number) => {
    if (!email) return;
    if (!confirm(`Тапсырма #${task.id} нұсқасын v${versionNo} дейін қайтару керек пе?`)) return;
    setRollbackLoading(true);
    const { error: err, conflict } = await rollbackAdminBankTask(task.id, {
      email,
      target_version: versionNo,
      expected_current_version: task.current_version,
    });
    setRollbackLoading(false);
    if (conflict?.code === "VERSION_CONFLICT") {
      setError(conflict.message || "Нұсқа қайшылығы. Тапсырма деректерін қайта жүктеңіз.");
      await fetchTasks();
      if (historyTask && historyTask.id === task.id) await openHistory(task);
      return;
    }
    if (err) {
      setError(err);
      return;
    }
    await fetchTasks();
    if (historyTask && historyTask.id === task.id) {
      await openHistory(task);
    }
  };

  const handleDeleteVersion = async (task: BankTask, versionNo: number) => {
    if (!email) return;
    if (!confirm(`Тарихтағы v${versionNo} нұсқасын біржола жою керек пе?`)) return;
    setHistoryError(null);
    setDeleteVersionLoadingNo(versionNo);
    const { error: err } = await deleteAdminBankTaskVersion(task.id, versionNo, email);
    setDeleteVersionLoadingNo(null);
    if (err) {
      setHistoryError(err);
      return;
    }
    if (snapshotView && snapshotView.taskId === task.id && snapshotView.versionNo === versionNo) {
      setSnapshotView(null);
    }
    await fetchTasks();
    if (historyTask && historyTask.id === task.id) {
      await openHistory(task);
    }
  };

  const openUsage = async (task: BankTask) => {
    if (!email) return;
    setUsageTask(task);
    setUsageItems([]);
    setUsageError(null);
    setUsageLoading(true);
    const { data, error: err } = await getAdminBankTaskUsage(task.id, email, "active");
    if (err) setUsageError(err);
    else setUsageItems(data?.items || []);
    setUsageLoading(false);
  };

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
            </div>

            {tab === "trash" && (
              <div className="mb-4 text-sm text-gray-700">
                Себеттегі тапсырмалар 30 күннен кейін автоматты түрде жойылады.
              </div>
            )}

            <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-4 space-y-3">
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

            {tab === "active" && showForm && (
              <div className="mb-6 p-4 bg-white/70 rounded-2xl border border-white/40 space-y-3">
                <h2 className="text-xl font-bold text-gray-900">{editingTaskId ? `Өңдеу #${editingTaskId}` : "Жаңа тапсырма"}</h2>
                {editingTaskId && (
                  <div className="text-sm text-gray-600">
                    Нұсқа: v{form.currentVersion ?? "?"}
                  </div>
                )}
                <form onSubmit={handleSubmitForm} className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Тапсырма мәтіні</label>
                    <MathFieldInput
                      value={form.text}
                      onChange={(value) => setForm((prev) => ({ ...prev, text: value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      autoFocus
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-sm font-semibold text-gray-700">Мәтін өлшемі</label>
                      <div className="flex gap-2">
                        {[
                          { label: "S", value: "sm" },
                          { label: "M", value: "md" },
                          { label: "L", value: "lg" },
                        ].map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, text_scale: item.value as TaskTextScale }))}
                            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                              form.text_scale === item.value
                                ? "border-purple-600 bg-purple-600 text-white"
                                : "border-gray-300 bg-white text-gray-700"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={`min-h-[2.5rem] font-semibold text-gray-900 ${getTaskTextScaleClass(form.text_scale)}`}>
                      {form.text ? <MathRender latex={form.text} /> : "Тапсырма мәтіні preview"}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Түрі</label>
                      <select
                        value={form.question_type}
                        onChange={(e) => setForm((prev) => ({ ...prev, question_type: e.target.value as QuestionType }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="input">Енгізу</option>
                        <option value="tf">Шын/Жалған</option>
                        <option value="mcq">MCQ (4)</option>
                        <option value="mcq6">MCQ (6)</option>
                        <option value="select">Сәйкестендіру</option>
                        <option value="factor_grid">Factor Grid</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Күрделілік</label>
                      <select
                        value={form.difficulty}
                        onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value as BankDifficulty }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="A">A (оңай)</option>
                        <option value="B">B (орташа)</option>
                        <option value="C">C (қиын)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Тақырыптар</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {form.topics.map((topic) => (
                        <button key={topic} type="button" onClick={() => removeFormTopic(topic)} className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          {topic} x
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formTopicInput}
                        onChange={(e) => setFormTopicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFormTopic(formTopicInput);
                          }
                        }}
                        placeholder="Тақырып қосу"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                      <button type="button" onClick={() => addFormTopic(formTopicInput)} className="bg-gray-200 hover:bg-gray-300 rounded-lg px-3">+</button>
                    </div>
                    {formTopicSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {formTopicSuggestions.map((topic) => (
                          <button key={topic} type="button" onClick={() => addFormTopic(topic)} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                            {topic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {form.question_type === "input" && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                      <MathFieldInput
                        value={form.answer}
                        onChange={(value) => setForm((prev) => ({ ...prev, answer: value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  )}

                  {form.question_type === "factor_grid" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">ax² #1</label>
                        <MathFieldInput
                          value={form.factorTopLeft}
                          onChange={(value) => setForm((prev) => ({ ...prev, factorTopLeft: value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">c #1</label>
                        <MathFieldInput
                          value={form.factorTopRight}
                          onChange={(value) => setForm((prev) => ({ ...prev, factorTopRight: value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">ax² #2</label>
                        <MathFieldInput
                          value={form.factorBottomLeft}
                          onChange={(value) => setForm((prev) => ({ ...prev, factorBottomLeft: value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">c #2</label>
                        <MathFieldInput
                          value={form.factorBottomRight}
                          onChange={(value) => setForm((prev) => ({ ...prev, factorBottomRight: value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>
                  )}

                  {(form.question_type === "mcq" || form.question_type === "mcq6" || form.question_type === "select") && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">A</label>
                          <MathFieldInput value={form.optionA} onChange={(value) => setForm((prev) => ({ ...prev, optionA: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">B</label>
                          <MathFieldInput value={form.optionB} onChange={(value) => setForm((prev) => ({ ...prev, optionB: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">C</label>
                          <MathFieldInput value={form.optionC} onChange={(value) => setForm((prev) => ({ ...prev, optionC: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">D</label>
                          <MathFieldInput value={form.optionD} onChange={(value) => setForm((prev) => ({ ...prev, optionD: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                      </div>

                      {form.question_type === "mcq6" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">E</label>
                            <MathFieldInput value={form.optionE} onChange={(value) => setForm((prev) => ({ ...prev, optionE: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">F</label>
                            <MathFieldInput value={form.optionF} onChange={(value) => setForm((prev) => ({ ...prev, optionF: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                          </div>
                        </div>
                      )}

                      {(form.question_type === "mcq" || form.question_type === "mcq6") && (
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                          <select
                            value={form.correctOption}
                            onChange={(e) => setForm((prev) => ({ ...prev, correctOption: e.target.value as BankFormState["correctOption"] }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          >
                            <option value="A">MCQ: A</option>
                            <option value="B">MCQ: B</option>
                            <option value="C">MCQ: C</option>
                            <option value="D">MCQ: D</option>
                            {form.question_type === "mcq6" && (
                              <>
                                <option value="E">MCQ: E</option>
                                <option value="F">MCQ: F</option>
                              </>
                            )}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {form.question_type === "select" && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <MathFieldInput value={form.subQuestion1} onChange={(value) => setForm((prev) => ({ ...prev, subQuestion1: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                        <MathFieldInput value={form.subQuestion2} onChange={(value) => setForm((prev) => ({ ...prev, subQuestion2: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select value={form.correctSub1} onChange={(e) => setForm((prev) => ({ ...prev, correctSub1: e.target.value as BankFormState["correctSub1"] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                          <option value="A">Сәйкестендіру-1: A</option>
                          <option value="B">Сәйкестендіру-1: B</option>
                          <option value="C">Сәйкестендіру-1: C</option>
                          <option value="D">Сәйкестендіру-1: D</option>
                        </select>
                        <select value={form.correctSub2} onChange={(e) => setForm((prev) => ({ ...prev, correctSub2: e.target.value as BankFormState["correctSub2"] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                          <option value="A">Сәйкестендіру-2: A</option>
                          <option value="B">Сәйкестендіру-2: B</option>
                          <option value="C">Сәйкестендіру-2: C</option>
                          <option value="D">Сәйкестендіру-2: D</option>
                        </select>
                      </div>
                    </>
                  )}

                  {form.question_type === "tf" && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                      <select value={form.correctTf} onChange={(e) => setForm((prev) => ({ ...prev, correctTf: e.target.value as "true" | "false" }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                        <option value="true">Ш/Ж: Шын</option>
                        <option value="false">Ш/Ж: Жалған</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Сурет</label>
                    <input type="file" accept="image/*" onChange={(e) => setForm((prev) => ({ ...prev, imageFile: e.target.files?.[0] || null, removeImage: false }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                  </div>

                  {form.existingImageFilename && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.removeImage} onChange={(e) => setForm((prev) => ({ ...prev, removeImage: e.target.checked, imageFile: null }))} />
                      Ағымдағы суретті жою ({form.existingImageFilename})
                    </label>
                  )}

                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg">
                      {saving ? "Сақталуда..." : editingTaskId ? "Сақтау" : "Құру"}
                    </button>
                    <button type="button" onClick={resetAndHideForm} className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">
                      Бас тарту
                    </button>
                  </div>
                </form>
              </div>
            )}

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

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">Бет {page} / {totalPages} · Барлығы: {total}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
                  disabled={offset === 0}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  ← Артқа
                </button>
                <button
                  onClick={() => setOffset((prev) => prev + LIMIT)}
                  disabled={offset + LIMIT >= total}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  Алға →
                </button>
              </div>
            </div>

            {pendingDedup && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-2">Ұқсас тапсырмалар табылды</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Төмендегі тізімді тексеріңіз. Бас тартуға немесе мәжбүрлеп сақтауға болады.
                  </p>
                  <div className="space-y-2 mb-4">
                    {pendingDedup.similarTasks.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3">
                        <div className="text-sm text-gray-700 mb-1">
                          #{item.id} · ұқсастық: {(item.score * 100).toFixed(1)}% · {item.question_type}
                        </div>
                        <div className="text-sm text-gray-900 break-words">
                          {item.text ? <MathRender inline latex={item.text} /> : `Тапсырма #${item.id}`}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setPendingDedup(null)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg"
                    >
                      Бас тарту
                    </button>
                    <button
                      onClick={() => submitBankForm(true)}
                      disabled={saving}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                      Соған қарамастан сақтау
                    </button>
                  </div>
                </div>
              </div>
            )}

            {importPreviewState && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-2">JSON импорт preview</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Алдымен тексеру нәтижесі көрсетіледі. Растамайынша базаға ештеңе сақталмайды.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm mb-4">
                    <div className="bg-gray-100 rounded px-2 py-1">Барлығы: {importPreviewState.preview.summary.total_tasks}</div>
                    <div className="bg-green-100 rounded px-2 py-1">Дұрыс: {importPreviewState.preview.summary.valid_count}</div>
                    <div className="bg-red-100 rounded px-2 py-1">Қате: {importPreviewState.preview.summary.invalid_count}</div>
                    <div className="bg-amber-100 rounded px-2 py-1">Дубликат: {importPreviewState.preview.summary.duplicate_count}</div>
                    <div className="bg-blue-100 rounded px-2 py-1 col-span-2 md:col-span-1">
                      Растау: {importPreviewState.preview.summary.can_confirm ? "Иә" : "Жоқ"}
                    </div>
                  </div>

                  {importPreviewState.preview.validation_errors.length > 0 && (
                    <div className="mb-4">
                      <div className="font-semibold mb-2 text-red-700">Валидация қателері</div>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {importPreviewState.preview.validation_errors.map((item, index) => (
                          <li key={`${item.index}-${item.field}-${index}`}>
                            #{item.index + 1} · {item.field}: {item.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreviewState.preview.duplicate_conflicts.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <div className="font-semibold text-amber-700">Ұқсас тапсырмалар</div>
                      {importPreviewState.preview.duplicate_conflicts.map((conflict) => (
                        <div key={`conflict-${conflict.index}`} className="border rounded-lg p-3">
                          <div className="text-sm text-gray-700 mb-2">JSON жолы: #{conflict.index + 1}</div>
                          {conflict.similar_tasks.map((item) => (
                            <div key={`${conflict.index}-${item.id}`} className="border rounded-lg p-3 mb-2 last:mb-0">
                              <div className="text-sm text-gray-700 mb-1">
                                #{item.id} · ұқсастық: {(item.score * 100).toFixed(1)}% · {item.question_type}
                              </div>
                              <div className="text-sm text-gray-900 break-words">
                                {item.text ? <MathRender inline latex={item.text} /> : `Тапсырма #${item.id}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setImportPreviewState(null)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg"
                    >
                      Бас тарту
                    </button>
                    <button
                      onClick={() => void runBankImportConfirm(false)}
                      disabled={
                        confirmingImport ||
                        !importPreviewState.preview.summary.can_confirm ||
                        importPreviewState.preview.summary.duplicate_count > 0
                      }
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                      {confirmingImport ? "Расталуда..." : "Импортты растау"}
                    </button>
                    <button
                      onClick={() => void runBankImportConfirm(true)}
                      disabled={
                        confirmingImport ||
                        !importPreviewState.preview.summary.can_confirm ||
                        importPreviewState.preview.summary.duplicate_count === 0
                      }
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                      Соған қарамастан импорттау
                    </button>
                  </div>
                </div>
              </div>
            )}

            {historyTask && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Тапсырма нұсқаларының тарихы #{historyTask.id}</h3>
                    <button
                      onClick={() => {
                        setHistoryTask(null);
                        setSnapshotView(null);
                      }}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
                    >
                      Жабу
                    </button>
                  </div>
                  {historyLoading ? (
                    <div className="text-sm text-gray-600">Тарих жүктелуде...</div>
                  ) : historyError ? (
                    <div className="text-sm text-red-600">{historyError}</div>
                  ) : historyItems.length === 0 ? (
                    <div className="text-sm text-gray-600">Нұсқалар табылмады</div>
                  ) : (
                    <div className="space-y-2">
                      {historyItems.map((item) => {
                        return (
                          <div key={item.id} className="border rounded-lg p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="text-sm font-semibold">
                                v{item.version_no} · {item.event_type}
                              </div>
                              <div className="text-xs text-gray-500">{item.created_at}</div>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              Өзгерген өрістер: {item.changed_fields?.length ? item.changed_fields.join(", ") : "-"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openSnapshot(historyTask.id, item.version_no)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded-lg"
                              >
                                Нұсқа көрінісі
                              </button>
                              <button
                                onClick={() => handleRollbackVersion(historyTask, item.version_no)}
                                disabled={rollbackLoading}
                                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm px-3 py-1 rounded-lg"
                              >
                                v{item.version_no} нұсқасына қайтару
                              </button>
                              <button
                                onClick={() => handleDeleteVersion(historyTask, item.version_no)}
                                disabled={deleteVersionLoadingNo === item.version_no}
                                className="bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm px-3 py-1 rounded-lg"
                              >
                                Біржола жою
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {snapshotView && (
              <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold">Нұсқа көрінісі v{snapshotView.versionNo}</h3>
                    <button
                      onClick={() => setSnapshotView(null)}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
                    >
                      Жабу
                    </button>
                  </div>
                  <pre className="text-xs bg-gray-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(snapshotView.snapshot, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {usageTask && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Тапсырма #{usageTask.id} қай жерде қолданылады</h3>
                    <button
                      onClick={() => setUsageTask(null)}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
                    >
                      Жабу
                    </button>
                  </div>
                  {usageLoading ? (
                    <div className="text-sm text-gray-600">Жүктелуде...</div>
                  ) : usageError ? (
                    <div className="text-sm text-red-600">{usageError}</div>
                  ) : usageItems.length === 0 ? (
                    <div className="text-sm text-gray-600">Белсенді орналастыру жоқ</div>
                  ) : (
                    <div className="space-y-2">
                      {usageItems.map((item) => (
                        <div key={`${item.kind}-${item.placement_id}`} className="border rounded-lg p-3 text-sm">
                          {item.kind === "trial_test" ? (
                            <div>
                              Сынақ тесті #{item.trial_test_id}: {item.trial_test_title || "-"} · ұяшық {item.sort_order + 1} ·{" "}
                              <Link href="/admin/trial-tests" className="text-blue-600 hover:underline">Ашу</Link>
                            </div>
                          ) : (
                            <div>
                              Модуль: {item.module_name || "-"} · Бөлім: {item.section_name || "-"} · Сабақ: {item.lesson_title || "-"} · орын {item.sort_order + 1} ·{" "}
                              <Link href="/admin/cms" className="text-blue-600 hover:underline">Ашу</Link>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}




