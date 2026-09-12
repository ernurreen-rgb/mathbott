"use client";
import { TrashTask } from "./model";

type Props = {
  trashOpen: boolean;
  emptyTrash: () => Promise<void>;
  trashLoading: boolean;
  trashTasks: TrashTask[];
  restoreTaskFromTrash: (taskId: number) => Promise<void>;
};

export default function TrashPanel({ trashOpen, emptyTrash, trashLoading, trashTasks, restoreTaskFromTrash }: Props) {
  return (
    <>
      {trashOpen && (
        <div className="mb-4 rounded-2xl border border-white/30 bg-white/80 p-4 shadow-inner">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-800">Жуырда жойылған тапсырмалар</div>
            <button
              type="button"
              onClick={emptyTrash}
              disabled={trashLoading || trashTasks.length === 0}
              className="text-xs px-3 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Себетті тазалау
            </button>
          </div>
          {trashLoading ? (
            <div className="text-sm text-gray-600">Жүктелуде...</div>
          ) : trashTasks.length === 0 ? (
            <div className="text-sm text-gray-500">Себет бос.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {trashTasks
                .slice()
                .sort((a, b) => {
                  const da = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
                  const db = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
                  return db - da;
                })
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white/90 p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        #{t.id}
                      </div>
                      <div className="text-xs text-gray-700 line-clamp-2">{t.text}</div>
                      {t.deleted_at && (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Жойылған уақыты: {new Date(t.deleted_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void restoreTaskFromTrash(t.id)}
                        className="px-3 py-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs"
                      >
                        Қайтару
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
