import { apiPath } from "@/lib/api";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import { Lesson, MiniLesson, MiniLessonTask } from "./model";

type Context = {
  session: Session | null;
  selectedSection: number | null;
  lessonForm: { lesson_number: number; title: string; sort_order: number; };
  fetchLessons: (sectionId: number) => Promise<void>;
  setLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  setError: Dispatch<SetStateAction<string | null>>;
  selectedLesson: number | null;
  setSelectedLesson: Dispatch<SetStateAction<number | null>>;
  setMiniLessons: Dispatch<SetStateAction<MiniLesson[]>>;
  setSelectedMiniLesson: Dispatch<SetStateAction<number | null>>;
  setMiniTasks: Dispatch<SetStateAction<MiniLessonTask[]>>;
  setEditingLesson: Dispatch<SetStateAction<number | null>>;
  setEditLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  editingLesson: number | null;
  editLessonForm: { lesson_number: number; title: string; sort_order: number; };
  fetchMiniLessons: (lessonId: number) => Promise<void>;
};

export function createLessonActions({
  session,
  selectedSection,
  lessonForm,
  fetchLessons,
  setLessonForm,
  setError,
  selectedLesson,
  setSelectedLesson,
  setMiniLessons,
  setSelectedMiniLesson,
  setMiniTasks,
  setEditingLesson,
  setEditLessonForm,
  editingLesson,
  editLessonForm,
  fetchMiniLessons,
}: Context) {
  const createLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !selectedSection) return;

    const formData = new FormData();
    formData.append("lesson_number", lessonForm.lesson_number.toString());
    formData.append("title", lessonForm.title || "");
    formData.append("sort_order", lessonForm.sort_order.toString());
    formData.append("email", session.user.email);

    try {
      const response = await fetch(apiPath(`admin/sections/${selectedSection}/lessons`), {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Сабақ құру мүмкін болмады");
      await fetchLessons(selectedSection);
      setLessonForm({ lesson_number: 1, title: "", sort_order: 0 });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteLesson = async (lessonId: number) => {
    if (!session?.user?.email || !confirm("Сабақты жою керек пе? Кіші сабақтар мен есептер жойылады.")) return;
    try {
      const response = await fetch(`${apiPath(`admin/lessons/${lessonId}`)}?email=${encodeURIComponent(session.user.email)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Сабақты жою мүмкін болмады");
      if (selectedSection) await fetchLessons(selectedSection);
      if (selectedLesson === lessonId) {
        setSelectedLesson(null);
        setMiniLessons([]);
        setSelectedMiniLesson(null);
        setMiniTasks([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson.id);
    setEditLessonForm({
      lesson_number: lesson.lesson_number,
      title: lesson.title || "",
      sort_order: lesson.sort_order,
    });
  };

  const cancelEditLesson = () => {
    setEditingLesson(null);
    setEditLessonForm({ lesson_number: 1, title: "", sort_order: 0 });
  };

  const updateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !editingLesson) return;
    const formData = new FormData();
    formData.append("lesson_number", editLessonForm.lesson_number.toString());
    formData.append("title", editLessonForm.title || "");
    formData.append("sort_order", editLessonForm.sort_order.toString());
    formData.append("email", session.user.email);
    try {
      const response = await fetch(apiPath(`admin/lessons/${editingLesson}`), {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) throw new Error("Сабақты жаңарту мүмкін болмады");
      if (selectedSection) await fetchLessons(selectedSection);
      cancelEditLesson();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateMiniLessonTitle = async (miniLessonId: number, title: string) => {
    if (!session?.user?.email) return;
    const formData = new FormData();
    formData.append("title", title);
    formData.append("email", session.user.email);
    try {
      const response = await fetch(apiPath(`admin/mini-lessons/${miniLessonId}`), {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) throw new Error("Кіші сабақты жаңарту мүмкін болмады");
      if (selectedLesson) await fetchMiniLessons(selectedLesson);
    } catch (err: any) {
      setError(err.message);
    }
  };
  return { createLesson, deleteLesson, startEditLesson, cancelEditLesson, updateLesson, updateMiniLessonTitle };
}
