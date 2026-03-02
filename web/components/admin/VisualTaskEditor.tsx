"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { apiPath } from "@/lib/api";
import { parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { LessonTask, QuestionType } from "@/types";
import { createCroppedImageFile } from "@/lib/imageCrop";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";

type CropPercent = { left: number; top: number; width: number; height: number };
const MIN_CROP_PCT = 5;
const HANDLES = ["tl", "t", "tr", "r", "br", "b", "bl", "l"] as const;

interface VisualTaskEditorProps {
  tasks: LessonTask[];
  onSave: (task: Partial<LessonTask> & { imageFile?: File | null; removeImage?: boolean }) => Promise<void>;
  onAdd: () => void;
  onDelete: (taskId: number) => Promise<void>;
  context: "trial-test" | "mini-lesson";
  showBankMetadata?: boolean;
  testIdOrMiniLessonId?: number;
  email: string;
}

export default function VisualTaskEditor({
  tasks,
  onSave,
  onAdd,
  onDelete,
  context,
  showBankMetadata = false,
  testIdOrMiniLessonId,
  email,
}: VisualTaskEditorProps) {
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
    setEditingTaskId(task.id);
    setTempTaskData({
      ...task,
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
    setEditingTaskId(null);
    setTempTaskData({
      text: "",
      question_type: "mcq",
      text_scale: "md",
      answer: "",
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
    
    // Prepare data for saving
    const taskToSave: Partial<LessonTask> & { imageFile?: File | null; removeImage?: boolean } = { ...tempTaskData };
    if (tempImageFile) {
      taskToSave.imageFile = tempImageFile;
      taskToSave.removeImage = false;
    } else if (removeImage) {
      taskToSave.removeImage = true;
    }
    
    // For MCQ, answer should be the label (A, B, C, or D)
    if (taskToSave.question_type === "mcq") {
      // answer is already set correctly
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
    const qt: QuestionType = (task.question_type || "input") as QuestionType;
    const taskData = isEditing ? tempTaskData : task;
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
        className="glass rounded-3xl shadow-2xl p-6 border border-white/30"
        onPaste={handlePasteImage}
      >
        <div className="bg-white/70 rounded-2xl p-4 border border-white/40">
          {/* Question Text */}
          <div className="mb-4">
            {isEditing && editingField === "text" ? (
              <MathFieldInput
                value={taskData.text || ""}
                onChange={(value) => updateTempTask({ text: value })}
                onBlur={() => setEditingField(null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold text-gray-900"
                autoFocus
              />
            ) : (
              <div
                onClick={() => {
                  if (isEditing) {
                    setEditingField("text");
                  }
                }}
                className={`font-semibold text-gray-900 min-h-[3rem] ${getTaskTextScaleClass(normalizeTaskTextScale(taskData.text_scale))} ${
                  isEditing ? "cursor-pointer hover:bg-gray-100 rounded p-2" : ""
                }`}
              >
                {taskData.text ? (
                  <MathRender latex={taskData.text} />
                ) : (
                  "Мәтіні жоқ тапсырма (өңдеу үшін басыңыз)"
                )}
              </div>
            )}
          </div>

          {isEditing && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Мәтін өлшемі</label>
              <div className="flex gap-2">
                {[
                  { label: "S", value: "sm" },
                  { label: "M", value: "md" },
                  { label: "L", value: "lg" },
                ].map((item) => {
                  const isActive = normalizeTaskTextScale(taskData.text_scale) === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => updateTempTask({ text_scale: item.value as "sm" | "md" | "lg" })}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? "border-purple-600 bg-purple-600 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEditing && showBankMetadata && context === "trial-test" && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">БАНК параметрлері</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Күрделілік</label>
                  <select
                    value={(taskData.bank_difficulty || "B") as string}
                    onChange={(e) => updateTempTask({ bank_difficulty: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                    disabled={!isNewTask && !taskData.bank_task_id}
                  >
                    <option value="A">A (оңай)</option>
                    <option value="B">B (орташа)</option>
                    <option value="C">C (қиын)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Тақырыптар</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(Array.isArray(taskData.bank_topics) ? taskData.bank_topics : []).map((topic) => (
                      <span key={topic} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs">
                        {topic}
                        <button
                          type="button"
                          onClick={() => {
                            const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                            updateTempTask({ bank_topics: prevTopics.filter((value) => value.toLowerCase() !== topic.toLowerCase()) });
                          }}
                          className="text-purple-700 hover:text-purple-900 disabled:text-gray-400"
                          disabled={!isNewTask && !taskData.bank_task_id}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bankTopicInput}
                      onChange={(e) => setBankTopicInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                          updateTempTask({ bank_topics: appendTopic(prevTopics, bankTopicInput) });
                          setBankTopicInput("");
                        }
                      }}
                      placeholder="Тақырып қосу"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                      disabled={!isNewTask && !taskData.bank_task_id}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                        updateTempTask({ bank_topics: appendTopic(prevTopics, bankTopicInput) });
                        setBankTopicInput("");
                      }}
                      className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                      disabled={!isNewTask && !taskData.bank_task_id}
                    >
                      +
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Ең көбі 10 тақырып, әрқайсысы 64 таңбаға дейін</div>
                </div>
              </div>
              {!isNewTask && !taskData.bank_task_id && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Бұл ескі тапсырма БАНК-пен байланыспаған. Тегтер өшірулі, БАНК-пен синхрондау орындалмайды.
                </div>
              )}
            </div>
          )}

          {/* Тапсырма суреті */}
          {(tempImagePreview || (taskData.image_filename && !removeImage)) && (
            <div className="mb-4">
              {isEditing ? (
                <div
                  ref={imageWrapperRef}
                  className={`relative inline-block rounded-lg border border-gray-200 overflow-hidden ${!inlineCropActive ? "cursor-pointer" : ""}`}
                  onClick={(e) => {
                    if (inlineCropActive) e.stopPropagation();
                    else {
                      const src = tempImagePreview || apiPath(`images/${taskData.image_filename}`);
                      handleStartInlineCrop(src);
                    }
                  }}
                >
                  <Image
                    ref={cropImageRef}
                    src={tempImagePreview || apiPath(`images/${taskData.image_filename}`)}
                    alt="Тапсырма"
                    width={1280}
                    height={720}
                    unoptimized
                    className="max-h-64 w-auto block rounded-lg border-0"
                    draggable={false}
                    style={inlineCropActive ? { pointerEvents: "none" } : undefined}
                  />
                  {inlineCropActive && inlineCropSrc === (tempImagePreview || apiPath(`images/${taskData.image_filename}`)) && (
                    <>
                      <div
                        className="absolute inset-0 bg-black/50"
                        style={{
                          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${cropPercent.left}% ${cropPercent.top}%, ${cropPercent.left + cropPercent.width}% ${cropPercent.top}%, ${cropPercent.left + cropPercent.width}% ${cropPercent.top + cropPercent.height}%, ${cropPercent.left}% ${cropPercent.top + cropPercent.height}%)`,
                          clipRule: "evenodd",
                        }}
                      />
                      <div
                        className="absolute border-2 border-white pointer-events-none box-border"
                        style={{
                          left: `${cropPercent.left}%`,
                          top: `${cropPercent.top}%`,
                          width: `${cropPercent.width}%`,
                          height: `${cropPercent.height}%`,
                        }}
                      />
                      {HANDLES.map((h) => {
                        let left = cropPercent.left;
                        let top = cropPercent.top;
                        if (h === "t" || h === "b") left = cropPercent.left + cropPercent.width / 2;
                        else if (h === "tr" || h === "r" || h === "br") left = cropPercent.left + cropPercent.width;
                        if (h === "l" || h === "r") top = cropPercent.top + cropPercent.height / 2;
                        else if (h === "bl" || h === "b" || h === "br") top = cropPercent.top + cropPercent.height;
                        return (
                          <div
                            key={h}
                            className="absolute w-4 h-4 bg-white border-2 border-purple-600 rounded-full cursor-move -translate-x-1/2 -translate-y-1/2 z-10"
                            style={{ left: `${left}%`, top: `${top}%` }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDraggingHandle(h);
                            }}
                          />
                        );
                      })}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelInlineCrop();
                          }}
                          className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg"
                        >
                          Болдырмау
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyInlineCrop();
                          }}
                          disabled={inlineCropApplying}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                        >
                          {inlineCropApplying ? "…" : "Қолдану"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Image
                  src={tempImagePreview || apiPath(`images/${taskData.image_filename}`)}
                  alt="Тапсырма"
                  width={1280}
                  height={720}
                  unoptimized
                  className="max-h-64 w-auto rounded-lg border border-gray-200"
                />
              )}
            </div>
          )}

          {isEditing && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Сурет</label>
              {(tempImagePreview || taskData.image_filename || removeImage) && (
                <div className="mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1">
                    {removeImage
                      ? "Сақтаған кезде сурет жойылады"
                      : tempImageFile
                        ? "Жаңа сурет (сақталады)"
                        : taskData.image_filename
                          ? `Ағымдағы: ${taskData.image_filename}`
                          : null}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file) {
                        setTempImageFile(file);
                        setRemoveImage(false);
                        setIsDirty(true);
                      }
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition-colors">
                    {removeImage ? "Сурет қосу" : tempImageFile || taskData.image_filename ? "Суретті ауыстыру" : "Сурет қосу"}
                  </div>
                </label>
                {removeImage ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRemoveImage(false);
                      setIsDirty(true);
                    }}
                    className="shrink-0 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors cursor-pointer select-none"
                  >
                    Жоюды болдырмау
                  </button>
                ) : (tempImageFile || taskData.image_filename) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTempImageFile(null);
                      setRemoveImage(true);
                      setIsDirty(true);
                    }}
                    className="shrink-0 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors cursor-pointer select-none"
                  >
                    Жою
                  </button>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                💡 Суретті Ctrl+V арқылы да қоюға болады
              </div>
            </div>
          )}

          {/* Тапсырмаға арналған басқару элементтері */}
          {(qt === "mcq" || qt === "mcq6") && (
            <div className="grid grid-cols-1 gap-2">
              {(qt === "mcq6" ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D"]).map((label) => {
                const option = taskData.options?.find((o: any) => o.label === label);
                const optionText = option?.text || "";
                const isCorrect = taskData.answer === label;
                const isEditingOption = isEditing && editingField === `option-${label}`;

                return (
                  <div key={label}>
                    {isEditingOption ? (
                      <div className="border-2 border-purple-500 rounded-lg p-3 bg-white">
                        <div className="font-bold text-gray-900 mb-2">{label}</div>
                        <MathFieldInput
                          value={optionText}
                          onChange={(value) => {
                            const newOptions = [...(taskData.options || [])];
                            const existingIndex = newOptions.findIndex((o: any) => o.label === label);
                            if (existingIndex >= 0) {
                              newOptions[existingIndex] = { label, text: value };
                            } else {
                              newOptions.push({ label, text: value });
                            }
                            updateTempTask({ options: newOptions });
                          }}
                          onBlur={() => setEditingField(null)}
                          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
                          placeholder="Жауап нұсқасы"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            updateTempTask({ answer: label });
                            setEditingField(null);
                          }}
                          className={`w-full text-xs px-2 py-1 rounded ${
                            isCorrect
                              ? "bg-purple-600 text-white"
                              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                          }`}
                        >
                          {isCorrect ? "✓ Дұрыс жауап" : "Дұрыс қылу"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (isEditing) {
                            if (editingField === null) {
                              setEditingField(`option-${label}`);
                            } else {
                              updateTempTask({ answer: label });
                            }
                          }
                        }}
                        className={`text-left border-2 rounded-lg p-3 transition-colors w-full ${
                          isCorrect
                            ? "bg-purple-600 border-purple-700 text-white"
                            : isEditing
                            ? "border-gray-200 hover:border-purple-300 hover:bg-purple-50 cursor-pointer"
                            : "border-gray-200"
                        }`}
                      >
                        <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 ${isCorrect ? "text-white" : "text-gray-700"}`}>
                          <span className={`font-bold shrink-0 ${isCorrect ? "text-white" : "text-gray-900"}`}>
                            {label}
                          </span>
                          <div className="min-w-0 break-words whitespace-normal">
                            {optionText ? (
                              <MathRender latex={optionText} inline className={isCorrect ? "text-white" : "text-gray-700"} />
                            ) : (
                              isEditing ? "Өңдеу үшін басыңыз" : ""
                            )}
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {qt === "input" && (
            <div>
              {isEditing && editingField === "answer" ? (
                <MathFieldInput
                  value={taskData.answer || ""}
                  onChange={(value) => updateTempTask({ answer: value })}
                  onBlur={() => setEditingField(null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Дұрыс жауап"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => {
                    if (isEditing) {
                      setEditingField("answer");
                    }
                  }}
                  className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400 ${
                    isEditing ? "cursor-pointer hover:bg-gray-100" : ""
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

          {qt === "factor_grid" && (
            <div className="grid grid-cols-2 gap-3">
              {parseFactorGridAnswer(String(taskData.answer || "")).map((cell, idx) => {
                const labels = ["ax² #1", "c #1", "ax² #2", "c #2"];
                const fieldKey = `factor-grid-${idx}`;
                const isEditingCell = isEditing && editingField === fieldKey;
                return (
                  <div key={fieldKey} className="space-y-1">
                    <div className="text-xs font-semibold text-gray-600">{labels[idx]}</div>
                    {isEditingCell ? (
                      <MathFieldInput
                        value={cell}
                        onChange={(value) => {
                          const next = parseFactorGridAnswer(String(taskData.answer || ""));
                          next[idx] = value;
                          updateTempTask({ answer: serializeFactorGridAnswer(next) });
                        }}
                        onBlur={() => setEditingField(null)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                        placeholder="Жауап"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={() => {
                          if (isEditing) {
                            setEditingField(fieldKey);
                          }
                        }}
                        className={`border border-gray-300 rounded-lg px-3 py-2 min-h-[3rem] text-gray-900 ${
                          isEditing ? "cursor-pointer hover:bg-gray-100" : ""
                        }`}
                      >
                        {cell ? <MathRender latex={cell} inline /> : isEditing ? "Өңдеу үшін басыңыз" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                    className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${
                      isSelected
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

          {qt === "select" && (
            <div className="space-y-3">
              {/* Options for select type */}
              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Жауап нұсқалары:</div>
                <div className="grid grid-cols-1 gap-2">
                  {["A", "B", "C", "D"].map((label) => {
                    const option = taskData.options?.find((o: any) => o.label === label);
                    const optionText = option?.text || "";
                    const isEditingOption = isEditing && editingField === `select-option-${label}`;

                    return (
                      <div key={label}>
                        {isEditingOption ? (
                          <MathFieldInput
                            value={optionText}
                            onChange={(value) => {
                              const newOptions = [...(taskData.options || [])];
                              const existingIndex = newOptions.findIndex((o: any) => o.label === label);
                              if (existingIndex >= 0) {
                                newOptions[existingIndex] = { label, text: value };
                              } else {
                                newOptions.push({ label, text: value });
                              }
                              updateTempTask({ options: newOptions });
                            }}
                            onBlur={() => setEditingField(null)}
                            className="w-full border-2 border-purple-500 rounded px-2 py-1"
                            placeholder={`Нұсқа ${label}`}
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => {
                              if (isEditing) {
                                setEditingField(`select-option-${label}`);
                              }
                            }}
                            className={`border rounded px-2 py-1 text-sm ${
                              isEditing ? "cursor-pointer hover:bg-gray-100 border-gray-300" : "border-gray-200"
                            }`}
                          >
                            <span className="font-bold">{label}:</span> {optionText ? (
                              <MathRender latex={optionText} inline />
                            ) : (
                              isEditing ? "Өңдеу үшін басыңыз" : ""
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subquestions */}
              {[0, 1].map((idx) => {
                const subquestion = taskData.subquestions?.[idx];
                const subText = subquestion?.text || "";
                const correctAnswer = subquestion?.correct || "A";
                const isEditingSub = isEditing && editingField === `subquestion-${idx}`;

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-6 text-gray-700 font-semibold">{idx === 0 ? "A)" : "B)"}</div>
                    <div className="flex-1">
                      {isEditingSub ? (
                        <div className="space-y-2">
                          <MathFieldInput
                            value={subText}
                            onChange={(value) => {
                              const newSubquestions = [...(taskData.subquestions || [])];
                              newSubquestions[idx] = { text: value, correct: correctAnswer };
                              updateTempTask({ subquestions: newSubquestions });
                            }}
                            onBlur={() => setEditingField(null)}
                            className="w-full border-2 border-purple-500 rounded-lg px-3 py-2"
                            placeholder="Қосымша сұрақ мәтіні"
                            autoFocus
                          />
                          <select
                            value={correctAnswer}
                            onChange={(e) => {
                              const newSubquestions = [...(taskData.subquestions || [])];
                              newSubquestions[idx] = { text: subText, correct: e.target.value };
                              updateTempTask({ subquestions: newSubquestions });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <div
                            onClick={() => {
                              if (isEditing) {
                                setEditingField(`subquestion-${idx}`);
                              }
                            }}
                            className={`text-gray-900 mb-2 ${
                              isEditing ? "cursor-pointer hover:bg-gray-100 rounded p-2" : ""
                            }`}
                          >
                            {subText ? (
                              <MathRender latex={subText} inline />
                            ) : (
                              isEditing ? "Қосымша сұрақты өңдеу үшін басыңыз" : ""
                            )}
                          </div>
                          <select
                            value={correctAnswer}
                            onChange={(e) => {
                              if (isEditing) {
                                const newSubquestions = [...(taskData.subquestions || [])];
                                newSubquestions[idx] = { text: subText, correct: e.target.value };
                                updateTempTask({ subquestions: newSubquestions });
                              }
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white"
                            disabled={!isEditing}
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {isEditing && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
            >
              {saving ? "Сақталуда..." : "Сақтау"}
            </button>
            <button
              onClick={handleCancelEdit}
              className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg"
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
    <div className="w-full">
      {/* Navigation buttons at top */}
      <div className="mb-6 overflow-x-auto pb-2">
        <div className="flex gap-2 min-w-full w-max justify-center">
          {tasks.map((task, idx) => {
            const isCurrent = idx === currentTaskIndex && !isEditing;
            return (
              <button
                key={task.id}
                onClick={() => {
                  if (!isDirty || confirm("Сақталмаған өзгерістер бар. Жалғастыру керек пе?")) {
                    handleCancelEdit();
                    setCurrentTaskIndex(idx);
                  }
                }}
                className={`shrink-0 w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${
                  isCurrent
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
      </div>

      {/* Current task card */}
      {displayTask ? (
        <div key={isNewTask ? "new-task" : editingTaskId ? `editing-${editingTaskId}` : `view-${(currentTask as LessonTask).id}-${currentTaskIndex}`}>
          {renderTaskCard(displayTask as LessonTask, isEditing)}
        </div>
      ) : (
        <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 text-center text-gray-600">
          Тапсырмалар жоқ
        </div>
      )}

      {/* Bottom navigation and actions */}
      <div className="flex justify-between items-center mt-6">
        <div className="flex gap-2">
          {currentTaskIndex > 0 && !isEditing && (
            <button
              onClick={() => setCurrentTaskIndex(currentTaskIndex - 1)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg"
            >
              ← Алдыңғы
            </button>
          )}
          {!isEditing && (
            <button
              onClick={handleStartNewTask}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              + Жаңа тапсырма
            </button>
          )}
          {currentTask && !isEditing && (
            <button
              onClick={() => handleStartEdit(currentTask)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Өңдеу
            </button>
          )}
          {currentTask && !isEditing && (
            <button
              onClick={() => handleDelete(currentTask.id)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Жою
            </button>
          )}
        </div>
        <div>
          {currentTaskIndex < tasks.length - 1 && !isEditing && (
            <button
              onClick={() => setCurrentTaskIndex(currentTaskIndex + 1)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Келесі →
            </button>
          )}
        </div>
      </div>

      {/* Question type selector when editing */}
      {isEditing && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Сұрақ түрі
          </label>
          <select
            value={tempTaskData.question_type || "input"}
            onChange={(e) => updateTempTask({ question_type: e.target.value as QuestionType })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="input">Енгізу</option>
            <option value="tf">Дұрыс / Жалған</option>
            <option value="mcq">Көп таңдаулы (4)</option>
            <option value="mcq6">Көп таңдаулы (6)</option>
            <option value="select">Сәйкестендіру</option>
            <option value="factor_grid">Factor Grid</option>
          </select>
        </div>
      )}

    </div>
  );
}




