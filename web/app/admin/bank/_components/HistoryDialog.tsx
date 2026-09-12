"use client";
import {
  BankTask,
  BankTaskVersionItem
} from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { JsonEditState, SnapshotViewState } from "./model";

type Props = {
  historyTask: BankTask | null;
  setHistoryTask: Dispatch<SetStateAction<BankTask | null>>;
  setSnapshotView: Dispatch<SetStateAction<SnapshotViewState | null>>;
  setJsonEdit: Dispatch<SetStateAction<JsonEditState | null>>;
  historyLoading: boolean;
  historyError: string | null;
  historyItems: BankTaskVersionItem[];
  openSnapshot: (taskId: number, versionNo: number) => Promise<void>;
  handleRollbackVersion: (task: BankTask, versionNo: number) => Promise<void>;
  rollbackLoading: boolean;
  handleDeleteVersion: (task: BankTask, versionNo: number) => Promise<void>;
  deleteVersionLoadingNo: number | null;
  openJsonEdit: (task: BankTask, versionNo: number) => Promise<void>;
};

export default function HistoryDialog({
  historyTask,
  setHistoryTask,
  setSnapshotView,
  setJsonEdit,
  historyLoading,
  historyError,
  historyItems,
  openSnapshot,
  handleRollbackVersion,
  rollbackLoading,
  handleDeleteVersion,
  deleteVersionLoadingNo,
  openJsonEdit,
}: Props) {
  return (
    <>
      {historyTask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Тапсырма нұсқаларының тарихы #{historyTask.id}</h3>
              <button
                onClick={() => {
                  setHistoryTask(null);
                  setSnapshotView(null);
                  setJsonEdit(null);
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
                        <button
                          onClick={() => openJsonEdit(historyTask, item.version_no)}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1 rounded-lg"
                        >
                          Өңдеу
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
    </>
  );
}
