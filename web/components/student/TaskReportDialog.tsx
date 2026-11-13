"use client";

import { useState } from "react";
import { MIN_TASK_REPORT_LENGTH } from "@/lib/api";
import { showToast } from "@/lib/toast";

const MAX_TASK_REPORT_LENGTH = 500;

type SendTaskReport = (taskId: number, message: string) => Promise<{ error: string | null }>;

/** State and submit flow for the "Шағым" dialog. `send` is null while the user is unknown. */
export function useTaskReport(send: SendTaskReport | null) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = (id: number) => {
    setTaskId(id);
    setMessage("");
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (!send || taskId === null || trimmed.length < MIN_TASK_REPORT_LENGTH) return;
    setSubmitting(true);
    try {
      const { error } = await send(taskId, trimmed);
      if (error) {
        showToast.error(`Қате: ${error}`);
        return;
      }
      showToast.success("Шағым сәтті жіберілді! Әкімші тексерісін күтіңіз.");
      setTaskId(null);
      setMessage("");
    } catch (e: any) {
      showToast.error(`Қате: ${e?.message || "Желі қатесі"}`);
    } finally {
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
      onCancel: () => setTaskId(null),
      onSubmit: submit,
    },
  };
}

type TaskReportDialogProps = ReturnType<typeof useTaskReport>["dialog"];

export function TaskReportDialog({ open, message, onMessageChange, submitting, onCancel, onSubmit }: TaskReportDialogProps) {
  if (!open) return null;
  const canSubmit = message.trim().length >= MIN_TASK_REPORT_LENGTH && !submitting;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" role="dialog" aria-modal="true" aria-labelledby="task-report-title">
        <h3 id="task-report-title" className="text-lg font-bold text-gray-900 mb-4">Шағым жіберу</h3>
        <p className="text-gray-600 mb-4">
          Бұл тапсырмамен мәселе бар ма? Әкімшіге хабарлаңыз.
        </p>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Мәселені сипаттаңыз"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 min-h-[100px] resize-none"
          maxLength={MAX_TASK_REPORT_LENGTH}
        />
        <div className="text-sm text-gray-500 mb-4">
          {message.length}/{MAX_TASK_REPORT_LENGTH} таңба (мин. {MIN_TASK_REPORT_LENGTH})
        </div>
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={submitting}
          >
            Бас тарту
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
          >
            {submitting ? "Жіберіледі..." : "Жіберу"}
          </button>
        </div>
      </div>
    </div>
  );
}
