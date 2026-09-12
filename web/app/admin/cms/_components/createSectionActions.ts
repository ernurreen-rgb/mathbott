import { apiPath } from "@/lib/api";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import { Lesson, MiniLesson, MiniLessonTask, Section } from "./model";

type Context = {
  session: Session | null;
  selectedModule: number | null;
  sectionForm: { name: string; description: string; sort_order: number; };
  fetchSections: (moduleId: number) => Promise<void>;
  setSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  setError: Dispatch<SetStateAction<string | null>>;
  selectedSection: number | null;
  setSelectedSection: Dispatch<SetStateAction<number | null>>;
  setLessons: Dispatch<SetStateAction<Lesson[]>>;
  setSelectedLesson: Dispatch<SetStateAction<number | null>>;
  setMiniLessons: Dispatch<SetStateAction<MiniLesson[]>>;
  setSelectedMiniLesson: Dispatch<SetStateAction<number | null>>;
  setMiniTasks: Dispatch<SetStateAction<MiniLessonTask[]>>;
  setEditingSection: Dispatch<SetStateAction<number | null>>;
  setEditSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  editingSection: number | null;
  setLoading: Dispatch<SetStateAction<boolean>>;
  editSectionForm: { name: string; description: string; sort_order: number; };
};

export function createSectionActions({
  session,
  selectedModule,
  sectionForm,
  fetchSections,
  setSectionForm,
  setError,
  selectedSection,
  setSelectedSection,
  setLessons,
  setSelectedLesson,
  setMiniLessons,
  setSelectedMiniLesson,
  setMiniTasks,
  setEditingSection,
  setEditSectionForm,
  editingSection,
  setLoading,
  editSectionForm,
}: Context) {
  const createSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !selectedModule) return;

    const formData = new FormData();
    formData.append("name", sectionForm.name);
    formData.append("description", sectionForm.description || "");
    formData.append("sort_order", sectionForm.sort_order.toString());
    formData.append("email", session.user.email);

    try {
      const response = await fetch(apiPath(`admin/modules/${selectedModule}/sections`), {
        method: "POST",
        body: formData,
        // Don't set Content-Type - browser will set it automatically with boundary for FormData
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Бөлім құру мүмкін болмады`);
      }
      await fetchSections(selectedModule);
      setSectionForm({ name: "", description: "", sort_order: 0 });
      setError(null);
    } catch (err: any) {
      console.error("Error creating section:", err);
      setError(err.message || "Бөлім құру мүмкін болмады. Толығырақ консольде.");
    }
  };

  const deleteSection = async (id: number) => {
    if (!session?.user?.email || !confirm("Бөлімді жою керек пе? Барлық тапсырмалар жойылады.")) return;
    try {
      const response = await fetch(`${apiPath(`admin/sections/${id}`)}?email=${encodeURIComponent(session.user.email)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Бөлімді жою мүмкін болмады");
      if (selectedModule) await fetchSections(selectedModule);
      if (selectedSection === id) {
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

  const startEditSection = (section: Section) => {
    setEditingSection(section.id);
    setEditSectionForm({
      name: section.name,
      description: section.description || "",
      sort_order: section.sort_order
    });
  };

  const cancelEditSection = () => {
    setEditingSection(null);
    setEditSectionForm({ name: "", description: "", sort_order: 0 });
  };

  const updateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !editingSection) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", editSectionForm.name);
    formData.append("description", editSectionForm.description || "");
    formData.append("sort_order", editSectionForm.sort_order.toString());
    formData.append("email", session.user.email);

    try {
      const response = await fetch(apiPath(`admin/sections/${editingSection}`), {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Бөлімді жаңарту мүмкін болмады`);
      }

      if (selectedModule) await fetchSections(selectedModule);
      setEditingSection(null);
      setEditSectionForm({ name: "", description: "", sort_order: 0 });
      setError(null);
    } catch (err: any) {
      console.error("Error updating section:", err);
      setError(err.message || "Бөлімді жаңарту мүмкін болмады. Толығырақ консольде.");
    } finally {
      setLoading(false);
    }
  };
  return { createSection, deleteSection, startEditSection, cancelEditSection, updateSection };
}
