"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { apiPath } from "@/lib/api";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import VisualTaskEditor from "@/components/admin/VisualTaskEditor";
import MathRender from "@/components/ui/MathRender";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { TaskTextScale } from "@/types";

interface Module {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
}

interface Section {
  id: number;
  module_id: number;
  name: string;
  sort_order: number;
  description?: string | null;
  guide?: string | null;
}

interface Lesson {
  id: number;
  section_id: number;
  lesson_number: number;
  title?: string;
  sort_order: number;
}

interface MiniLesson {
  id: number;
  lesson_id: number;
  mini_index: number;
  title?: string;
  sort_order: number;
}

interface MiniLessonTask {
  id: number;
  text: string;
  answer: string;
  question_type?: "tf" | "mcq" | "mcq6" | "input" | "select" | "factor_grid";
  options?: string | any[] | null;
  subquestions?: string | any[] | null;
  sort_order: number;
  bank_task_id?: number | null;
  bank_difficulty?: "A" | "B" | "C" | null;
  bank_topics?: string[];
  text_scale?: TaskTextScale | null;
}

interface TrashTask {
  id: number;
  text: string;
  answer: string;
  deleted_at?: string;
}

const parseBankTaskId = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseBankTopicsRaw = (raw: string): string[] => {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const item of raw.split(",")) {
    const topic = item.trim();
    if (!topic) continue;
    const normalized = topic.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    topics.push(topic.slice(0, 64));
    if (topics.length >= 10) break;
  }
  return topics;
};

const stringifyTopics = (topics?: string[] | null): string => {
  if (!Array.isArray(topics)) return "";
  return topics.filter((topic) => typeof topic === "string" && topic.trim()).join(", ");
};

const formatQuestionTypeLabel = (questionType?: string | null): string => {
  switch (questionType) {
    case "input":
      return "Енгізу";
    case "tf":
      return "Ш/Ж";
    case "mcq":
      return "MCQ (4)";
    case "mcq6":
      return "MCQ (6)";
    case "select":
      return "Сәйкестендіру";
    case "factor_grid":
      return "Factor Grid";
    default:
      return questionType || "Енгізу";
  }
};

const TASK_TEXT_SCALE_OPTIONS: Array<{ value: TaskTextScale; label: string }> = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];



export default function CMSPage() {
  const { data: session, status } = useSession();
  const sessionEmail = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("content", status, sessionEmail);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
  const [miniLessons, setMiniLessons] = useState<MiniLesson[]>([]);
  const [selectedMiniLesson, setSelectedMiniLesson] = useState<number | null>(null);
  const [miniTasks, setMiniTasks] = useState<MiniLessonTask[]>([]);

  // Trash for deleted tasks
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashTasks, setTrashTasks] = useState<TrashTask[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [useVisualEditor, setUseVisualEditor] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [moduleForm, setModuleForm] = useState({ name: "", description: "", icon: "", sort_order: 0 });
  const [sectionForm, setSectionForm] = useState({ name: "", description: "", sort_order: 0 });
  const [lessonForm, setLessonForm] = useState({ lesson_number: 1, title: "", sort_order: 0 });
  const [taskForm, setTaskForm] = useState({
    text: "",
    question_type: "mcq" as "tf" | "mcq" | "mcq6" | "input" | "select",
    text_scale: "md" as TaskTextScale,
    answer: "",
    sort_order: 0,
    bankTaskId: "",
    bank_difficulty: "B" as "A" | "B" | "C",
    bank_topics_raw: "",
    imageFile: null as File | null,
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    optionE: "",
    optionF: "",
    correctOption: "A" as "A" | "B" | "C" | "D" | "E" | "F",
    correctTf: "true" as "true" | "false",
    subQuestion1: "",
    subQuestion2: "",
    correctSub1: "A" as "A" | "B" | "C" | "D",
    correctSub2: "A" as "A" | "B" | "C" | "D",
  });

  // Lesson edit states
  const [editingLesson, setEditingLesson] = useState<number | null>(null);
  const [editLessonForm, setEditLessonForm] = useState({ lesson_number: 1, title: "", sort_order: 0 });

  // Task edit states (mini-lesson tasks)
  const [editingMiniTask, setEditingMiniTask] = useState<number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({
    text: "",
    question_type: "mcq" as "tf" | "mcq" | "mcq6" | "input" | "select",
    text_scale: "md" as TaskTextScale,
    answer: "",
    sort_order: 0,
    bank_task_id: null as number | null,
    bank_difficulty: "B" as "A" | "B" | "C",
    bank_topics_raw: "",
    imageFile: null as File | null,
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    optionE: "",
    optionF: "",
    correctOption: "A" as "A" | "B" | "C" | "D" | "E" | "F",
    correctTf: "true" as "true" | "false",
    subQuestion1: "",
    subQuestion2: "",
    correctSub1: "A" as "A" | "B" | "C" | "D",
    correctSub2: "A" as "A" | "B" | "C" | "D",
  });
  
  // Edit states
  const [editingModule, setEditingModule] = useState<number | null>(null);
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editModuleForm, setEditModuleForm] = useState({ name: "", description: "", icon: "", sort_order: 0 });
  const [editSectionForm, setEditSectionForm] = useState({ name: "", description: "", sort_order: 0 });
  const createUsesBank = parseBankTaskId(taskForm.bankTaskId) !== null;
  const editHasLinkedBankTask = parseBankTaskId(editTaskForm.bank_task_id) !== null;

  useEffect(() => {
    if (selectedSection && session?.user?.email) {
      fetchLessons(selectedSection);
    } else {
      setLessons([]);
      setSelectedLesson(null);
      setMiniLessons([]);
      setSelectedMiniLesson(null);
      setMiniTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection, session?.user?.email]);

  useEffect(() => {
    if (selectedLesson && session?.user?.email) {
      fetchMiniLessons(selectedLesson);
    } else {
      setMiniLessons([]);
      setSelectedMiniLesson(null);
      setMiniTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLesson, session?.user?.email]);

  useEffect(() => {
    if (selectedMiniLesson && session?.user?.email) {
      fetchMiniTasks(selectedMiniLesson);
    } else {
      setMiniTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMiniLesson, session?.user?.email]);

  const fetchModules = useCallback(async () => {
    if (!sessionEmail) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiPath('admin/modules')}?email=${encodeURIComponent(sessionEmail)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Модульдерді жүктеу мүмкін болмады`);
      }
      const data = await response.json();
      setModules(data);
    } catch (err: any) {
      console.error("Error fetching modules:", err);
      setError(err.message || "Модульдерді жүктеу мүмкін болмады. Толығырақ консольде.");
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  const fetchSections = useCallback(async (moduleId: number) => {
    if (!sessionEmail) return;
    try {
      const response = await fetch(`${apiPath(`admin/modules/${moduleId}/sections`)}?email=${encodeURIComponent(sessionEmail)}`);
      if (!response.ok) throw new Error("Бөлімдерді жүктеу мүмкін болмады");
      const data = await response.json();
      setSections(data);
      setSelectedSection(null);
      setLessons([]);
      setSelectedLesson(null);
      setMiniLessons([]);
      setSelectedMiniLesson(null);
      setMiniTasks([]);
    } catch (err: any) {
      setError(err.message);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (sessionEmail) {
      void fetchModules();
    }
  }, [sessionEmail, fetchModules]);

  useEffect(() => {
    if (selectedModule && sessionEmail) {
      void fetchSections(selectedModule);
    }
  }, [selectedModule, sessionEmail, fetchSections]);

  const fetchLessons = async (sectionId: number) => {
    if (!session?.user?.email) return;
    try {
      const response = await fetch(`${apiPath(`admin/sections/${sectionId}/lessons`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Сабақтарды жүктеу мүмкін болмады");
      const data = await response.json();
      setLessons(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchMiniLessons = async (lessonId: number) => {
    if (!session?.user?.email) return;
    try {
      const response = await fetch(`${apiPath(`admin/lessons/${lessonId}/mini-lessons`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Кіші сабақтарды жүктеу мүмкін болмады");
      const data = await response.json();
      setMiniLessons(data);
      setSelectedMiniLesson((prev) => prev ?? (data?.[0]?.id ?? null));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchMiniTasks = async (miniLessonId: number) => {
    if (!session?.user?.email) return;
    try {
      const response = await fetch(`${apiPath(`admin/mini-lessons/${miniLessonId}/tasks`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Кіші сабақ тапсырмаларын жүктеу мүмкін болмады");
      const data = await response.json();
      setMiniTasks(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const extractClipboardImageFile = (items: DataTransferItemList | null): File | null => {
    if (!items) return null;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) return null;
      const ext = file.type.split("/")[1] || "png";
      return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
    }
    return null;
  };

  const handlePasteImageCreate = (e: React.ClipboardEvent) => {
    const file = extractClipboardImageFile(e.clipboardData?.items || null);
    if (!file) return;
    e.preventDefault();
    setTaskForm((prev) => ({ ...prev, imageFile: file }));
  };

  const handlePasteImageEdit = (e: React.ClipboardEvent) => {
    const file = extractClipboardImageFile(e.clipboardData?.items || null);
    if (!file) return;
    e.preventDefault();
    setEditTaskForm((prev) => ({ ...prev, imageFile: file }));
  };

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

  const createMiniLessonTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !selectedMiniLesson) return;

    const rawBankTaskId = taskForm.bankTaskId.trim();
    const linkedBankTaskId = parseBankTaskId(rawBankTaskId);
    if (rawBankTaskId && !linkedBankTaskId) {
      setError("БАНК тапсырма ID қате");
      return;
    }

    const formData = new FormData();
    formData.append("sort_order", taskForm.sort_order.toString());
    formData.append("question_type", taskForm.question_type);
    formData.append("text_scale", taskForm.text_scale);
    formData.append("email", session.user.email);
    formData.append("bank_difficulty", taskForm.bank_difficulty);
    formData.append("bank_topics", JSON.stringify(parseBankTopicsRaw(taskForm.bank_topics_raw)));

    if (linkedBankTaskId) {
      formData.append("bank_task_id", String(linkedBankTaskId));
    } else {
      formData.append("text", taskForm.text || "");
      if (taskForm.question_type === "mcq" || taskForm.question_type === "mcq6") {
        const options = [
          { label: "A", text: taskForm.optionA },
          { label: "B", text: taskForm.optionB },
          { label: "C", text: taskForm.optionC },
          { label: "D", text: taskForm.optionD },
          ...(taskForm.question_type === "mcq6"
            ? [
                { label: "E", text: taskForm.optionE },
                { label: "F", text: taskForm.optionF },
              ]
            : []),
        ];
        formData.append("options", JSON.stringify(options));
        formData.append("answer", taskForm.correctOption);
      } else if (taskForm.question_type === "select") {
        if (!taskForm.subQuestion1.trim() || !taskForm.subQuestion2.trim()) {
          setError("select үшін екі қосымша сұрақ мәтінін енгізіңіз");
          return;
        }
        const options = [
          { label: "A", text: taskForm.optionA },
          { label: "B", text: taskForm.optionB },
          { label: "C", text: taskForm.optionC },
          { label: "D", text: taskForm.optionD },
        ];
        const subquestions = [
          { text: taskForm.subQuestion1.trim(), correct: taskForm.correctSub1 },
          { text: taskForm.subQuestion2.trim(), correct: taskForm.correctSub2 },
        ];
        formData.append("options", JSON.stringify(options));
        formData.append("subquestions", JSON.stringify(subquestions));
        formData.append("answer", JSON.stringify([taskForm.correctSub1, taskForm.correctSub2]));
      } else if (taskForm.question_type === "tf") {
        formData.append("answer", taskForm.correctTf);
      } else {
        formData.append("answer", taskForm.answer || "");
      }

      if (taskForm.imageFile) {
        formData.append("image", taskForm.imageFile);
      }
    }

    try {
      const response = await fetch(apiPath(`admin/mini-lessons/${selectedMiniLesson}/tasks`), {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Тапсырма құру мүмкін болмады");
      await fetchMiniTasks(selectedMiniLesson);
      setTaskForm({
        text: "",
        question_type: "mcq",
        text_scale: "md",
        answer: "",
        sort_order: 0,
        bankTaskId: "",
        bank_difficulty: "B",
        bank_topics_raw: "",
        imageFile: null,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        optionE: "",
        optionF: "",
        correctOption: "A",
        correctTf: "true",
        subQuestion1: "",
        subQuestion2: "",
        correctSub1: "A",
        correctSub2: "A",
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteMiniLessonTask = async (taskId: number) => {
    if (!session?.user?.email || !confirm("Есепті жою керек пе?")) return;
    try {
      const response = await fetch(`${apiPath(`admin/tasks/${taskId}`)}?email=${encodeURIComponent(session.user.email)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Тапсырманы жою мүмкін болмады");
      if (selectedMiniLesson) await fetchMiniTasks(selectedMiniLesson);
    } catch (err: any) {
      setError(err.message);
    }
  };

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

  const startEditMiniLessonTask = (task: MiniLessonTask) => {
    setEditingMiniTask(task.id);

    let optionA = "";
    let optionB = "";
    let optionC = "";
    let optionD = "";
    let optionE = "";
    let optionF = "";
    try {
      const parsed = task.options
        ? (typeof task.options === "string" ? JSON.parse(task.options) : task.options)
        : null;
      if (Array.isArray(parsed)) {
        for (const o of parsed) {
          if (o?.label === "A") optionA = o.text || "";
          if (o?.label === "B") optionB = o.text || "";
          if (o?.label === "C") optionC = o.text || "";
          if (o?.label === "D") optionD = o.text || "";
          if (o?.label === "E") optionE = o.text || "";
          if (o?.label === "F") optionF = o.text || "";
        }
      }
    } catch {
      // ignore
    }

    let subQuestion1 = "";
    let subQuestion2 = "";
    let correctSub1: "A" | "B" | "C" | "D" = "A";
    let correctSub2: "A" | "B" | "C" | "D" = "A";
    if (task.subquestions) {
      try {
        const parsed = typeof task.subquestions === "string"
          ? JSON.parse(task.subquestions)
          : task.subquestions;
        if (Array.isArray(parsed) && parsed.length >= 2) {
          subQuestion1 = parsed[0]?.text || "";
          subQuestion2 = parsed[1]?.text || "";
          correctSub1 = (parsed[0]?.correct || "A") as any;
          correctSub2 = (parsed[1]?.correct || "A") as any;
        }
      } catch {
        // ignore parse errors
      }
    } else if (task.answer) {
      try {
        const parsedAnswer = JSON.parse(task.answer);
        if (Array.isArray(parsedAnswer) && parsedAnswer.length >= 2) {
          correctSub1 = (parsedAnswer[0] || "A") as any;
          correctSub2 = (parsedAnswer[1] || "A") as any;
        }
      } catch {
        // ignore
      }
    }

    const correctOption =
      (task.question_type || "input") === "mcq" || (task.question_type || "input") === "mcq6"
        ? ((task.answer || "A") as any)
        : "A";
    const fallbackDifficulty = (task as any)?.bank_task?.difficulty;
    const fallbackTopics = Array.isArray((task as any)?.bank_task?.topics) ? (task as any).bank_task.topics : [];
    const fallbackTextScale = normalizeTaskTextScale(
      task.text_scale || (task as any)?.bank_task?.text_scale || "md"
    );

    setEditTaskForm({
      text: task.text || "",
      question_type: (task.question_type || "input") as any,
      text_scale: fallbackTextScale,
      answer: task.answer || "",
      sort_order: task.sort_order || 0,
      bank_task_id: parseBankTaskId(task.bank_task_id),
      bank_difficulty: ((task.bank_difficulty || fallbackDifficulty || "B") as "A" | "B" | "C"),
      bank_topics_raw: stringifyTopics(Array.isArray(task.bank_topics) ? task.bank_topics : fallbackTopics),
      imageFile: null,
      optionA,
      optionB,
      optionC,
      optionD,
      optionE,
      optionF,
      correctOption,
      correctTf: (task.answer === "false" ? "false" : "true") as any,
      subQuestion1,
      subQuestion2,
      correctSub1,
      correctSub2,
    });
  };

  const cancelEditMiniLessonTask = () => {
    setEditingMiniTask(null);
    setEditTaskForm({
      text: "",
      question_type: "mcq",
      text_scale: "md",
      answer: "",
      sort_order: 0,
      bank_task_id: null,
      bank_difficulty: "B",
      bank_topics_raw: "",
      imageFile: null,
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      optionE: "",
      optionF: "",
      correctOption: "A",
      correctTf: "true",
      subQuestion1: "",
      subQuestion2: "",
      correctSub1: "A",
      correctSub2: "A",
    });
  };

  const updateMiniLessonTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !editingMiniTask) return;

    const formData = new FormData();
    formData.append("text", editTaskForm.text || "");
    formData.append("sort_order", editTaskForm.sort_order.toString());
    formData.append("question_type", editTaskForm.question_type);
    formData.append("text_scale", editTaskForm.text_scale);
    formData.append("email", session.user.email);
    if (editTaskForm.bank_difficulty) {
      formData.append("bank_difficulty", editTaskForm.bank_difficulty);
    }
    formData.append("bank_topics", JSON.stringify(parseBankTopicsRaw(editTaskForm.bank_topics_raw)));

    if (editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6") {
      const options = [
        { label: "A", text: editTaskForm.optionA },
        { label: "B", text: editTaskForm.optionB },
        { label: "C", text: editTaskForm.optionC },
        { label: "D", text: editTaskForm.optionD },
        ...(editTaskForm.question_type === "mcq6"
          ? [
              { label: "E", text: editTaskForm.optionE },
              { label: "F", text: editTaskForm.optionF },
            ]
          : []),
      ];
      formData.append("options", JSON.stringify(options));
      formData.append("answer", editTaskForm.correctOption);
    } else if (editTaskForm.question_type === "select") {
      if (!editTaskForm.subQuestion1.trim() || !editTaskForm.subQuestion2.trim()) {
        setError("select үшін екі қосымша сұрақ мәтінін енгізіңіз");
        return;
      }
      const options = [
        { label: "A", text: editTaskForm.optionA },
        { label: "B", text: editTaskForm.optionB },
        { label: "C", text: editTaskForm.optionC },
        { label: "D", text: editTaskForm.optionD },
      ];
      const subquestions = [
        { text: editTaskForm.subQuestion1.trim(), correct: editTaskForm.correctSub1 },
        { text: editTaskForm.subQuestion2.trim(), correct: editTaskForm.correctSub2 },
      ];
      formData.append("options", JSON.stringify(options));
      formData.append("subquestions", JSON.stringify(subquestions));
      formData.append("answer", JSON.stringify([editTaskForm.correctSub1, editTaskForm.correctSub2]));
    } else if (editTaskForm.question_type === "tf") {
      formData.append("answer", editTaskForm.correctTf);
      formData.append("options", "");
    } else {
      formData.append("answer", editTaskForm.answer || "");
      formData.append("options", "");
    }

    if (editTaskForm.imageFile) {
      formData.append("image", editTaskForm.imageFile);
    }

    try {
      const response = await fetch(apiPath(`admin/tasks/${editingMiniTask}`), {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) throw new Error("Тапсырманы жаңарту мүмкін болмады");
      if (selectedMiniLesson) await fetchMiniTasks(selectedMiniLesson);
      cancelEditMiniLessonTask();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteModule = async (id: number) => {
    if (!session?.user?.email || !confirm("Модульді жою керек пе? Барлық бөлімдер мен тапсырмалар жойылады.")) return;
    try {
      const response = await fetch(`${apiPath(`admin/modules/${id}`)}?email=${encodeURIComponent(session.user.email)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Модульді жою мүмкін болмады");
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

  // Edit functions
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

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">CMS-ке қол жеткізу үшін кіріңіз</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                🛠️ CMS - Контентті басқару
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTrash}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-white/40 bg-white/10 text-sm text-white hover:bg-white/20 shadow-sm"
                  title="Жойылған тапсырмалар себеті"
                >
                  <span>🗑️</span>
                  <span className="hidden sm:inline">Себет</span>
                </button>
              </div>
            </div>

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

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Модули */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-800">Модульдер</h2>
                
                <form onSubmit={createModule} className="glass rounded-xl p-4 border border-white/20">
                  <input
                    type="text"
                    placeholder="Модуль атауы"
                    value={moduleForm.name}
                    onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
                    className="w-full mb-2 p-2 rounded border"
                    required
                  />
                  <textarea
                    placeholder="Сипаттама"
                    value={moduleForm.description}
                    onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                    className="w-full mb-2 p-2 rounded border"
                  />
                  <input
                    type="text"
                    placeholder="Белгіше (эмодзи)"
                    value={moduleForm.icon}
                    onChange={(e) => setModuleForm({ ...moduleForm, icon: e.target.value })}
                    className="w-full mb-2 p-2 rounded border"
                  />
                  <input
                    type="number"
                    placeholder="Сұрыптау тәртібі"
                    value={moduleForm.sort_order}
                    onChange={(e) => setModuleForm({ ...moduleForm, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full mb-2 p-2 rounded border"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
                  >
                    Модуль құру
                  </button>
                </form>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {modules.map((module) => (
                    <div
                      key={module.id}
                      className={`p-3 rounded border transition-all ${
                        selectedModule === module.id
                          ? "bg-purple-100 border-purple-500"
                          : "bg-white/50 border-gray-200 hover:border-purple-300"
                      } ${editingModule === module.id ? "" : "cursor-pointer"}`}
                      onClick={() => {
                        if (editingModule !== module.id) {
                          setSelectedModule(module.id);
                        }
                      }}
                    >
                      {editingModule === module.id ? (
                        <form onSubmit={updateModule} className="space-y-2">
                          <input
                            type="text"
                            value={editModuleForm.name}
                            onChange={(e) => setEditModuleForm({ ...editModuleForm, name: e.target.value })}
                            className="w-full p-2 rounded border text-sm"
                            placeholder="Атау"
                            required
                            onClick={(e) => e.stopPropagation()}
                          />
                          <textarea
                            value={editModuleForm.description}
                            onChange={(e) => setEditModuleForm({ ...editModuleForm, description: e.target.value })}
                            className="w-full p-2 rounded border text-sm"
                            placeholder="Сипаттама"
                            rows={2}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <input
                            type="text"
                            value={editModuleForm.icon}
                            onChange={(e) => setEditModuleForm({ ...editModuleForm, icon: e.target.value })}
                            className="w-full p-2 rounded border text-sm"
                            placeholder="Белгіше"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <input
                            type="number"
                            value={editModuleForm.sort_order}
                            onChange={(e) => setEditModuleForm({ ...editModuleForm, sort_order: parseInt(e.target.value) || 0 })}
                            className="w-full p-2 rounded border text-sm"
                            placeholder="Қатар"
                            required
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEditModule();
                              }}
                              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                            >
                              ✕
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-bold">{module.icon} {module.name}</div>
                                <div className="text-sm text-gray-600">Қатар: {module.sort_order}</div>
                            {module.description && (
                              <div className="text-xs text-gray-500 mt-1">{module.description}</div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditModule(module);
                              }}
                              className="text-blue-600 hover:text-blue-800"
                              title="Өңдеу"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteModule(module.id);
                              }}
                              className="text-red-600 hover:text-red-800"
                              title="Жою"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Бөлімдер */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-800">Бөлімдер</h2>
                
                {selectedModule ? (
                  <>
                    <form onSubmit={createSection} className="glass rounded-xl p-4 border border-white/20 space-y-2">
                      <input
                        type="text"
                        placeholder="Бөлім атауы"
                        value={sectionForm.name}
                        onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                        className="w-full p-2 rounded border"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Қысқаша сипаттама (мысалы: бөлім не туралы)"
                        value={sectionForm.description}
                        onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                        className="w-full p-2 rounded border text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Сұрыптау тәртібі"
                        value={sectionForm.sort_order}
                        onChange={(e) => setSectionForm({ ...sectionForm, sort_order: parseInt(e.target.value) || 0 })}
                        className="w-full p-2 rounded border"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
                      >
                        Бөлім құру
                      </button>
                    </form>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {sections.map((section) => (
                        <div
                          key={section.id}
                          className={`p-3 rounded border transition-all ${
                            selectedSection === section.id
                              ? "bg-purple-100 border-purple-500"
                              : "bg-white/50 border-gray-200 hover:border-purple-300"
                          } ${editingSection === section.id ? "" : "cursor-pointer"}`}
                          onClick={() => {
                            if (editingSection !== section.id) {
                              setSelectedSection(section.id);
                              setSelectedLesson(null);
                              setMiniLessons([]);
                              setSelectedMiniLesson(null);
                              setMiniTasks([]);
                            }
                          }}
                        >
                          {editingSection === section.id ? (
                            <form onSubmit={updateSection} className="space-y-2">
                              <input
                                type="text"
                                value={editSectionForm.name}
                                onChange={(e) => setEditSectionForm({ ...editSectionForm, name: e.target.value })}
                                className="w-full p-2 rounded border text-sm"
                                placeholder="Бөлім атауы"
                                required
                                onClick={(e) => e.stopPropagation()}
                              />
                              <textarea
                                value={editSectionForm.description}
                                onChange={(e) =>
                                  setEditSectionForm({ ...editSectionForm, description: e.target.value })
                                }
                                className="w-full p-2 rounded border text-xs"
                                placeholder="Қысқаша сипаттама"
                                rows={2}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <input
                                type="number"
                                value={editSectionForm.sort_order}
                                onChange={(e) =>
                                  setEditSectionForm({
                                    ...editSectionForm,
                                    sort_order: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-full p-2 rounded border text-sm"
                                placeholder="Қатар"
                                required
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditSection();
                                  }}
                                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                                >
                                  ✕
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div className="min-w-0">
                                <div className="font-bold">{section.name}</div>
                                {section.description && (
                                  <div className="text-xs text-gray-600 truncate max-w-[220px]">
                                    {section.description}
                                  </div>
                                )}
                                <div className="text-xs text-gray-500 mt-0.5">Қатар: {section.sort_order}</div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditSection(section);
                                  }}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Өңдеу"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSection(section.id);
                                  }}
                                  className="text-red-600 hover:text-red-800"
                                  title="Жою"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Бөлімдерді басқару үшін модульді таңдаңыз
                  </div>
                )}
              </div>

              {/* Сабақтар / кіші сабақтар / тапсырмалар + бөлім анықтамалығы */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-800">Сабақтар</h2>

                {!selectedSection ? (
                  <div className="text-center py-8 text-gray-500">Бөлімді таңдаңыз</div>
                ) : (
                  <>
                    <form onSubmit={createLesson} className="glass rounded-xl p-4 border border-white/20">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="number"
                          value={lessonForm.lesson_number}
                          onChange={(e) => setLessonForm({ ...lessonForm, lesson_number: parseInt(e.target.value) || 1 })}
                          className="p-2 rounded border"
                          placeholder="Сабақ нөмірі"
                          required
                        />
                        <input
                          type="text"
                          value={lessonForm.title}
                          onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                          className="p-2 rounded border"
                          placeholder="Атауы (міндетті емес)"
                        />
                        <input
                          type="number"
                          value={lessonForm.sort_order}
                          onChange={(e) => setLessonForm({ ...lessonForm, sort_order: parseInt(e.target.value) || 0 })}
                          className="p-2 rounded border"
                          placeholder="Қатар"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full mt-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
                      >
                        Сабақ құру (авто: 4 кіші сабақ)
                      </button>
                    </form>

                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {lessons
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order || a.lesson_number - b.lesson_number)
                        .map((l) => (
                          <div
                            key={l.id}
                            className={`p-3 rounded border transition-all ${
                              selectedLesson === l.id
                                ? "bg-purple-100 border-purple-500"
                                : "bg-white/50 border-gray-200 hover:border-purple-300"
                            } cursor-pointer`}
                            onClick={() => setSelectedLesson(l.id)}
                          >
                            {editingLesson === l.id ? (
                              <form onSubmit={updateLesson} className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <input
                                    type="number"
                                    value={editLessonForm.lesson_number}
                                    onChange={(e) => setEditLessonForm({ ...editLessonForm, lesson_number: parseInt(e.target.value) || 1 })}
                                    className="p-2 rounded border text-sm"
                                    required
                                  />
                                  <input
                                    type="text"
                                    value={editLessonForm.title}
                                    onChange={(e) => setEditLessonForm({ ...editLessonForm, title: e.target.value })}
                                    className="p-2 rounded border text-sm"
                                    placeholder="Название"
                                  />
                                  <input
                                    type="number"
                                    value={editLessonForm.sort_order}
                                    onChange={(e) => setEditLessonForm({ ...editLessonForm, sort_order: parseInt(e.target.value) || 0 })}
                                    className="p-2 rounded border text-sm"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="submit"
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditLesson}
                                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="flex justify-between items-center gap-2">
                                <div className="min-w-0">
                                  <div className="font-bold truncate">
                                    Сабақ {l.lesson_number}{l.title ? `: ${l.title}` : ""}
                                  </div>
                                  <div className="text-xs text-gray-600">Қатар: {l.sort_order}</div>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditLesson(l);
                                    }}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Өңдеу"
                                    type="button"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteLesson(l.id);
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                    title="Жою"
                                    type="button"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      {lessons.length === 0 && <div className="text-sm text-gray-500">Сабақтар әлі жоқ.</div>}
                    </div>

                    {selectedLesson && (
                      <div className="glass rounded-xl p-4 border border-white/20 space-y-3">
                        <div className="font-bold text-gray-800">Кіші сабақтар (4)</div>
                        <div className="grid grid-cols-1 gap-2">
                          {miniLessons
                            .slice()
                            .sort((a, b) => a.mini_index - b.mini_index)
                            .map((ml) => (
                              <div
                                key={ml.id}
                                className={`p-3 rounded border ${
                                  selectedMiniLesson === ml.id ? "bg-purple-100 border-purple-500" : "bg-white/60 border-gray-200"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    className="w-8 h-8 rounded-full bg-white border border-gray-200 font-bold"
                                    onClick={() => setSelectedMiniLesson(ml.id)}
                                    type="button"
                                    title="Таңдау"
                                  >
                                    {ml.mini_index}
                                  </button>
                                  <input
                                    defaultValue={ml.title || `Мини-урок ${ml.mini_index}`}
                                    className="flex-1 p-2 rounded border text-sm"
                                    onBlur={(e) => updateMiniLessonTitle(ml.id, e.target.value)}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Тапсырма қосу пішіні - desktop-тағы оң жақ баған */}
              {selectedMiniLesson && (
                <div className="xl:col-span-1 xl:sticky xl:top-6 xl:self-start space-y-4">
                  <div className="glass rounded-xl p-4 border border-white/20">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Кіші сабақ есептері</h2>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-800">Есеп қосу</h3>
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => setUseVisualEditor(false)}
                            className={`px-3 py-1 rounded text-sm font-semibold ${
                              !useVisualEditor
                                ? "bg-white text-gray-900 shadow"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                          >
                            Пішін
                          </button>
                          <button
                            type="button"
                            onClick={() => setUseVisualEditor(true)}
                            className={`px-3 py-1 rounded text-sm font-semibold ${
                              useVisualEditor
                                ? "bg-white text-gray-900 shadow"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                          >
                            Көрнекі редактор
                          </button>
                        </div>
                      </div>

                      {useVisualEditor ? (
                        <VisualTaskEditor
                          tasks={miniTasks.map((task: any) => {
                            let options = undefined;
                            if (task.options) {
                              try {
                                options = typeof task.options === "string" ? JSON.parse(task.options) : task.options;
                              } catch {
                                options = undefined;
                              }
                            }
                            
                            let subquestions = undefined;
                            if (task.subquestions) {
                              try {
                                subquestions = typeof task.subquestions === "string" ? JSON.parse(task.subquestions) : task.subquestions;
                              } catch {
                                subquestions = undefined;
                              }
                            }
                            
                            return {
                              id: task.id,
                              text: task.text || "",
                              question_type: (task.question_type || "input") as any,
                              text_scale: normalizeTaskTextScale(
                                task.text_scale || (task.bank_task?.text_scale as string | null | undefined)
                              ),
                              options: options,
                              subquestions: subquestions,
                              answer: task.answer || "",
                              image_filename: task.image_filename || null,
                              bank_task_id: parseBankTaskId(task.bank_task_id),
                              bank_difficulty: task.bank_difficulty || task.bank_task?.difficulty || "B",
                              bank_topics: Array.isArray(task.bank_topics)
                                ? task.bank_topics
                                : Array.isArray(task.bank_task?.topics)
                                ? task.bank_task.topics
                                : [],
                              sort_order: task.sort_order || 0,
                            };
                          })}
                          onSave={async (taskData) => {
                            if (!session?.user?.email || !selectedMiniLesson) return;
                            const formData = new FormData();
                            formData.append("question_type", taskData.question_type || "input");
                            formData.append("text_scale", normalizeTaskTextScale(taskData.text_scale));
                            formData.append("email", session.user.email);
                            formData.append("sort_order", (taskData.sort_order || 0).toString());

                            const linkedBankTaskId = parseBankTaskId(taskData.bank_task_id as any);
                            if (!taskData.id && linkedBankTaskId) {
                              formData.append("bank_task_id", String(linkedBankTaskId));
                            } else {
                              formData.append("text", taskData.text || "");
                            }

                            if (taskData.bank_difficulty) {
                              formData.append("bank_difficulty", taskData.bank_difficulty);
                            }
                            formData.append(
                              "bank_topics",
                              JSON.stringify(Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [])
                            );
                            
                            let answer = taskData.answer || "";
                            if (taskData.question_type === "mcq" || taskData.question_type === "mcq6") {
                              answer = taskData.answer || "";
                              formData.append("options", JSON.stringify(taskData.options || []));
                            } else if (taskData.question_type === "tf") {
                              answer = taskData.answer || "true";
                              formData.append("options", "");
                            } else if (taskData.question_type === "select") {
                              if (taskData.subquestions) {
                                const correctAnswers = taskData.subquestions.map((sq: any) => sq.correct || "A");
                                answer = JSON.stringify(correctAnswers);
                              }
                              formData.append("options", JSON.stringify(taskData.options || []));
                              if (taskData.subquestions) {
                                formData.append("subquestions", JSON.stringify(taskData.subquestions));
                              }
                            } else {
                              formData.append("options", "");
                            }
                            formData.append("answer", answer);
                            if (taskData.imageFile) {
                              formData.append("image", taskData.imageFile);
                            }
                            
                            if (taskData.id) {
                              // Update existing task
                              const response = await fetch(apiPath(`admin/tasks/${taskData.id}`), {
                                method: "PUT",
                                body: formData,
                              });
                              if (!response.ok) throw new Error("Тапсырманы жаңарту мүмкін болмады");
                            } else {
                              // Create new task
                              const response = await fetch(apiPath(`admin/mini-lessons/${selectedMiniLesson}/tasks`), {
                                method: "POST",
                                body: formData,
                              });
                              if (!response.ok) throw new Error("Тапсырма құру мүмкін болмады");
                            }
                            await fetchMiniTasks(selectedMiniLesson);
                          }}
                          onAdd={async () => {
                            if (selectedMiniLesson) {
                              await fetchMiniTasks(selectedMiniLesson);
                            }
                          }}
                          onDelete={async (taskId) => {
                            await deleteMiniLessonTask(taskId);
                          }}
                          context="mini-lesson"
                          testIdOrMiniLessonId={selectedMiniLesson || undefined}
                          email={session?.user?.email || ""}
                        />
                      ) : (
                      <form onSubmit={createMiniLessonTask} onPaste={handlePasteImageCreate} className="space-y-3">
                        <textarea
                          value={taskForm.text}
                          onChange={(e) => setTaskForm({ ...taskForm, text: e.target.value })}
                          className="w-full p-3 rounded border resize-y min-h-[120px]"
                          placeholder={createUsesBank ? "БАНК тапсырма ID арқылы жасалуда" : "Тапсырма мәтіні"}
                          rows={6}
                          disabled={createUsesBank}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            value={taskForm.bankTaskId}
                            onChange={(e) => setTaskForm({ ...taskForm, bankTaskId: e.target.value })}
                            className="p-2 rounded border"
                            placeholder="БАНК тапсырма ID (міндетті емес)"
                          />
                          <select
                            value={taskForm.bank_difficulty}
                            onChange={(e) => setTaskForm({ ...taskForm, bank_difficulty: e.target.value as any })}
                            className="p-2 rounded border disabled:bg-gray-100 disabled:text-gray-500"
                            disabled={createUsesBank}
                          >
                            <option value="A">A (оңай)</option>
                            <option value="B">B (орташа)</option>
                            <option value="C">C (қиын)</option>
                          </select>
                          <input
                            value={taskForm.bank_topics_raw}
                            onChange={(e) => setTaskForm({ ...taskForm, bank_topics_raw: e.target.value })}
                            className="p-2 rounded border disabled:bg-gray-100 disabled:text-gray-500"
                            placeholder="Тақырыптар (үтір арқылы)"
                            disabled={createUsesBank}
                          />
                        </div>
                        {createUsesBank && (
                          <div className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                            Бұл тек БАНК-тегі бар тапсырмаға сілтеме жасайды. Төмендегі мәтін/нұсқа өрістері еленбейді.
                          </div>
                        )}
                        <div className="rounded-lg border border-gray-200 bg-white/60 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Мәтін өлшемі</div>
                          <div className="mt-2 flex gap-2">
                            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
                              const active = taskForm.text_scale === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setTaskForm({ ...taskForm, text_scale: option.value })}
                                  className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
                                    active
                                      ? "bg-purple-600 text-white shadow-sm"
                                      : "bg-white text-gray-700 border border-gray-200 hover:border-purple-300"
                                  }`}
                                  disabled={createUsesBank}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          {taskForm.text.trim() && !createUsesBank && (
                            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
                              <div
                                className={`text-gray-900 ${getTaskTextScaleClass(taskForm.text_scale)}`}
                              >
                                <MathRender latex={taskForm.text} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <select
                                  value={taskForm.question_type}
                                  onChange={(e) => setTaskForm({ ...taskForm, question_type: e.target.value as any })}
                                  className="p-2 rounded border"
                                >
                                  <option value="input">Пайдаланушы жауап енгізеді</option>
                                  <option value="tf">Дұрыс / Жалған</option>
                                  <option value="mcq">Нұсқалар A/B/C/D</option>
                                  <option value="mcq6">Нұсқалар A/B/C/D/E/F</option>
                                  <option value="select">Тізімнен таңдау</option>
                                </select>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => setTaskForm({ ...taskForm, imageFile: e.target.files?.[0] || null })}
                                  className="p-2 rounded border"
                                  disabled={createUsesBank}
                                />
                                <input
                                  type="number"
                                  value={taskForm.sort_order}
                                  onChange={(e) => setTaskForm({ ...taskForm, sort_order: parseInt(e.target.value) || 0 })}
                                  className="p-2 rounded border"
                                  placeholder="Қатар"
                                />
                                {createUsesBank ? (
                                  <div className="p-2 rounded border bg-gray-50 text-gray-600 text-sm">
                                    Жауап пен нұсқалар байланыстырылған БАНК тапсырмасынан алынады
                                  </div>
                                ) : taskForm.question_type === "tf" ? (
                                  <select
                                    value={taskForm.correctTf}
                                    onChange={(e) => setTaskForm({ ...taskForm, correctTf: e.target.value as any })}
                                    className="p-2 rounded border"
                                  >
                                    <option value="true">Дұрыс</option>
                                    <option value="false">Қате</option>
                                  </select>
                                ) : taskForm.question_type === "mcq" || taskForm.question_type === "mcq6" ? (
                                  <select
                                    value={taskForm.correctOption}
                                    onChange={(e) => setTaskForm({ ...taskForm, correctOption: e.target.value as any })}
                                    className="p-2 rounded border"
                                  >
                                    <option value="A">Дұрыс: A</option>
                                    <option value="B">Дұрыс: B</option>
                                    <option value="C">Дұрыс: C</option>
                                    <option value="D">Дұрыс: D</option>
                                    {taskForm.question_type === "mcq6" && (
                                      <>
                                        <option value="E">Дұрыс: E</option>
                                        <option value="F">Дұрыс: F</option>
                                      </>
                                    )}
                                  </select>
                                ) : (
                                  <input
                                    value={taskForm.answer}
                                    onChange={(e) => setTaskForm({ ...taskForm, answer: e.target.value })}
                                    className="p-2 rounded border"
                                    placeholder="Дұрыс жауап"
                                  />
                                )}
                        </div>

                        {!createUsesBank && (taskForm.question_type === "mcq" || taskForm.question_type === "mcq6" || taskForm.question_type === "select") && (
                          <div className="grid grid-cols-1 gap-2">
                            <input
                              value={taskForm.optionA}
                              onChange={(e) => setTaskForm({ ...taskForm, optionA: e.target.value })}
                              className="p-2 rounded border"
                              placeholder="A"
                              required
                            />
                            <input
                              value={taskForm.optionB}
                              onChange={(e) => setTaskForm({ ...taskForm, optionB: e.target.value })}
                              className="p-2 rounded border"
                              placeholder="B"
                              required
                            />
                            <input
                              value={taskForm.optionC}
                              onChange={(e) => setTaskForm({ ...taskForm, optionC: e.target.value })}
                              className="p-2 rounded border"
                              placeholder="C"
                              required
                            />
                            <input
                              value={taskForm.optionD}
                              onChange={(e) => setTaskForm({ ...taskForm, optionD: e.target.value })}
                              className="p-2 rounded border"
                              placeholder="D"
                              required
                            />
                            {taskForm.question_type === "mcq6" && (
                              <>
                                <input
                                  value={taskForm.optionE}
                                  onChange={(e) => setTaskForm({ ...taskForm, optionE: e.target.value })}
                                  className="p-2 rounded border"
                                  placeholder="E"
                                  required
                                />
                                <input
                                  value={taskForm.optionF}
                                  onChange={(e) => setTaskForm({ ...taskForm, optionF: e.target.value })}
                                  className="p-2 rounded border"
                                  placeholder="F"
                                  required
                                />
                              </>
                            )}
                          </div>
                        )}

                        {!createUsesBank && taskForm.question_type === "select" && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2">
                              <input
                                value={taskForm.subQuestion1}
                                onChange={(e) => setTaskForm({ ...taskForm, subQuestion1: e.target.value })}
                                className="p-2 rounded border"
                                placeholder="1-қосымша сұрақ"
                                required
                              />
                              <select
                                value={taskForm.correctSub1}
                                onChange={(e) => setTaskForm({ ...taskForm, correctSub1: e.target.value as any })}
                                className="p-2 rounded border"
                              >
                                <option value="A">Дұрыс: A</option>
                                <option value="B">Дұрыс: B</option>
                                <option value="C">Дұрыс: C</option>
                                <option value="D">Дұрыс: D</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <input
                                value={taskForm.subQuestion2}
                                onChange={(e) => setTaskForm({ ...taskForm, subQuestion2: e.target.value })}
                                className="p-2 rounded border"
                                placeholder="2-қосымша сұрақ"
                                required
                              />
                              <select
                                value={taskForm.correctSub2}
                                onChange={(e) => setTaskForm({ ...taskForm, correctSub2: e.target.value as any })}
                                className="p-2 rounded border"
                              >
                                <option value="A">Дұрыс: A</option>
                                <option value="B">Дұрыс: B</option>
                                <option value="C">Дұрыс: C</option>
                                <option value="D">Дұрыс: D</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
                        >
                          Есеп қосу
                        </button>
                      </form>
                      )}

                      <div className="border-t border-gray-300 pt-4 mt-4">
                        <h3 className="font-bold text-gray-800 mb-3">Барлық есептер</h3>
                        <div className="space-y-2 xl:max-h-[calc(100vh-400px)] overflow-y-auto">
                          {miniTasks
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                            .map((t) => (
                                  <div key={t.id} className="p-3 rounded border bg-white/60 border-gray-200">
                                    {editingMiniTask === t.id ? (
                                      <form onSubmit={updateMiniLessonTask} onPaste={handlePasteImageEdit} className="space-y-2">
                                        <textarea
                                          value={editTaskForm.text}
                                          onChange={(e) => setEditTaskForm({ ...editTaskForm, text: e.target.value })}
                                          className="w-full p-2 rounded border text-sm"
                                          rows={3}
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                          <input
                                            value={editTaskForm.bank_task_id ?? ""}
                                            className="p-2 rounded border text-sm bg-gray-100 text-gray-600"
                                            placeholder="БАНК тапсырма ID"
                                            readOnly
                                          />
                                          <select
                                            value={editTaskForm.bank_difficulty}
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, bank_difficulty: e.target.value as any })}
                                            className="p-2 rounded border text-sm disabled:bg-gray-100 disabled:text-gray-500"
                                            disabled={!editHasLinkedBankTask}
                                          >
                                            <option value="A">A (оңай)</option>
                                            <option value="B">B (орташа)</option>
                                            <option value="C">C (қиын)</option>
                                          </select>
                                          <input
                                            value={editTaskForm.bank_topics_raw}
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, bank_topics_raw: e.target.value })}
                                            className="p-2 rounded border text-sm disabled:bg-gray-100 disabled:text-gray-500"
                                            placeholder="Тақырыптар (үтір арқылы)"
                                            disabled={!editHasLinkedBankTask}
                                          />
                                        </div>
                                        {!editHasLinkedBankTask && (
                                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                                            ����-��� ��������� ��? ��� ��������: ������������ ����������� ?�����.
                                          </div>
                                        )}
                                        <div className="rounded-lg border border-gray-200 bg-white/60 p-3">
                                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Мәтін өлшемі</div>
                                          <div className="mt-2 flex gap-2">
                                            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
                                              const active = editTaskForm.text_scale === option.value;
                                              return (
                                                <button
                                                  key={option.value}
                                                  type="button"
                                                  onClick={() => setEditTaskForm({ ...editTaskForm, text_scale: option.value })}
                                                  className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
                                                    active
                                                      ? "bg-purple-600 text-white shadow-sm"
                                                      : "bg-white text-gray-700 border border-gray-200 hover:border-purple-300"
                                                  }`}
                                                >
                                                  {option.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {editTaskForm.text.trim() && (
                                            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
                                              <div
                                                className={`text-gray-900 ${getTaskTextScaleClass(editTaskForm.text_scale)}`}
                                              >
                                                <MathRender latex={editTaskForm.text} />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                          <select
                                            value={editTaskForm.question_type}
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, question_type: e.target.value as any })}
                                            className="p-2 rounded border text-sm"
                                          >
                                            <option value="input">Енгізу</option>
                                            <option value="tf">Ш/Ж</option>
                                            <option value="mcq">MCQ (4)</option>
                                            <option value="mcq6">MCQ (6)</option>
                                            <option value="select">Сәйкестендіру</option>
                                          </select>
                                          <input
                                            type="number"
                                            value={editTaskForm.sort_order}
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, sort_order: parseInt(e.target.value) || 0 })}
                                            className="p-2 rounded border text-sm"
                                          />
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, imageFile: e.target.files?.[0] || null })}
                                            className="p-2 rounded border text-sm"
                                          />
                                          {editTaskForm.question_type === "tf" ? (
                                            <select
                                              value={editTaskForm.correctTf}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, correctTf: e.target.value as any })}
                                              className="p-2 rounded border text-sm"
                                            >
                                              <option value="true">Дұрыс</option>
                                              <option value="false">Жалған</option>
                                            </select>
                                          ) : editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6" ? (
                                            <select
                                              value={editTaskForm.correctOption}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, correctOption: e.target.value as any })}
                                              className="p-2 rounded border text-sm"
                                            >
                                              <option value="A">A</option>
                                              <option value="B">B</option>
                                              <option value="C">C</option>
                                              <option value="D">D</option>
                                              {editTaskForm.question_type === "mcq6" && (
                                                <>
                                                  <option value="E">E</option>
                                                  <option value="F">F</option>
                                                </>
                                              )}
                                            </select>
                                          ) : (
                                            <input
                                              value={editTaskForm.answer}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, answer: e.target.value })}
                                              className="p-2 rounded border text-sm"
                                              placeholder="Жауап"
                                            />
                                          )}
                                        </div>

                                        {(editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6" || editTaskForm.question_type === "select") && (
                                          <div className="grid grid-cols-1 gap-2">
                                            <input
                                              value={editTaskForm.optionA}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionA: e.target.value })}
                                              className="p-2 rounded border text-sm"
                                              placeholder="A"
                                              required
                                            />
                                            <input
                                              value={editTaskForm.optionB}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionB: e.target.value })}
                                              className="p-2 rounded border text-sm"
                                              placeholder="B"
                                              required
                                            />
                                            <input
                                              value={editTaskForm.optionC}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionC: e.target.value })}
                                              className="p-2 rounded border text-sm"
                                              placeholder="C"
                                              required
                                            />
                                            <input
                                              value={editTaskForm.optionD}
                                              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionD: e.target.value })}
                                              className="p-2 rounded border text-sm"
                                              placeholder="D"
                                              required
                                            />
                                            {editTaskForm.question_type === "mcq6" && (
                                              <>
                                                <input
                                                  value={editTaskForm.optionE}
                                                  onChange={(e) => setEditTaskForm({ ...editTaskForm, optionE: e.target.value })}
                                                  className="p-2 rounded border text-sm"
                                                  placeholder="E"
                                                  required
                                                />
                                                <input
                                                  value={editTaskForm.optionF}
                                                  onChange={(e) => setEditTaskForm({ ...editTaskForm, optionF: e.target.value })}
                                                  className="p-2 rounded border text-sm"
                                                  placeholder="F"
                                                  required
                                                />
                                              </>
                                            )}
                                          </div>
                                        )}

                                        {editTaskForm.question_type === "select" && (
                                          <div className="space-y-2">
                                            <div className="grid grid-cols-1 gap-2">
                                              <input
                                                value={editTaskForm.subQuestion1}
                                                onChange={(e) => setEditTaskForm({ ...editTaskForm, subQuestion1: e.target.value })}
                                                className="p-2 rounded border text-sm"
                                                placeholder="1-қосымша сұрақ"
                                                required
                                              />
                                              <select
                                                value={editTaskForm.correctSub1}
                                                onChange={(e) => setEditTaskForm({ ...editTaskForm, correctSub1: e.target.value as any })}
                                                className="p-2 rounded border text-sm"
                                              >
                                                <option value="A">A</option>
                                                <option value="B">B</option>
                                                <option value="C">C</option>
                                                <option value="D">D</option>
                                              </select>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2">
                                              <input
                                                value={editTaskForm.subQuestion2}
                                                onChange={(e) => setEditTaskForm({ ...editTaskForm, subQuestion2: e.target.value })}
                                                className="p-2 rounded border text-sm"
                                                placeholder="2-қосымша сұрақ"
                                                required
                                              />
                                              <select
                                                value={editTaskForm.correctSub2}
                                                onChange={(e) => setEditTaskForm({ ...editTaskForm, correctSub2: e.target.value as any })}
                                                className="p-2 rounded border text-sm"
                                              >
                                                <option value="A">A</option>
                                                <option value="B">B</option>
                                                <option value="C">C</option>
                                                <option value="D">D</option>
                                              </select>
                                            </div>
                                          </div>
                                        )}

                                        <div className="flex gap-2">
                                          <button
                                            type="submit"
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                                          >
                                            ✓
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEditMiniLessonTask}
                                            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </form>
                                    ) : (
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                          <div className="font-bold text-gray-900 truncate">#{t.id} - {formatQuestionTypeLabel(t.question_type)}</div>
                                          <div className="text-sm text-gray-700 line-clamp-2">{t.text}</div>
                                          <div className="text-xs text-gray-500">Қатар: {t.sort_order}</div>
                                        </div>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => startEditMiniLessonTask(t)}
                                            className="text-blue-600 hover:text-blue-800"
                                            title="Өңдеу"
                                            type="button"
                                          >
                                            ✏️
                                          </button>
                                          <button
                                            onClick={() => deleteMiniLessonTask(t.id)}
                                            className="text-red-600 hover:text-red-800"
                                            title="Жою"
                                            type="button"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                          {miniTasks.length === 0 && <div className="text-sm text-gray-500">Есептер әлі жоқ.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}


