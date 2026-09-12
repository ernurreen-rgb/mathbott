import { apiPath } from "@/lib/api";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import { TrashTask } from "./model";

type Context = {
  session: Session | null;
  setTrashLoading: Dispatch<SetStateAction<boolean>>;
  setTrashTasks: Dispatch<SetStateAction<TrashTask[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  trashOpen: boolean;
  setTrashOpen: Dispatch<SetStateAction<boolean>>;
  trashTasks: TrashTask[];
  selectedMiniLesson: number | null;
  fetchMiniTasks: (miniLessonId: number) => Promise<void>;
};

export function createTrashActions({
  session,
  setTrashLoading,
  setTrashTasks,
  setError,
  trashOpen,
  setTrashOpen,
  trashTasks,
  selectedMiniLesson,
  fetchMiniTasks,
}: Context) {
  const fetchTrashTasks = async () => {
    if (!session?.user?.email) return;
    setTrashLoading(true);
    try {
      const response = await fetch(
        `${apiPath("admin/tasks/trash")}?email=${encodeURIComponent(session.user.email)}`
      );
      if (!response.ok) {
        throw new Error("Себеттегі тапсырмаларды жүктеу мүмкін болмады");
      }
      const data = await response.json();
      setTrashTasks(data);
    } catch (err: any) {
      console.error("Error fetching trash tasks:", err);
      setError(err.message || "Себетті жүктеу кезінде қате.");
    } finally {
      setTrashLoading(false);
    }
  };

  const toggleTrash = () => {
    const willOpen = !trashOpen;
    setTrashOpen(willOpen);
    if (willOpen && trashTasks.length === 0) {
      void fetchTrashTasks();
    }
  };

  const restoreTaskFromTrash = async (taskId: number) => {
    if (!session?.user?.email) return;
    try {
      const response = await fetch(
        `${apiPath(`admin/tasks/${taskId}/restore`)}?email=${encodeURIComponent(session.user.email)}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || "Тапсырманы қалпына келтіру мүмкін болмады");
      }

      // Remove from local trash list
      setTrashTasks((prev) => prev.filter((t) => t.id !== taskId));

      // Reload tasks for currently opened mini-lesson (if any)
      if (selectedMiniLesson) {
        await fetchMiniTasks(selectedMiniLesson);
      }
    } catch (err: any) {
      console.error("Error restoring task from trash:", err);
      setError(err.message || "Тапсырманы себеттен қайтару кезінде қате.");
    }
  };

  const emptyTrash = async () => {
    if (!session?.user?.email) return;
    if (!confirm("Себетті толық тазалау керек пе? Барлық жойылған тапсырмалар өшіріледі.")) return;
    try {
      const response = await fetch(
        `${apiPath("admin/tasks/trash/empty")}?email=${encodeURIComponent(session.user.email)}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || "Себетті толық тазалау мүмкін болмады");
      }
      setTrashTasks([]);
    } catch (err: any) {
      console.error("Error emptying trash:", err);
      setError(err.message || "Себетті тазалау кезінде қате.");
    }
  };
  return { fetchTrashTasks, toggleTrash, restoreTaskFromTrash, emptyTrash };
}
