"use client";
import Icon from "@/components/ui/Icon";
import styles from "./VisualTaskEditor.module.css";

import BankMetadataFields from "./visual-task-editor/BankMetadataFields";
import MatchingAnswerFields from "./visual-task-editor/MatchingAnswerFields";
import McqAnswerFields from "./visual-task-editor/McqAnswerFields";
import { CropPercent, HANDLES, MIN_CROP_PCT, VisualTaskEditorProps } from "./visual-task-editor/model";
import TaskImageCrop from "./visual-task-editor/TaskImageCrop";
import TaskImageUpload from "./visual-task-editor/TaskImageUpload";

import AcceptedAnswersEditor, { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import StudentTaskPreview from "@/components/admin/StudentTaskPreview";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import { getMcqEditorLabels, getMcqEditorQuestionType, isMcqQuestionType, parseMcqAnswerLabels, serializeMcqAnswerLabels } from "@/lib/question-options";
import { createCroppedImageFile } from "@/lib/imageCrop";
import { getTaskTextScaleClass, getTaskTextScaleStyle, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { LessonTask, QuestionType } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";

export default function VisualTaskEditor({
  tasks,
  onSave,
  onAdd,
  onDelete,
  context,
  showBankMetadata = false,
  testIdOrMiniLessonId,
  email,
  appearance = "default",
  showAddButton = true,
}: VisualTaskEditorProps) {
  const plain = appearance === "plain";
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [tempTaskData, setTempTaskData] = useState<Partial<LessonTask>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempImageFile, setTempImageFile] = useState<File | null>(null);
  const [tempImagePreview, setTempImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [inlineCropActive, setInlineCropActive] = useState(false);
  const [inlineCropSrc, setInlineCropSrc] = useState<string | null>(null);
  const [cropPercent, setCropPercent] = useState<CropPercent>({ left: 0, top: 0, width: 100, height: 100 });
  const [draggingHandle, setDraggingHandle] = useState<typeof HANDLES[number] | null>(null);
  const [inlineCropApplying, setInlineCropApplying] = useState(false);
  const [bankTopicInput, setBankTopicInput] = useState("");
  const [legacyOptionCount, setLegacyOptionCount] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

  const currentTask = tasks[currentTaskIndex] || null;
  const currentTaskId = currentTask?.id ?? null;
  const isNewTask = editingTaskId === null && Object.keys(tempTaskData).length > 0;
  const editingTask = isNewTask ? tempTaskData : (editingTaskId ? tasks.find(t => t.id === editingTaskId) : null);

  useEffect(() => {
    if (currentTaskId !== null) {
      setEditingTaskId(null);
      setTempTaskData({});
      setIsDirty(false);
      setEditingField(null);
      setTempImageFile(null);
      setRemoveImage(false);
      setInlineCropActive(false);
      setInlineCropSrc(null);
      setBankTopicInput("");
    }
  }, [currentTaskIndex, currentTaskId]);

  useEffect(() => {
    if (tasks.length === 0) {
      if (currentTaskIndex !== 0) {
        setCurrentTaskIndex(0);
      }
      return;
    }
    if (currentTaskIndex > tasks.length - 1) {
      setCurrentTaskIndex(tasks.length - 1);
    }
  }, [tasks.length, currentTaskIndex]);

  // Inline crop: handle drag
  const applyCropFromHandle = useCallback((handle: typeof HANDLES[number], xPct: number, yPct: number) => {
    setCropPercent((prev) => {
      const { left, top, width, height } = prev;
      const right = left + width;
      const bottom = top + height;
      let nLeft = left, nTop = top, nWidth = width, nHeight = height;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      switch (handle) {
        case "tl":
          nLeft = clamp(xPct, 0, right - MIN_CROP_PCT);
          nTop = clamp(yPct, 0, bottom - MIN_CROP_PCT);
          nWidth = right - nLeft;
          nHeight = bottom - nTop;
          break;
        case "t":
          nTop = clamp(yPct, 0, bottom - MIN_CROP_PCT);
          nHeight = bottom - nTop;
          break;
        case "tr":
          nTop = clamp(yPct, 0, bottom - MIN_CROP_PCT);
          nWidth = clamp(xPct - left, MIN_CROP_PCT, 100 - left);
          nHeight = bottom - nTop;
          break;
        case "r":
          nWidth = clamp(xPct - left, MIN_CROP_PCT, 100 - left);
          break;
        case "br":
          nWidth = clamp(xPct - left, MIN_CROP_PCT, 100 - left);
          nHeight = clamp(yPct - top, MIN_CROP_PCT, 100 - top);
          break;
        case "b":
          nHeight = clamp(yPct - top, MIN_CROP_PCT, 100 - top);
          break;
        case "bl":
          nLeft = clamp(xPct, 0, right - MIN_CROP_PCT);
          nWidth = right - nLeft;
          nHeight = clamp(yPct - top, MIN_CROP_PCT, 100 - top);
          break;
        case "l":
          nLeft = clamp(xPct, 0, right - MIN_CROP_PCT);
          nWidth = right - nLeft;
          break;
      }
      return { left: nLeft, top: nTop, width: nWidth, height: nHeight };
    });
  }, []);

  useEffect(() => {
    if (!draggingHandle) return;
    const onMove = (e: MouseEvent) => {
      const el = imageWrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const xPct = ((e.clientX - r.left) / r.width) * 100;
      const yPct = ((e.clientY - r.top) / r.height) * 100;
      applyCropFromHandle(draggingHandle, xPct, yPct);
    };
    const onUp = () => setDraggingHandle(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingHandle, applyCropFromHandle]);

  useEffect(() => {
    if (!tempImageFile) {
      setTempImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(tempImageFile);
    setTempImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [tempImageFile]);

  const handleStartEdit = (task: LessonTask) => {
    setValidationError(null);
    setLegacyOptionCount(isMcqQuestionType(task.question_type) && ![4, 6].includes(task.options?.length || 0) ? task.options?.length || 0 : null);
    setEditingTaskId(task.id);
    setTempTaskData({
      ...task,
      question_type: getMcqEditorQuestionType(task.question_type, task.options),
      accepted_answers: normalizeAcceptedAnswers(task.accepted_answers),
      answer_mode: getTaskAnswerMode(task),
      options: task.options ? [...task.options] : undefined,
      subquestions: task.subquestions ? [...task.subquestions] : undefined,
      bank_topics: Array.isArray(task.bank_topics) ? [...task.bank_topics] : [],
      bank_difficulty: task.bank_difficulty || "B",
      bank_task_id: typeof task.bank_task_id === "number" ? task.bank_task_id : null,
    });
    setIsDirty(false);
    setTempImageFile(null);
    setRemoveImage(false);
    setBankTopicInput("");
  };

  const handleStartNewTask = () => {
    setLegacyOptionCount(null);
    setValidationError(null);
    setEditingTaskId(null);
    setTempTaskData({
      text: "",
      question_type: "mcq",
      answer_mode: "choices",
      text_scale: "md",
      answer: "A",
      accepted_answers: [],
      sort_order: tasks.length,
      options: undefined,
      subquestions: undefined,
      bank_difficulty: "B",
      bank_topics: [],
      bank_task_id: null,
    });
    setIsDirty(false);
    setTempImageFile(null);
    setRemoveImage(false);
    setEditingField("text");
    setCurrentTaskIndex(tasks.length);
    setBankTopicInput("");
  };

  const handleSave = async () => {
    if (!isDirty && !isNewTask) return;
    if (legacyOptionCount !== null) { setValidationError("Сақтаудан бұрын 4 немесе 6 жауап нұсқасын таңдаңыз."); return; }

    // Prepare data for saving
    const taskToSave: Partial<LessonTask> & { imageFile?: File | null; removeImage?: boolean } = { ...tempTaskData };
    if (isMcqQuestionType(taskToSave.question_type)) {
      const labels = getMcqEditorLabels(taskToSave.question_type);
      taskToSave.options = labels.map((label) => ({ label, text: taskToSave.options?.find((option) => option.label === label)?.text || "" }));
      taskToSave.answer = serializeMcqAnswerLabels(parseMcqAnswerLabels(taskToSave.answer).filter((label) => labels.includes(label)));
      if (taskToSave.options.some((option) => !option.text.trim()) || !taskToSave.answer) {
        setValidationError("Барлық жауап нұсқаларын толтырып, дұрыс жауапты белгілеңіз."); return;
      }
    }
    setValidationError(null);
    taskToSave.accepted_answers = normalizeAcceptedAnswers(taskToSave.accepted_answers);
    if (tempImageFile) {
      taskToSave.imageFile = tempImageFile;
      taskToSave.removeImage = false;
    } else if (removeImage) {
      taskToSave.removeImage = true;
    }

    // For select, answer should be JSON array of correct answers
    if (taskToSave.question_type === "select" && taskToSave.subquestions) {
      const correctAnswers = taskToSave.subquestions.map((sq: any) => sq.correct || "A");
      taskToSave.answer = JSON.stringify(correctAnswers);
    }

    // For TF, answer is "true" or "false"
    // For input, answer is the text value

    setSaving(true);
    try {
      await onSave(taskToSave);
      setEditingTaskId(null);
      setTempTaskData({});
      setIsDirty(false);
      setEditingField(null);
      setTempImageFile(null);
      setRemoveImage(false);
      setBankTopicInput("");
      // Refresh tasks list after save
      await onAdd();
    } catch (error) {
      console.error("Error saving task:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!confirm("Тапсырманы жойғыңыз келе ме?")) return;
    try {
      await onDelete(taskId);
      if (currentTaskIndex >= tasks.length - 1) {
        setCurrentTaskIndex(Math.max(0, tasks.length - 2));
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const handleCancelEdit = () => {
    setValidationError(null);
    setLegacyOptionCount(null);
    setEditingTaskId(null);
    setTempTaskData({});
    setIsDirty(false);
    setEditingField(null);
    setTempImageFile(null);
    setRemoveImage(false);
    setBankTopicInput("");
  };

  const handleStartInlineCrop = (src: string) => {
    setInlineCropSrc(src);
    setCropPercent({ left: 0, top: 0, width: 100, height: 100 });
    setInlineCropActive(true);
  };

  const handleApplyInlineCrop = async () => {
    if (!inlineCropSrc || !cropImageRef.current) return;
    const img = cropImageRef.current;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const pixelCrop = {
      x: (cropPercent.left / 100) * nw,
      y: (cropPercent.top / 100) * nh,
      width: (cropPercent.width / 100) * nw,
      height: (cropPercent.height / 100) * nh,
    };
    setInlineCropApplying(true);
    try {
      const file = await createCroppedImageFile(inlineCropSrc, pixelCrop, 0);
      setTempImageFile(file);
      setIsDirty(true);
      setRemoveImage(false);
      setInlineCropActive(false);
      setInlineCropSrc(null);
    } catch (e) {
      console.error(e);
    } finally {
      setInlineCropApplying(false);
    }
  };

  const handleCancelInlineCrop = () => {
    setInlineCropActive(false);
    setInlineCropSrc(null);
  };

  const updateTempTask = (updates: Partial<LessonTask>) => {
    setTempTaskData(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const normalizeTopic = (rawTopic: string): string => rawTopic.trim().replace(/\s+/g, " ");
  const appendTopic = (topics: string[], rawTopic: string): string[] => {
    const topic = normalizeTopic(rawTopic);
    if (!topic) return topics;
    const exists = topics.some((value) => value.toLowerCase() === topic.toLowerCase());
    if (exists || topics.length >= 10 || topic.length > 64) return topics;
    return [...topics, topic];
  };

  const renderTaskCard = (task: LessonTask | Partial<LessonTask>, isEditing: boolean) => {
    const taskData = isEditing ? tempTaskData : task;
    const qt: QuestionType = (taskData.question_type || "input") as QuestionType;
    const handlePasteImage = (e: React.ClipboardEvent) => {
      if (!isEditing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        const ext = file.type.split("/")[1] || "png";
        const namedFile = new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
        setTempImageFile(namedFile);
        setRemoveImage(false);
        setIsDirty(true);
        return;
      }
    };

    return (
      <div
        className={plain ? styles.surface : "glass rounded-3xl shadow-2xl p-6 border border-white/30"}
        onPaste={handlePasteImage}
      >
        <div className={plain ? "min-w-0" : "bg-white/70 rounded-2xl p-4 border border-white/40"}>
          {/* Question Text */}
          <div className="mb-4">
            {isEditing && editingField === "text" ? (
              <MathFieldInput
                ariaLabel="Тапсырма мәтіні"
                value={taskData.text || ""}
                onChange={(value) => updateTempTask({ text: value })}
                onBlur={() => setEditingField(null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold text-gray-900"
                autoFocus
              />
            ) : (
              <div
                role={isEditing ? "button" : undefined}
                aria-label={isEditing ? "Тапсырма мәтінін өңдеу" : undefined}
                tabIndex={isEditing ? 0 : undefined}
                onKeyDown={(event) => {
                  if (isEditing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setEditingField("text"); }
                }}
                onClick={() => {
                  if (isEditing) {
                    setEditingField("text");
                  }
                }}
                className={`font-semibold text-gray-900 min-h-[3rem] ${getTaskTextScaleClass(normalizeTaskTextScale(taskData.text_scale))} ${isEditing ? "cursor-pointer hover:bg-gray-100 rounded p-2" : ""
                  }`}
                style={getTaskTextScaleStyle(taskData.text_scale)}
              >
                {taskData.text ? (
                  <MathRender latex={taskData.text} />
                ) : (
                  "Мәтіні жоқ тапсырма (өңдеу үшін басыңыз)"
                )}
              </div>
            )}
          </div>

          <BankMetadataFields
            isEditing={isEditing}
            showBankMetadata={showBankMetadata}
            context={context}
            taskData={taskData}
            updateTempTask={updateTempTask}
            isNewTask={isNewTask}
            bankTopicInput={bankTopicInput}
            setBankTopicInput={setBankTopicInput}
            appendTopic={appendTopic}
          />

          {/* Тапсырма суреті */}
          <TaskImageCrop
            tempImagePreview={tempImagePreview}
            taskData={taskData}
            removeImage={removeImage}
            isEditing={isEditing}
            imageWrapperRef={imageWrapperRef}
            inlineCropActive={inlineCropActive}
            handleStartInlineCrop={handleStartInlineCrop}
            cropImageRef={cropImageRef}
            inlineCropSrc={inlineCropSrc}
            cropPercent={cropPercent}
            setDraggingHandle={setDraggingHandle}
            handleCancelInlineCrop={handleCancelInlineCrop}
            handleApplyInlineCrop={handleApplyInlineCrop}
            inlineCropApplying={inlineCropApplying}
          />

          <TaskImageUpload
            isEditing={isEditing}
            tempImagePreview={tempImagePreview}
            taskData={taskData}
            removeImage={removeImage}
            tempImageFile={tempImageFile}
            setTempImageFile={setTempImageFile}
            setRemoveImage={setRemoveImage}
            setIsDirty={setIsDirty}
          />

          {/* Тапсырмаға арналған басқару элементтері */}
          <McqAnswerFields
            qt={qt}
            isEditing={isEditing}
            taskData={taskData}
            editingField={editingField}
            updateTempTask={updateTempTask}
            setEditingField={setEditingField}
          />

          {qt === "input" && (
            <div>
              {isEditing && editingField === "answer" ? (
                <MathFieldInput
                  ariaLabel="Дұрыс жауап"
                  value={taskData.answer || ""}
                  onChange={(value) => updateTempTask({ answer: value })}
                  onBlur={() => setEditingField(null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Дұрыс жауап"
                  autoFocus
                />
              ) : (
                <div
                  role={isEditing ? "button" : undefined}
                  aria-label={isEditing ? "Дұрыс жауапты өңдеу" : undefined}
                  tabIndex={isEditing ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (isEditing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setEditingField("answer"); }
                  }}
                  onClick={() => {
                    if (isEditing) {
                      setEditingField("answer");
                    }
                  }}
                  className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400 ${isEditing ? "cursor-pointer hover:bg-gray-100" : ""
                    }`}
                >
                  {taskData.answer ? (
                    <MathRender latex={taskData.answer} inline />
                  ) : (
                    isEditing ? "Дұрыс жауапты өңдеу үшін басыңыз" : "Дұрыс жауап"
                  )}
                </div>
              )}
            </div>
          )}

          {qt === "input" && isEditing && (
            <AcceptedAnswersEditor
              value={taskData.accepted_answers}
              onChange={(acceptedAnswers) => updateTempTask({ accepted_answers: acceptedAnswers })}
            />
          )}

          {qt === "tf" && (
            <div className="flex gap-2">
              {["true", "false"].map((value) => {
                const isSelected = taskData.answer === value;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      if (isEditing) {
                        updateTempTask({ answer: value });
                      }
                    }}
                    className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${isSelected
                      ? "bg-purple-600 text-white"
                      : isEditing
                        ? value === "true"
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-red-600 hover:bg-red-700 text-white"
                        : value === "true"
                          ? "bg-green-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                  >
                    {value === "true" ? "Дұрыс" : "Жалған"}
                  </button>
                );
              })}
            </div>
          )}

          <MatchingAnswerFields
            qt={qt}
            taskData={taskData}
            isEditing={isEditing}
            editingField={editingField}
            updateTempTask={updateTempTask}
            setEditingField={setEditingField}
          />
        </div>

        {/* Action buttons */}
        {isEditing && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className={plain ? styles.primary : "bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"}
            >
              {saving ? "Сақталуда..." : "Сақтау"}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className={plain ? styles.button : "bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg"}
            >
              Болдырмау
            </button>
          </div>
        )}
      </div>
    );
  };

  const displayTask = editingTask || currentTask;
  const isEditing = !!editingTask || isNewTask;

  return (
    <div className={plain ? styles.plain : "w-full"} role={plain ? "region" : undefined} aria-label={plain ? "Тапсырма редакторы" : undefined}>
      {validationError && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationError}</p>}
      {isEditing && legacyOptionCount !== null && <p className="mb-4 text-sm text-amber-700">Бұл ескі тапсырмада {legacyOptionCount} жауап нұсқасы бар. Сұрақ түрінен 4 немесе 6 жауапты таңдағанға дейін тапсырма сақталмайды.</p>}
      {/* Navigation buttons at top */}
      <nav aria-label="Тапсырма нөмірлері" className={plain ? styles.navigation : "mb-6 overflow-x-auto pb-2"}>
        <div className={plain ? styles.numbers : "flex gap-2 min-w-full w-max justify-center"}>
          {tasks.map((task, idx) => {
            const isCurrent = idx === currentTaskIndex && !isEditing;
            return (
              <button
                key={task.id}
                type="button"
                aria-label={`${idx + 1}-тапсырма`}
                aria-current={idx === currentTaskIndex ? "step" : undefined}
                disabled={saving}
                onClick={() => {
                  if (!isDirty || confirm("Сақталмаған өзгерістер бар. Жалғастыру керек пе?")) {
                    handleCancelEdit();
                    setCurrentTaskIndex(idx);
                  }
                }}
                className={plain ? `${styles.number} ${idx === currentTaskIndex ? styles.numberActive : ""}` : `shrink-0 w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${isCurrent
                  ? "bg-purple-600 border-purple-700 text-white"
                  : "bg-white/70 border-gray-300 text-gray-700 hover:border-purple-400"
                  }`}
              >
                {idx + 1}
              </button>
            );
          })}
          {isNewTask && (
            <button
              className="shrink-0 w-10 h-10 rounded-lg border-2 border-purple-600 bg-purple-600 text-white flex items-center justify-center font-bold"
            >
              {tasks.length + 1}
            </button>
          )}
        </div>
      </nav>

      {/* Current task card */}
      {plain && currentTask && <div className={styles.taskToolbar}>
        <h3 className={styles.taskHeading}>{currentTaskIndex + 1}-тапсырма</h3>
        {!isEditing && <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => handleStartEdit(currentTask)}>Өңдеу</button>
          <button type="button" className={styles.danger} onClick={() => void handleDelete(currentTask.id)}>Жою</button>
        </div>}
      </div>}
      {displayTask ? (
        <div key={isNewTask ? "new-task" : editingTaskId ? `editing-${editingTaskId}` : `view-${(currentTask as LessonTask).id}-${currentTaskIndex}`}>
          {renderTaskCard(displayTask as LessonTask, isEditing)}
        </div>
      ) : (
        <div className={plain ? styles.empty : "glass rounded-3xl shadow-2xl p-6 border border-white/30 text-center text-gray-600"}>
          Тапсырмалар жоқ
        </div>
      )}

      {/* Bottom navigation and actions */}
      {(!plain || showAddButton || (tasks.length > 1 && !isEditing)) && <div className={plain ? styles.toolbar : "flex justify-between items-center mt-6"}>
        <div className={plain ? styles.actions : "flex gap-2"}>
          {currentTaskIndex > 0 && !isEditing && (
            <button
              onClick={() => setCurrentTaskIndex(currentTaskIndex - 1)}
              className={plain ? styles.button : "bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg"}
            >
              <Icon name="arrowLeft" /> Алдыңғы
            </button>
          )}
          {!isEditing && showAddButton && (
            <button
              onClick={handleStartNewTask}
              className={plain ? styles.primary : "bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"}
            >
              <Icon name="plus" /> Жаңа тапсырма
            </button>
          )}
          {!plain && currentTask && !isEditing && (
            <button
              onClick={() => handleStartEdit(currentTask)}
              className={plain ? styles.button : "bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"}
            >
              Өңдеу
            </button>
          )}
          {!plain && currentTask && !isEditing && (
            <button
              onClick={() => handleDelete(currentTask.id)}
              className={plain ? styles.danger : "bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"}
            >
              Жою
            </button>
          )}
        </div>
        <div>
          {currentTaskIndex < tasks.length - 1 && !isEditing && (
            <button
              onClick={() => setCurrentTaskIndex(currentTaskIndex + 1)}
              className={plain ? styles.button : "bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"}
            >
              Келесі <Icon name="arrowRight" />
            </button>
          )}
        </div>
      </div>}

      {/* Question type selector when editing */}
      {isEditing && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          {plain && <label className="mb-4 grid gap-2 text-sm font-semibold text-slate-700">Реті
            <input type="number" step={1} value={tempTaskData.sort_order ?? 0} disabled={saving}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
              onChange={(event) => updateTempTask({ sort_order: Number(event.target.value) || 0 })} />
          </label>}
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Сұрақ түрі
          </label>
          <select
            aria-label="Сұрақ түрі"
            value={legacyOptionCount !== null ? "" : tempTaskData.question_type || "input"}
            onChange={(e) => {
              const questionType = e.target.value as QuestionType;
              setLegacyOptionCount(null); setValidationError(null); setEditingField(null);
              updateTempTask({
                question_type: questionType,
                ...(isMcqQuestionType(questionType) ? {
                  options: getMcqEditorLabels(questionType).map((label) => ({ label, text: tempTaskData.options?.find((option) => option.label === label)?.text || "" })),
                  answer: serializeMcqAnswerLabels(parseMcqAnswerLabels(tempTaskData.answer).filter((label) => getMcqEditorLabels(questionType).includes(label))),
                } : {}),
                answer_mode: getTaskAnswerMode({ question_type: questionType }),
              });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {legacyOptionCount !== null && <option value="" disabled>4 немесе 6 жауапты таңдаңыз</option>}
            <option value="input">Енгізу</option>
            <option value="tf">Дұрыс / Жалған</option>
            <option value="mcq">Көп таңдаулы (4 жауап)</option>
            <option value="mcq6">Көп таңдаулы (6 жауап)</option>
            <option value="select">Сәйкестендіру</option>
          </select>
          {supportsAnswerModeSwitch(tempTaskData.question_type) && (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Оқушы қалай жауап береді
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { value: "choices", title: "Нұсқаны таңдайды", hint: "Дайын жауаптарды батырма арқылы таңдайды" },
                  { value: "written", title: "Жауапты өзі жазады", hint: "Математикалық пернетақтамен жауап енгізеді" },
                ].map((mode) => {
                  const isActive = getTaskAnswerMode(tempTaskData) === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => updateTempTask({ answer_mode: mode.value as "choices" | "written" })}
                      className={`rounded-xl border p-3 text-left transition-colors ${isActive
                        ? "border-purple-600 bg-purple-50 ring-2 ring-purple-200"
                        : "border-gray-300 bg-white hover:border-purple-300"
                        }`}
                    >
                      <div className="font-semibold text-gray-900">{mode.title}</div>
                      <div className="mt-1 text-xs text-gray-600">{mode.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {isEditing && (
        <StudentTaskPreview
          task={{ ...tempTaskData, id: editingTaskId ?? -1, sort_order: tempTaskData.sort_order ?? tasks.length }}
          imageSrc={removeImage ? null : tempImagePreview || undefined}
          onTextScaleChange={(text_scale) => updateTempTask({ text_scale })}
          className="mt-4"
        />
      )}

    </div>
  );
}

