import {
  exportAdminBankTasksJson,
  importAdminBankTasks
} from "@/lib/api";
import type { Dispatch, SetStateAction } from "react";
import { ImportPreviewState } from "./model";

type Context = {
  email: string | null;
  setImporting: Dispatch<SetStateAction<boolean>>;
  setImportResult: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setImportPreviewState: Dispatch<SetStateAction<ImportPreviewState | null>>;
  setOffset: Dispatch<SetStateAction<number>>;
  fetchTasks: () => Promise<void>;
  importPreviewState: ImportPreviewState | null;
  setConfirmingImport: Dispatch<SetStateAction<boolean>>;
  setExporting: Dispatch<SetStateAction<boolean>>;
};

export function createImportActions({
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
}: Context) {
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

  const handleExportJson = async () => {
    setExporting(true);
    setError(null);

    try {
      const { blob, filename, error: err } = await exportAdminBankTasksJson();
      if (err) {
        setError(err);
        return;
      }
      if (!blob) {
        setError("JSON экспорт қатесі");
        return;
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || "bank_tasks_export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } finally {
      setExporting(false);
    }
  };
  return { normalizeImportTasksPayload, runBankImportDryRun, runBankImportConfirm, handleImportFileChange, handleExportJson };
}
