import { apiPath, fetchWithErrorHandling } from "@/lib/api";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import { Lesson, MiniLesson, MiniLessonTask, Module, Section } from "./model";

type Context = {
  session: Session | null;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  moduleForm: { name: string; description: string; icon: string; sort_order: number; };
  fetchModules: () => Promise<void>;
  setModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  selectedModule: number | null;
  setSelectedModule: Dispatch<SetStateAction<number | null>>;
  setSections: Dispatch<SetStateAction<Section[]>>;
  setSelectedSection: Dispatch<SetStateAction<number | null>>;
  setLessons: Dispatch<SetStateAction<Lesson[]>>;
  setSelectedLesson: Dispatch<SetStateAction<number | null>>;
  setMiniLessons: Dispatch<SetStateAction<MiniLesson[]>>;
  setSelectedMiniLesson: Dispatch<SetStateAction<number | null>>;
  setMiniTasks: Dispatch<SetStateAction<MiniLessonTask[]>>;
  setEditingModule: Dispatch<SetStateAction<number | null>>;
  setEditModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  editingModule: number | null;
  editModuleForm: { name: string; description: string; icon: string; sort_order: number; };
};

export function createModuleActions({
  session,
  setLoading,
  setError,
  moduleForm,
  fetchModules,
  setModuleForm,
  selectedModule,
  setSelectedModule,
  setSections,
  setSelectedSection,
  setLessons,
  setSelectedLesson,
  setMiniLessons,
  setSelectedMiniLesson,
  setMiniTasks,
  setEditingModule,
  setEditModuleForm,
  editingModule,
  editModuleForm,
}: Context) {
  const createModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", moduleForm.name);
    formData.append("description", moduleForm.description || "");
    formData.append("icon", moduleForm.icon || "");
    formData.append("sort_order", moduleForm.sort_order.toString());
    formData.append("email", session.user.email);

    try {
      const response = await fetch(apiPath('admin/modules'), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Модуль құру мүмкін болмады`);
      }

      const data = await response.json();
      await fetchModules();
      setModuleForm({ name: "", description: "", icon: "", sort_order: 0 });
      setError(null);
    } catch (err: any) {
      console.error("Error creating module:", err);
      setError(err.message || "Модуль құру мүмкін болмады. Толығырақ консольде.");
    } finally {
      setLoading(false);
    }
  };

  const deleteModule = async (id: number) => {
    if (!session?.user?.email || !confirm("Модульді жою керек пе? Барлық бөлімдер мен тапсырмалар жойылады.")) return;
    try {
      const { error: deleteError } = await fetchWithErrorHandling<{ success: boolean }>(
        `${apiPath(`admin/modules/${id}`)}?email=${encodeURIComponent(session.user.email)}`,
        { method: "DELETE" }
      );
      if (deleteError) throw new Error(deleteError);
      setError(null);
      await fetchModules();
      if (selectedModule === id) {
        setSelectedModule(null);
        setSections([]);
        setSelectedSection(null);
        setLessons([]);
        setSelectedLesson(null);
        setMiniLessons([]);
        setSelectedMiniLesson(null);
        setMiniTasks([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditModule = (module: Module) => {
    setEditingModule(module.id);
    setEditModuleForm({
      name: module.name,
      description: module.description || "",
      icon: module.icon || "",
      sort_order: module.sort_order
    });
  };

  const cancelEditModule = () => {
    setEditingModule(null);
    setEditModuleForm({ name: "", description: "", icon: "", sort_order: 0 });
  };

  const updateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !editingModule) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", editModuleForm.name);
    formData.append("description", editModuleForm.description || "");
    formData.append("icon", editModuleForm.icon || "");
    formData.append("sort_order", editModuleForm.sort_order.toString());
    formData.append("email", session.user.email);

    try {
      const response = await fetch(apiPath(`admin/modules/${editingModule}`), {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Модульді жаңарту мүмкін болмады`);
      }

      await fetchModules();
      setEditingModule(null);
      setEditModuleForm({ name: "", description: "", icon: "", sort_order: 0 });
      setError(null);
    } catch (err: any) {
      console.error("Error updating module:", err);
      setError(err.message || "Модульді жаңарту мүмкін болмады. Толығырақ консольде.");
    } finally {
      setLoading(false);
    }
  };
  return { createModule, deleteModule, startEditModule, cancelEditModule, updateModule };
}
