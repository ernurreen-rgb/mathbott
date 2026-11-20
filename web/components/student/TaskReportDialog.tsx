"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_TASK_REPORT_LENGTH } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n/provider";
import { tr } from "@/lib/i18n/translate";

const MAX_TASK_REPORT_LENGTH = 500;

type SendTaskReport = (taskId: number, message: string) => Promise<{ error: string | null }>;

/** State and submit flow for the "Шағым" dialog. `send` is null while the user is unknown. */
export function useTaskReport(send: SendTaskReport | null) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const open = (id: number) => {
    setTaskId(id);
    setMessage("");
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (submittingRef.current || !send || taskId === null || trimmed.length < MIN_TASK_REPORT_LENGTH) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { error } = await send(taskId, trimmed);
      if (error) {
        showToast.error(tr("report.errorPrefix", { error }));
        return;
      }
      showToast.success(tr("report.sent"));
      setTaskId(null);
      setMessage("");
    } catch (e: any) {
      showToast.error(tr("report.errorPrefix", { error: e?.message || tr("lesson.networkError") }));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return {
    open,
    dialog: {
      open: taskId !== null,
      message,
      onMessageChange: setMessage,
      submitting,
      onCancel: () => {
        if (!submittingRef.current) setTaskId(null);
      },
      onSubmit: submit,
    },
  };
}

type TaskReportDialogProps = ReturnType<typeof useTaskReport>["dialog"];

export function TaskReportDialog({ open, message, onMessageChange, submitting, onCancel, onSubmit }: TaskReportDialogProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;
  const canSubmit = message.trim().length >= MIN_TASK_REPORT_LENGTH && !submitting;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" role="dialog" aria-modal="true" aria-labelledby="task-report-title">
        <h3 id="task-report-title" className="text-lg font-bold text-gray-900 mb-4">{t("report.title")}</h3>
        <p className="text-gray-600 mb-4">
          {t("report.body")}
        </p>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={t("report.placeholder")}
          className="w-full border border-gray-300 bg-white text-base text-gray-900 placeholder:text-gray-400 caret-purple-600 rounded-lg px-3 py-2 mb-4 min-h-[100px] resize-none focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
          maxLength={MAX_TASK_REPORT_LENGTH}
        />
        <div className="text-sm text-gray-500 mb-4">
          {t("report.counter", { length: message.length, max: MAX_TASK_REPORT_LENGTH, min: MIN_TASK_REPORT_LENGTH })}
        </div>
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
          >
            {submitting ? t("report.sending") : t("report.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
