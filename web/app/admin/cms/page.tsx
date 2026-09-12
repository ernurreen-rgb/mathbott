"use client";
import CreateTaskForm from "./_components/CreateTaskForm";
import EditTaskForm from "./_components/EditTaskForm";
import LessonsPanel from "./_components/LessonsPanel";
import ModulesPanel from "./_components/ModulesPanel";
import SectionsPanel from "./_components/SectionsPanel";
import TrashPanel from "./_components/TrashPanel";
import { createLessonActions } from "./_components/createLessonActions";
import { createModuleActions } from "./_components/createModuleActions";
import { createSectionActions } from "./_components/createSectionActions";
import { createTaskActions } from "./_components/createTaskActions";
import { createTrashActions } from "./_components/createTrashActions";
import { formatQuestionTypeLabel, Lesson, MiniLesson, MiniLessonTask, Module, parseBankTaskId, Section, TrashTask } from "./_components/model";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import VisualTaskEditor from "@/components/admin/VisualTaskEditor";
import { apiPath } from "@/lib/api";
import {
  McqOptionLabel
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { AnswerMode, TaskTextScale } from "@/types";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

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
  const [taskAnswerMode, setTaskAnswerMode] = useState<AnswerMode>("choices");
  const [editTaskAnswerMode, setEditTaskAnswerMode] = useState<AnswerMode>("choices");

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
    accepted_answers: [] as string[],
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
    correctOptions: ["A"] as McqOptionLabel[],
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
    accepted_answers: [] as string[],
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
    correctOptions: ["A"] as McqOptionLabel[],
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

  const { createModule, deleteModule, startEditModule, cancelEditModule, updateModule } = createModuleActions({
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
  });

  const { createSection, deleteSection, startEditSection, cancelEditSection, updateSection } = createSectionActions({
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
  });

  const { createLesson, deleteLesson, startEditLesson, cancelEditLesson, updateLesson, updateMiniLessonTitle } = createLessonActions({
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
  });

  const { createMiniLessonTask, deleteMiniLessonTask, startEditMiniLessonTask, cancelEditMiniLessonTask, updateMiniLessonTask } = createTaskActions({
    session,
    selectedMiniLesson,
    taskForm,
    setError,
    taskAnswerMode,
    fetchMiniTasks,
    setTaskForm,
    setTaskAnswerMode,
    setEditingMiniTask,
    setEditTaskForm,
    setEditTaskAnswerMode,
    editingMiniTask,
    editTaskForm,
    editTaskAnswerMode,
  });

  const { fetchTrashTasks, toggleTrash, restoreTaskFromTrash, emptyTrash } = createTrashActions({
    session,
    setTrashLoading,
    setTrashTasks,
    setError,
    trashOpen,
    setTrashOpen,
    trashTasks,
    selectedMiniLesson,
    fetchMiniTasks,
  });

  // Edit functions

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

            <TrashPanel
              trashOpen={trashOpen}
              emptyTrash={emptyTrash}
              trashLoading={trashLoading}
              trashTasks={trashTasks}
              restoreTaskFromTrash={restoreTaskFromTrash}
            />

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Модули */}
              <ModulesPanel
                createModule={createModule}
                moduleForm={moduleForm}
                setModuleForm={setModuleForm}
                modules={modules}
                selectedModule={selectedModule}
                editingModule={editingModule}
                setSelectedModule={setSelectedModule}
                updateModule={updateModule}
                editModuleForm={editModuleForm}
                setEditModuleForm={setEditModuleForm}
                cancelEditModule={cancelEditModule}
                startEditModule={startEditModule}
                deleteModule={deleteModule}
              />

              {/* Бөлімдер */}
              <SectionsPanel
                selectedModule={selectedModule}
                createSection={createSection}
                sectionForm={sectionForm}
                setSectionForm={setSectionForm}
                sections={sections}
                selectedSection={selectedSection}
                editingSection={editingSection}
                setSelectedSection={setSelectedSection}
                setSelectedLesson={setSelectedLesson}
                setMiniLessons={setMiniLessons}
                setSelectedMiniLesson={setSelectedMiniLesson}
                setMiniTasks={setMiniTasks}
                updateSection={updateSection}
                editSectionForm={editSectionForm}
                setEditSectionForm={setEditSectionForm}
                cancelEditSection={cancelEditSection}
                startEditSection={startEditSection}
                deleteSection={deleteSection}
              />

              {/* Сабақтар / кіші сабақтар / тапсырмалар + бөлім анықтамалығы */}
              <LessonsPanel
                selectedSection={selectedSection}
                createLesson={createLesson}
                lessonForm={lessonForm}
                setLessonForm={setLessonForm}
                lessons={lessons}
                selectedLesson={selectedLesson}
                setSelectedLesson={setSelectedLesson}
                editingLesson={editingLesson}
                updateLesson={updateLesson}
                editLessonForm={editLessonForm}
                setEditLessonForm={setEditLessonForm}
                cancelEditLesson={cancelEditLesson}
                startEditLesson={startEditLesson}
                deleteLesson={deleteLesson}
                miniLessons={miniLessons}
                selectedMiniLesson={selectedMiniLesson}
                setSelectedMiniLesson={setSelectedMiniLesson}
                updateMiniLessonTitle={updateMiniLessonTitle}
              />

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
                            className={`px-3 py-1 rounded text-sm font-semibold ${!useVisualEditor
                              ? "bg-white text-gray-900 shadow"
                              : "text-gray-600 hover:text-gray-900"
                              }`}
                          >
                            Пішін
                          </button>
                          <button
                            type="button"
                            onClick={() => setUseVisualEditor(true)}
                            className={`px-3 py-1 rounded text-sm font-semibold ${useVisualEditor
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
                              answer_mode: task.answer_mode || task.bank_task?.answer_mode || undefined,
                              text_scale: normalizeTaskTextScale(
                                task.text_scale || (task.bank_task?.text_scale as string | null | undefined)
                              ),
                              options: options,
                              subquestions: subquestions,
                              answer: task.answer || "",
                              accepted_answers: Array.isArray(task.accepted_answers)
                                ? task.accepted_answers
                                : Array.isArray(task.bank_task?.accepted_answers)
                                  ? task.bank_task.accepted_answers
                                  : [],
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
                            formData.append("answer_mode", taskData.answer_mode || "choices");
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
                            formData.append(
                              "accepted_answers",
                              JSON.stringify(Array.isArray(taskData.accepted_answers) ? taskData.accepted_answers : [])
                            );
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
                        <CreateTaskForm
                          createMiniLessonTask={createMiniLessonTask}
                          handlePasteImageCreate={handlePasteImageCreate}
                          taskForm={taskForm}
                          setTaskForm={setTaskForm}
                          createUsesBank={createUsesBank}
                          setTaskAnswerMode={setTaskAnswerMode}
                          taskAnswerMode={taskAnswerMode}
                        />
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
                                  <EditTaskForm
                                    updateMiniLessonTask={updateMiniLessonTask}
                                    handlePasteImageEdit={handlePasteImageEdit}
                                    editTaskForm={editTaskForm}
                                    setEditTaskForm={setEditTaskForm}
                                    editHasLinkedBankTask={editHasLinkedBankTask}
                                    setEditTaskAnswerMode={setEditTaskAnswerMode}
                                    editTaskAnswerMode={editTaskAnswerMode}
                                    cancelEditMiniLessonTask={cancelEditMiniLessonTask}
                                  />
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


