"use client";
import Icon from "@/components/ui/Icon";

import CreateTaskForm from "./CreateTaskForm";
import EditTaskForm from "./EditTaskForm";
import LessonsPanel from "./LessonsPanel";
import ModulesPanel from "./ModulesPanel";
import SectionsPanel from "./SectionsPanel";
import TrashPanel from "./TrashPanel";
import CmsDialog from "./CmsDialog";
import MiniLessonTabs from "./MiniLessonTabs";
import { useCmsCache } from "./CmsCache";
import CmsSkeleton from "./CmsSkeleton";
import styles from "../CmsWorkspace.module.css";
import { createLessonActions } from "./createLessonActions";
import { createModuleActions } from "./createModuleActions";
import { createSectionActions } from "./createSectionActions";
import { createTaskActions } from "./createTaskActions";
import { createTrashActions } from "./createTrashActions";
import { formatMiniLessonTitle, formatQuestionTypeLabel, Lesson, MiniLesson, MiniLessonTask, Module, parseBankTaskId, Section, TrashTask } from "./model";

import Link from "next/link";
import VisualTaskEditor from "@/components/admin/VisualTaskEditor";
import MathRender from "@/components/ui/MathRender";
import { apiPath } from "@/lib/api";
import {
  McqOptionLabel
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import { AnswerMode, TaskTextScale } from "@/types";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = { moduleId?: number; sectionId?: number; lessonId?: number; miniLessonId?: number };

export default function CmsWorkspace({ moduleId, sectionId, lessonId, miniLessonId }: Props) {
  const pageKind = lessonId ? "tasks" : sectionId ? "lessons" : moduleId ? "sections" : "modules";
  const modulePath = `/admin/cms/modules/${moduleId}`;
  const sectionPath = `${modulePath}/sections/${sectionId}`;
  const lessonPath = `${sectionPath}/lessons/${lessonId}`;

  const { data: session } = useSession();
  const sessionEmail = session?.user?.email || null;
  const cache = useCmsCache(sessionEmail);
  const modulesKey = "admin/modules";
  const sectionsKey = `admin/modules/${moduleId}/sections`;
  const lessonsKey = `admin/sections/${sectionId}/lessons`;
  const minisKey = `admin/lessons/${lessonId}/mini-lessons`;
  const cachedMinis = cache.read<MiniLesson>(minisKey);
  const initialMiniId = miniLessonId ?? (cachedMinis && [...cachedMinis].sort((a, b) => a.mini_index - b.mini_index || a.id - b.id)[0]?.id) ?? null;
  const [modules, setModules] = useState<Module[]>(() => cache.read<Module>(modulesKey) ?? []);
  const [selectedModule, setSelectedModule] = useState<number | null>(moduleId ?? null);
  const [sections, setSections] = useState<Section[]>(() => cache.read<Section>(sectionsKey) ?? []);
  const [selectedSection, setSelectedSection] = useState<number | null>(sectionId ?? null);

  const [lessons, setLessons] = useState<Lesson[]>(() => cache.read<Lesson>(lessonsKey) ?? []);
  const [selectedLesson, setSelectedLesson] = useState<number | null>(lessonId ?? null);
  const [miniLessons, setMiniLessons] = useState<MiniLesson[]>(() => cachedMinis ?? []);
  const [selectedMiniLesson, setSelectedMiniLesson] = useState<number | null>(initialMiniId);
  const [miniTasks, setMiniTasks] = useState<MiniLessonTask[]>(() => cache.read<MiniLessonTask>(`admin/mini-lessons/${initialMiniId}/tasks`) ?? []);

  // Trash for deleted tasks
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashTasks, setTrashTasks] = useState<TrashTask[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [useVisualEditor, setUseVisualEditor] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(pageKind === "tasks" && !cache.read(`admin/mini-lessons/${initialMiniId}/tasks`));
  const [navigationLoading, setNavigationLoading] = useState(() => !cache.read(
    pageKind === "modules" ? modulesKey : pageKind === "sections" ? sectionsKey : pageKind === "lessons" ? lessonsKey : minisKey
  ));
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
  const selectionRef = useRef({ module: selectedModule, section: selectedSection, lesson: selectedLesson, mini: selectedMiniLesson });
  selectionRef.current = { module: selectedModule, section: selectedSection, lesson: selectedLesson, mini: selectedMiniLesson };
  const requestVersions = useRef({ modules: 0, sections: 0, lessons: 0, minis: 0, tasks: 0 });

  useEffect(() => () => {
    const versions = requestVersions.current;
    for (const key of Object.keys(versions) as Array<keyof typeof versions>) versions[key] += 1;
  }, []);

  useEffect(() => {
    if (!sessionEmail) return;
    if (selectedSection) {
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
    if (!sessionEmail) return;
    if (selectedLesson) {
      fetchMiniLessons(selectedLesson);
    } else {
      setMiniLessons([]);
      setSelectedMiniLesson(null);
      setMiniTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLesson, session?.user?.email]);

  useEffect(() => {
    if (!sessionEmail) return;
    if (selectedMiniLesson) {
      fetchMiniTasks(selectedMiniLesson);
    } else {
      setMiniTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMiniLesson, session?.user?.email]);

  const fetchModules = useCallback(async () => {
    if (!sessionEmail) return;
    const version = ++requestVersions.current.modules;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiPath('admin/modules')}?email=${encodeURIComponent(sessionEmail)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Белгісіз қате" }));
        throw new Error(errorData.detail || `HTTP ${response.status}: Модульдерді жүктеу мүмкін болмады`);
      }
      const data = await response.json();
      if (version !== requestVersions.current.modules) return;
      cache.write("admin/modules", data);
      setModules(data);
    } catch (err: any) {
      if (version !== requestVersions.current.modules) return;
      console.error("Error fetching modules:", err);
      setError(err.message || "Модульдерді жүктеу мүмкін болмады. Толығырақ консольде.");
    } finally {
      if (version === requestVersions.current.modules) {
        setLoading(false);
        if (pageKind === "modules") setNavigationLoading(false);
      }
    }
  }, [cache, pageKind, sessionEmail]);

  const fetchSections = useCallback(async (moduleId: number) => {
    if (!sessionEmail) return;
    const version = ++requestVersions.current.sections;
    try {
      const response = await fetch(`${apiPath(`admin/modules/${moduleId}/sections`)}?email=${encodeURIComponent(sessionEmail)}`);
      if (!response.ok) throw new Error("Бөлімдерді жүктеу мүмкін болмады");
      const data = await response.json();
      if (version !== requestVersions.current.sections || selectionRef.current.module !== moduleId) return;
      cache.write(`admin/modules/${moduleId}/sections`, data);
      setSections(data);
    } catch (err: any) {
      if (version === requestVersions.current.sections && selectionRef.current.module === moduleId) setError(err.message);
    } finally {
      if (pageKind === "sections" && version === requestVersions.current.sections && selectionRef.current.module === moduleId) setNavigationLoading(false);
    }
  }, [cache, pageKind, sessionEmail]);

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
    const version = ++requestVersions.current.lessons;
    try {
      const response = await fetch(`${apiPath(`admin/sections/${sectionId}/lessons`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Сабақтарды жүктеу мүмкін болмады");
      const data = await response.json();
      if (version !== requestVersions.current.lessons || selectionRef.current.section !== sectionId) return;
      cache.write(`admin/sections/${sectionId}/lessons`, data);
      setLessons(data);
    } catch (err: any) {
      if (version === requestVersions.current.lessons && selectionRef.current.section === sectionId) setError(err.message);
    } finally {
      if (pageKind === "lessons" && version === requestVersions.current.lessons && selectionRef.current.section === sectionId) setNavigationLoading(false);
    }
  };

  const fetchMiniLessons = async (lessonId: number) => {
    if (!session?.user?.email) return;
    const version = ++requestVersions.current.minis;
    try {
      const response = await fetch(`${apiPath(`admin/lessons/${lessonId}/mini-lessons`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Кіші сабақтарды жүктеу мүмкін болмады");
      const data = await response.json();
      if (version !== requestVersions.current.minis || selectionRef.current.lesson !== lessonId) return;
      cache.write(`admin/lessons/${lessonId}/mini-lessons`, data);
      setMiniLessons(data);
      if (!miniLessonId) {
        setSelectedMiniLesson((current) => data.some((mini: MiniLesson) => mini.id === current)
          ? current
          : [...data].sort((left: MiniLesson, right: MiniLesson) => left.mini_index - right.mini_index || left.id - right.id)[0]?.id ?? null);
      }
    } catch (err: any) {
      if (version === requestVersions.current.minis && selectionRef.current.lesson === lessonId) setError(err.message);
    } finally {
      if (pageKind === "tasks" && version === requestVersions.current.minis && selectionRef.current.lesson === lessonId) setNavigationLoading(false);
    }
  };

  const fetchMiniTasks = async (miniLessonId: number) => {
    if (!session?.user?.email) return;
    const version = ++requestVersions.current.tasks;
    if (!cache.read(`admin/mini-lessons/${miniLessonId}/tasks`)) setTasksLoading(true);
    try {
      const response = await fetch(`${apiPath(`admin/mini-lessons/${miniLessonId}/tasks`)}?email=${encodeURIComponent(session.user.email)}`);
      if (!response.ok) throw new Error("Кіші сабақ тапсырмаларын жүктеу мүмкін болмады");
      const data = await response.json();
      if (version !== requestVersions.current.tasks || selectionRef.current.mini !== miniLessonId) return;
      cache.write(`admin/mini-lessons/${miniLessonId}/tasks`, data);
      setMiniTasks(data);
    } catch (err: any) {
      if (version === requestVersions.current.tasks && selectionRef.current.mini === miniLessonId) setError(err.message);
    } finally {
      if (version === requestVersions.current.tasks && selectionRef.current.mini === miniLessonId) setTasksLoading(false);
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

  const currentModule = modules.find((item) => item.id === selectedModule);
  const currentSection = sections.find((item) => item.id === selectedSection);
  const currentLesson = lessons.find((item) => item.id === selectedLesson);
  const currentMini = miniLessons.find((item) => item.id === selectedMiniLesson);
  const lessonLabel = currentLesson ? (currentLesson.title || `${currentLesson.lesson_number}-сабақ`) : "Сабақ";
  const pageTitle = pageKind === "modules" ? "Оқу материалдары" : pageKind === "sections" ? currentModule?.name
    : pageKind === "lessons" ? currentSection?.name : (currentMini ? formatMiniLessonTitle(currentMini) : currentLesson ? lessonLabel : undefined);
  const parentPath = pageKind === "modules" ? null : pageKind === "sections" ? "/admin/cms" : pageKind === "lessons" ? modulePath : sectionPath;
  const parentLabel = pageKind === "sections" ? "Модульдер" : pageKind === "lessons" ? "Бөлімдер" : "Сабақтар";
  const breadcrumbs = [
    { label: "Модульдер", href: "/admin/cms" },
    ...(moduleId ? [{ label: currentModule?.name, href: modulePath }] : []),
    ...(sectionId ? [{ label: currentSection?.name, href: sectionPath }] : []),
    ...(lessonId ? [{ label: currentLesson ? lessonLabel : undefined, href: lessonPath }] : []),
    ...(selectedMiniLesson ? [{ label: currentMini ? formatMiniLessonTitle(currentMini) : undefined, href: `${lessonPath}/mini-lessons/${selectedMiniLesson}` }] : []),
  ];



  return (
    <>
          <nav aria-label="Мазмұн жолы" className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => <span key={crumb.href}>
              {index > 0 && <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>}
              {!crumb.label ? <span aria-hidden="true" className={`${styles.skeletonBar} ${styles.skeletonCrumb}`} />
                : index === breadcrumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link href={crumb.href}>{crumb.label}</Link>}
            </span>)}
          </nav>
          <header className={styles.header}>
            <h1 className={styles.title}>{pageTitle || <><span className="sr-only">Оқу материалдары</span><span aria-hidden="true" className={`${styles.skeletonBar} ${styles.skeletonTitle}`} /></>}</h1>
            <div className={styles.actions}>
              {parentPath && <Link href={parentPath} className={styles.textButton}><Icon name="arrowLeft" /> {parentLabel}</Link>}
              <button type="button" onClick={toggleTrash} className={styles.textButton}>Себет</button>
            </div>
          </header>
          {error && <div role="alert" className={styles.error}>{error}</div>}
          <CmsDialog open={trashOpen} title="Жойылған тапсырмалар" onClose={() => setTrashOpen(false)} error={error}>
            <TrashPanel trashOpen={trashOpen} emptyTrash={emptyTrash} trashLoading={trashLoading}
              trashTasks={trashTasks} restoreTaskFromTrash={restoreTaskFromTrash} />
          </CmsDialog>
          {navigationLoading && <CmsSkeleton />}
          {pageKind === "modules" && !navigationLoading && (
              <ModulesPanel
                createModule={createModule}
                moduleForm={moduleForm}
                setModuleForm={setModuleForm}
                modules={modules}
                editingModule={editingModule}
                updateModule={updateModule}
                editModuleForm={editModuleForm}
                setEditModuleForm={setEditModuleForm}
                cancelEditModule={cancelEditModule}
                startEditModule={startEditModule}
                deleteModule={deleteModule}
              />
          )}
          {pageKind === "sections" && !navigationLoading && (
              <SectionsPanel
                selectedModule={selectedModule}
                createSection={createSection}
                sectionForm={sectionForm}
                setSectionForm={setSectionForm}
                sections={sections}
                editingSection={editingSection}
                updateSection={updateSection}
                editSectionForm={editSectionForm}
                setEditSectionForm={setEditSectionForm}
                cancelEditSection={cancelEditSection}
                startEditSection={startEditSection}
                deleteSection={deleteSection}
              />
          )}
          {pageKind === "lessons" && !navigationLoading && (
              <LessonsPanel basePath={sectionPath}
                selectedSection={selectedSection}
                createLesson={createLesson}
                lessonForm={lessonForm}
                setLessonForm={setLessonForm}
                lessons={lessons}
                editingLesson={editingLesson}
                updateLesson={updateLesson}
                editLessonForm={editLessonForm}
                setEditLessonForm={setEditLessonForm}
                cancelEditLesson={cancelEditLesson}
                startEditLesson={startEditLesson}
                deleteLesson={deleteLesson}
              />
          )}
          {pageKind === "tasks" && !navigationLoading && <div className={styles.content}>

              <MiniLessonTabs miniLessons={miniLessons} selectedMiniLesson={selectedMiniLesson}
                basePath={lessonPath} onRename={updateMiniLessonTitle} />
              {miniLessons.length === 0 && !error && <p className={styles.hint}>Бұл сабақта кіші сабақтар жоқ.</p>}

              {selectedMiniLesson && (
                <div className={styles.taskPanel}>
                  <div>
                    <div className={styles.taskToolbar}>
                      <div>
                        <h2 className={styles.taskTitle}>Тапсырмалар <span className={styles.count}>{miniTasks.length}</span></h2>
                      </div>
                      <div className={styles.actions}>
                        <div className={styles.viewSwitch} aria-label="Көрсету тәсілі">
                          <button type="button" aria-pressed={!useVisualEditor} onClick={() => setUseVisualEditor(false)}
                            className={`${styles.viewButton} ${!useVisualEditor ? styles.viewButtonActive : ""}`}>Тізім</button>
                          <button type="button" aria-pressed={useVisualEditor} onClick={() => setUseVisualEditor(true)}
                            className={`${styles.viewButton} ${useVisualEditor ? styles.viewButtonActive : ""}`}>Көрнекі редактор</button>
                        </div>
                        {!useVisualEditor && <button type="button" className={styles.primaryButton}
                          onClick={() => { setError(null); setTaskDialogOpen(true); }}>Тапсырма қосу</button>}
                      </div>
                    </div>
                    <div>
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
                        <CmsDialog open={taskDialogOpen} title="Жаңа тапсырма" error={error}
                          description={`${lessonLabel} · ${currentMini ? formatMiniLessonTitle(currentMini) : "Кіші сабақ"}`}
                          onClose={() => setTaskDialogOpen(false)}>
                        <CreateTaskForm
                          createMiniLessonTask={async (event) => { if (await createMiniLessonTask(event)) setTaskDialogOpen(false); }}
                          handlePasteImageCreate={handlePasteImageCreate}
                          taskForm={taskForm}
                          setTaskForm={setTaskForm}
                          createUsesBank={createUsesBank}
                          setTaskAnswerMode={setTaskAnswerMode}
                          taskAnswerMode={taskAnswerMode}
                        />
                        </CmsDialog>
                      )}

                      {!useVisualEditor && <div className={styles.taskList}>
                        {tasksLoading ? <CmsSkeleton kind="tasks" label="Тапсырмалар жүктелуде..." /> :
                          [...miniTasks].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((task, index) => (
                            <article key={task.id} className={styles.taskRow}>
                              <div className="min-w-0 flex-1">
                                <div className={styles.taskMeta}><span>{index + 1}-тапсырма</span><span className={styles.count}>{formatQuestionTypeLabel(task.question_type)}</span><span>#{task.id}</span></div>
                                <div className={styles.taskPreview}><MathRender latex={task.text} inline /></div>
                              </div>
                              <div className={styles.actions}>
                                <button type="button" className={styles.secondaryButton} aria-label={`Тапсырма #${task.id} өңдеу`}
                                  onClick={() => { setError(null); startEditMiniLessonTask(task); }}>Өңдеу</button>
                                <button type="button" className={styles.dangerButton} aria-label={`Тапсырма #${task.id} жою`}
                                  onClick={() => deleteMiniLessonTask(task.id)}>Жою</button>
                              </div>
                            </article>
                          ))}
                        {!tasksLoading && miniTasks.length === 0 && <div className={styles.empty}>
                          <h3>Тапсырмалар әлі жоқ</h3>
                          <p>Тапсырма қосылған соң осы тізімде көрсетіледі.</p>
                        </div>}
                      </div>}
                      <CmsDialog open={editingMiniTask !== null} title={`Тапсырманы өңдеу #${editingMiniTask || ""}`}
                        error={error} onClose={cancelEditMiniLessonTask}>
                        <EditTaskForm updateMiniLessonTask={updateMiniLessonTask} handlePasteImageEdit={handlePasteImageEdit}
                          editTaskForm={editTaskForm} setEditTaskForm={setEditTaskForm} editHasLinkedBankTask={editHasLinkedBankTask}
                          setEditTaskAnswerMode={setEditTaskAnswerMode} editTaskAnswerMode={editTaskAnswerMode}
                          cancelEditMiniLessonTask={cancelEditMiniLessonTask} />
                      </CmsDialog>
                    </div>
                  </div>
                </div>
              )}
          </div>}
    </>
  );
}
