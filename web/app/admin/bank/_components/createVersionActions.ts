import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import {
  deleteAdminBankTaskVersion,
  getAdminBankTaskUsage,
  getAdminBankTaskVersion,
  getAdminBankTaskVersions,
  rollbackAdminBankTask,
  updateAdminBankTask
} from "@/lib/api";
import {
  isMcqQuestionType
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import {
  BankTask,
  BankTaskUsageItem,
  BankTaskVersionItem
} from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { JsonEditState, SnapshotViewState, buildJsonEditValue, normalizeJsonEditArray, normalizeJsonEditDifficulty, normalizeJsonEditQuestionType, normalizeJsonEditStringArray } from "./model";

type Context = {
  email: string | null;
  setHistoryTask: Dispatch<SetStateAction<BankTask | null>>;
  setHistoryItems: Dispatch<SetStateAction<BankTaskVersionItem[]>>;
  setHistoryError: Dispatch<SetStateAction<string | null>>;
  setSnapshotView: Dispatch<SetStateAction<SnapshotViewState | null>>;
  setJsonEdit: Dispatch<SetStateAction<JsonEditState | null>>;
  setHistoryLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  jsonEdit: JsonEditState | null;
  fetchTasks: () => Promise<void>;
  historyTask: BankTask | null;
  setRollbackLoading: Dispatch<SetStateAction<boolean>>;
  setDeleteVersionLoadingNo: Dispatch<SetStateAction<number | null>>;
  snapshotView: SnapshotViewState | null;
  setUsageTask: Dispatch<SetStateAction<BankTask | null>>;
  setUsageItems: Dispatch<SetStateAction<BankTaskUsageItem[]>>;
  setUsageError: Dispatch<SetStateAction<string | null>>;
  setUsageLoading: Dispatch<SetStateAction<boolean>>;
};

export function createVersionActions({
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
}: Context) {
  const openHistory = async (task: BankTask) => {
    if (!email) return;
    setHistoryTask(task);
    setHistoryItems([]);
    setHistoryError(null);
    setSnapshotView(null);
    setJsonEdit(null);
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

  const openJsonEdit = async (task: BankTask, versionNo: number) => {
    if (!email) return;
    setHistoryError(null);
    const { data, error: err } = await getAdminBankTaskVersion(task.id, versionNo, email);
    if (err || !data) {
      setHistoryError(err || "JSON өңдеу үшін нұсқаны жүктеу мүмкін болмады");
      return;
    }
    setJsonEdit({
      task,
      versionNo,
      value: buildJsonEditValue(data.snapshot, task),
      error: null,
      saving: false,
      canForceSave: false,
    });
  };

  const saveJsonEdit = async (dedupConfirmed: boolean = false) => {
    if (!email || !jsonEdit) return;

    try {
      let parsed: Record<string, unknown>;
      try {
        const raw = JSON.parse(jsonEdit.value);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error("JSON object болуы керек");
        }
        parsed = raw as Record<string, unknown>;
      } catch (err: any) {
        setJsonEdit((prev) => (prev ? { ...prev, error: err?.message || "JSON форматы қате", canForceSave: false } : prev));
        return;
      }

      const text = String(parsed.text ?? "").trim();
      if (!text) {
        setJsonEdit((prev) => (prev ? { ...prev, error: "text бос болмауы керек", canForceSave: false } : prev));
        return;
      }

      const questionType = normalizeJsonEditQuestionType(parsed.question_type ?? jsonEdit.task.question_type);
      const answerMode = getTaskAnswerMode({
        question_type: questionType,
        answer_mode: typeof parsed.answer_mode === "string" ? parsed.answer_mode : jsonEdit.task.answer_mode,
      });
      const formData = new FormData();
      formData.append("text", text);
      formData.append("answer", String(parsed.answer ?? ""));
      formData.append("question_type", questionType);
      formData.append("answer_mode", answerMode);
      formData.append(
        "accepted_answers",
        JSON.stringify(normalizeAcceptedAnswers(normalizeJsonEditStringArray(parsed.accepted_answers)))
      );
      formData.append("text_scale", normalizeTaskTextScale(typeof parsed.text_scale === "string" ? parsed.text_scale : null));
      formData.append("difficulty", normalizeJsonEditDifficulty(parsed.difficulty));
      formData.append("topics", JSON.stringify(normalizeJsonEditStringArray(parsed.topics)));
      if (isMcqQuestionType(questionType) || questionType === "select") {
        formData.append("options", JSON.stringify(normalizeJsonEditArray(parsed.options)));
      } else {
        formData.append("options", "");
      }
      if (questionType === "select") {
        formData.append("subquestions", JSON.stringify(normalizeJsonEditArray(parsed.subquestions)));
      } else {
        formData.append("subquestions", "");
      }
      if (dedupConfirmed) formData.append("dedup_confirmed", "true");
      if (typeof jsonEdit.task.current_version === "number") {
        formData.append("expected_current_version", String(jsonEdit.task.current_version));
      }

      setJsonEdit((prev) => (prev ? { ...prev, saving: true, error: null, canForceSave: false } : prev));

      const { error: err, conflict } = await updateAdminBankTask(jsonEdit.task.id, formData, email);
      if (conflict?.code === "SIMILAR_TASKS_FOUND") {
        setJsonEdit((prev) =>
          prev
            ? {
              ...prev,
              saving: false,
              error: conflict.message || "Ұқсас тапсырмалар табылды. Қажет болса, мәжбүрлеп сақтаңыз.",
              canForceSave: true,
            }
            : prev
        );
        return;
      }
      if (conflict?.code === "VERSION_CONFLICT") {
        setJsonEdit((prev) =>
          prev
            ? {
              ...prev,
              saving: false,
              error: conflict.message || "Тапсырма нұсқасы ескірген. Тарихты қайта ашып көріңіз.",
              canForceSave: false,
            }
            : prev
        );
        await fetchTasks();
        return;
      }
      if (err) {
        setJsonEdit((prev) => (prev ? { ...prev, saving: false, error: err, canForceSave: false } : prev));
        return;
      }

      setJsonEdit(null);
      setSnapshotView(null);
      await fetchTasks();
      if (historyTask && historyTask.id === jsonEdit.task.id) {
        await openHistory(jsonEdit.task);
      }
    } catch (err: any) {
      setJsonEdit((prev) =>
        prev ? { ...prev, saving: false, error: err?.message || "JSON арқылы сақтау қатесі", canForceSave: false } : prev
      );
    }
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
  return { openHistory, openSnapshot, openJsonEdit, saveJsonEdit, handleRollbackVersion, handleDeleteVersion, openUsage };
}
