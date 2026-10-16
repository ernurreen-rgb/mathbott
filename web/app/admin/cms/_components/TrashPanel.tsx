"use client";
import { TrashTask } from "./model";
import styles from "../CmsWorkspace.module.css";

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
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-800">Жуырда жойылған тапсырмалар</div>
            <button
              type="button"
              onClick={emptyTrash}
              disabled={trashLoading || trashTasks.length === 0}
              className={`${styles.dangerButton} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Себетті тазалау
            </button>
          </div>
          {trashLoading ? (
            <div className="text-sm text-gray-600">Жүктелуде...</div>
          ) : trashTasks.length === 0 ? (
            <div className="text-sm text-gray-500">Себет бос.</div>
          ) : (
            <div className={styles.taskList}>
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
                    className={styles.taskRow}
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
                        className={styles.secondaryButton}
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
