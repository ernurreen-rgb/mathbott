"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import {
  apiPath,
  clearTrialTestSlot,
  createTrialTest,
  deleteTrialTest,
  getAdminBankTasks,
  getAdminTrialTests,
  getAdminTrialTestTasks,
  updateTrialTest,
  upsertTrialTestSlot,
} from "@/lib/api";
import { isFactorGridComplete, parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { BankDifficulty, BankPlacementTask, BankTask, QuestionType, TaskTextScale, TrialTest } from "@/types";

type SlotForm = {
  text: string;
  question_type: QuestionType;
  text_scale: TaskTextScale;
  answer: string;
  difficulty: BankDifficulty;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  optionF: string;
  correctOption: "A" | "B" | "C" | "D" | "E" | "F";
  correctTf: "true" | "false";
  subQuestion1: string;
  subQuestion2: string;
  correctSub1: "A" | "B" | "C" | "D";
  correctSub2: "A" | "B" | "C" | "D";
  factorTopLeft: string;
  factorTopRight: string;
  factorBottomLeft: string;
  factorBottomRight: string;
  topicsRaw: string;
};

const emptySlotForm = (): SlotForm => ({
  text: "",
  question_type: "mcq",
  text_scale: "md",
  answer: "",
  difficulty: "B",
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
  factorTopLeft: "",
  factorTopRight: "",
  factorBottomLeft: "",
  factorBottomRight: "",
  topicsRaw: "",
});

const parseTopics = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 10);

const buildSlotPayload = (form: SlotForm) => {
  const payload: Record<string, any> = {
    text: form.text,
    question_type: form.question_type,
    text_scale: form.text_scale,
    bank_difficulty: form.difficulty,
    bank_topics: parseTopics(form.topicsRaw),
  };

  if (form.question_type === "input") {
    payload.answer = form.answer;
    return payload;
  }
  if (form.question_type === "tf") {
    payload.answer = form.correctTf;
    return payload;
  }
  if (form.question_type === "mcq" || form.question_type === "mcq6") {
    payload.answer = form.correctOption;
    payload.options = [
      { label: "A", text: form.optionA },
      { label: "B", text: form.optionB },
      { label: "C", text: form.optionC },
      { label: "D", text: form.optionD },
      ...(form.question_type === "mcq6"
        ? [
            { label: "E", text: form.optionE },
            { label: "F", text: form.optionF },
          ]
        : []),
    ];
    return payload;
  }
  if (form.question_type === "factor_grid") {
    payload.answer = serializeFactorGridAnswer([
      form.factorTopLeft,
      form.factorTopRight,
      form.factorBottomLeft,
      form.factorBottomRight,
    ]);
    return payload;
  }

  payload.answer = JSON.stringify([form.correctSub1, form.correctSub2]);
  payload.options = [
    { label: "A", text: form.optionA },
    { label: "B", text: form.optionB },
    { label: "C", text: form.optionC },
    { label: "D", text: form.optionD },
  ];
  payload.subquestions = [
    { text: form.subQuestion1, correct: form.correctSub1 },
    { text: form.subQuestion2, correct: form.correctSub2 },
  ];
  return payload;
};

const getPlacementQuestionType = (placement: BankPlacementTask | null): QuestionType => {
  const raw = placement?.question_type || placement?.bank_task?.question_type || "input";
  if (raw === "mcq" || raw === "mcq6" || raw === "input" || raw === "tf" || raw === "select" || raw === "factor_grid") {
    return raw;
  }
  return "input";
};

const getPlacementOptions = (placement: BankPlacementTask | null) => {
  const options = placement?.options || placement?.bank_task?.options;
  return Array.isArray(options) ? options : [];
};

const getPlacementSubquestions = (placement: BankPlacementTask | null) => {
  const subquestions = placement?.subquestions || placement?.bank_task?.subquestions;
  return Array.isArray(subquestions) ? subquestions : [];
};

const getPlacementText = (placement: BankPlacementTask | null): string => {
  return placement?.text || placement?.bank_task?.text || "";
};

const getPlacementTextScale = (placement: BankPlacementTask | null): TaskTextScale =>
  normalizeTaskTextScale(placement?.text_scale || placement?.bank_task?.text_scale);

const getPlacementImageFilename = (placement: BankPlacementTask | null): string | null => {
  return placement?.image_filename || placement?.bank_task?.image_filename || null;
};

const parseSelectAnswer = (value?: string): [string, string] => {
  if (!value) return ["", ""];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return [String(parsed[0] || ""), String(parsed[1] || "")];
    }
  } catch {
    // ignore parse errors
  }
  return ["", ""];
};

const isSelectAnswerComplete = (value?: string): boolean => {
  const [a, b] = parseSelectAnswer(value);
  return a.trim().length > 0 && b.trim().length > 0;
};

const isFactorGridAnswerComplete = (value?: string): boolean => isFactorGridComplete(parseFactorGridAnswer(value));

export default function AdminTrialTestsPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("content", status, email);

  const [tests, setTests] = useState<TrialTest[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BankPlacementTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    sort_order: 0,
    expected_tasks_count: 40,
  });
  const [editingTestId, setEditingTestId] = useState<number | null>(null);
  const [editTestForm, setEditTestForm] = useState({
    title: "",
    description: "",
    sort_order: 0,
    expected_tasks_count: 40,
  });

  const [showBankPicker, setShowBankPicker] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankDifficulty, setBankDifficulty] = useState<BankDifficulty | "">("");
  const [bankItems, setBankItems] = useState<BankTask[]>([]);
  const [selectedBankTaskIds, setSelectedBankTaskIds] = useState<number[]>([]);

  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [slotForm, setSlotForm] = useState<SlotForm>(emptySlotForm());

  const [currentSlotIndex, setCurrentSlotIndex] = useState(1);
  const [previewAnswers, setPreviewAnswers] = useState<Record<number, string>>({});
  const latestSelectedTestIdRef = useRef<number | null>(null);

  const selectedTest = tests.find((t) => t.id === selectedTestId) || null;
  const slotCount = Math.max(1, selectedTest?.expected_tasks_count || 40);

  const slotMap = useMemo(() => {
    const map = new Map<number, BankPlacementTask>();
    for (const task of tasks) map.set((task.sort_order || 0) + 1, task);
    return map;
  }, [tasks]);

  const currentPlacement = selectedTest ? slotMap.get(currentSlotIndex) || null : null;

  const clearPreviewAnswerForSlot = useCallback((slotIndex: number) => {
    setPreviewAnswers((prev) => {
      if (!(slotIndex in prev)) return prev;
      const next = { ...prev };
      delete next[slotIndex];
      return next;
    });
  }, []);

  const fetchTests = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    const { data, error: err } = await getAdminTrialTests(email);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setTests(data || []);
  }, [email]);

  const fetchTasks = useCallback(
    async (testId: number) => {
      if (!email) return;
      const { data, error: err } = await getAdminTrialTestTasks(testId, email);
      if (latestSelectedTestIdRef.current !== testId) return;
      if (err) {
        setError(err);
        return;
      }
      setTasks(data || []);
    },
    [email]
  );

  const fetchBank = useCallback(async () => {
    if (!email || !showBankPicker) return;
    const { data, error: err } = await getAdminBankTasks(email, {
      search: bankSearch,
      difficulty: bankDifficulty,
      limit: 20,
      offset: 0,
    });
    if (err) {
      setError(err);
      return;
    }
    setBankItems(data?.items || []);
  }, [email, showBankPicker, bankSearch, bankDifficulty]);

  useEffect(() => {
    if (email) void fetchTests();
  }, [email, fetchTests]);

  useEffect(() => {
    latestSelectedTestIdRef.current = selectedTestId;
    if (selectedTestId) {
      setTasks([]);
      void fetchTasks(selectedTestId);
    } else {
      setTasks([]);
    }
  }, [selectedTestId, fetchTasks]);

  useEffect(() => {
    if (showBankPicker) void fetchBank();
  }, [showBankPicker, fetchBank]);

  useEffect(() => {
    setCurrentSlotIndex(1);
    setPreviewAnswers({});
    setActiveSlot(null);
    setShowBankPicker(false);
    setSelectedBankTaskIds([]);
    setShowInlineCreate(false);
  }, [selectedTestId]);

  useEffect(() => {
    setCurrentSlotIndex((prev) => Math.min(Math.max(prev, 1), slotCount));
  }, [slotCount]);

  const onCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const { error: err } = await createTrialTest(
      createForm.title,
      createForm.description || null,
      createForm.sort_order,
      createForm.expected_tasks_count,
      email
    );
    if (err) {
      setError(err);
      return;
    }
    setCreateForm({ title: "", description: "", sort_order: 0, expected_tasks_count: 40 });
    await fetchTests();
  };

  const onDeleteTest = async (testId: number) => {
    if (!email) return;
    if (!confirm("Бұл тестті жойғыңыз келе ме?")) return;
    const { error: err } = await deleteTrialTest(testId, email);
    if (err) {
      setError(err);
      return;
    }
    if (selectedTestId === testId) setSelectedTestId(null);
    if (editingTestId === testId) {
      setEditingTestId(null);
      setEditTestForm({ title: "", description: "", sort_order: 0, expected_tasks_count: 40 });
    }
    await fetchTests();
  };

  const startEditTest = (test: TrialTest) => {
    setEditingTestId(test.id);
    setEditTestForm({
      title: test.title || "",
      description: test.description || "",
      sort_order: test.sort_order || 0,
      expected_tasks_count: test.expected_tasks_count || 40,
    });
  };

  const cancelEditTest = () => {
    setEditingTestId(null);
    setEditTestForm({ title: "", description: "", sort_order: 0, expected_tasks_count: 40 });
  };

  const onUpdateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !editingTestId) return;
    const { error: err } = await updateTrialTest(
      editingTestId,
      editTestForm.title,
      editTestForm.description,
      editTestForm.sort_order,
      editTestForm.expected_tasks_count,
      email
    );
    if (err) {
      setError(err);
      return;
    }
    await fetchTests();
    cancelEditTest();
  };

  const onAssignBankTask = async (bankTaskId: number) => {
    if (!email || !selectedTestId || !activeSlot) return;
    const { error: err } = await upsertTrialTestSlot(selectedTestId, activeSlot, {
      email,
      bank_task_id: bankTaskId,
    });
    if (err) {
      setError(err);
      return;
    }
    clearPreviewAnswerForSlot(activeSlot);
    await fetchTasks(selectedTestId);
    setShowBankPicker(false);
    setActiveSlot(null);
    setSelectedBankTaskIds([]);
  };

  const toggleBankTaskSelection = (bankTaskId: number) => {
    setSelectedBankTaskIds((prev) =>
      prev.includes(bankTaskId) ? prev.filter((id) => id !== bankTaskId) : [...prev, bankTaskId]
    );
  };

  const onAssignSelectedBankTasks = async () => {
    if (!email || !selectedTestId || !activeSlot || selectedBankTaskIds.length === 0) return;

    const targetSlots: number[] = [];
    for (let slotIndex = activeSlot; slotIndex <= slotCount && targetSlots.length < selectedBankTaskIds.length; slotIndex += 1) {
      if (slotMap.has(slotIndex)) continue;
      targetSlots.push(slotIndex);
    }

    if (targetSlots.length < selectedBankTaskIds.length) {
      setError("Таңдалған тапсырмаларға бос ұяшық жеткіліксіз. Ағымдағы ұяшықтан кейінгі бос ұяшықтарды тазалаңыз.");
      return;
    }

    for (let index = 0; index < selectedBankTaskIds.length; index += 1) {
      const { error: err } = await upsertTrialTestSlot(selectedTestId, targetSlots[index], {
        email,
        bank_task_id: selectedBankTaskIds[index],
      });
      if (err) {
        setError(err);
        return;
      }
    }

    targetSlots.forEach((slotIndex) => clearPreviewAnswerForSlot(slotIndex));
    await fetchTasks(selectedTestId);
    setShowBankPicker(false);
    setActiveSlot(null);
    setSelectedBankTaskIds([]);
  };

  const onSaveInlineSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !selectedTestId || !activeSlot) return;
    const { error: err } = await upsertTrialTestSlot(selectedTestId, activeSlot, {
      email,
      ...buildSlotPayload(slotForm),
    });
    if (err) {
      setError(err);
      return;
    }
    clearPreviewAnswerForSlot(activeSlot);
    await fetchTasks(selectedTestId);
    setShowInlineCreate(false);
    setActiveSlot(null);
    setSlotForm(emptySlotForm());
  };

  const onClearSlot = async (slotIndex: number) => {
    if (!email || !selectedTestId) return;
    const { error: err } = await clearTrialTestSlot(selectedTestId, slotIndex, email);
    if (err) {
      setError(err);
      return;
    }
    clearPreviewAnswerForSlot(slotIndex);
    await fetchTasks(selectedTestId);
  };

  const openBankForCurrentSlot = () => {
    setActiveSlot(currentSlotIndex);
    setShowInlineCreate(false);
    setSelectedBankTaskIds([]);
    setShowBankPicker(true);
  };

  const openInlineCreateForCurrentSlot = () => {
    setActiveSlot(currentSlotIndex);
    setShowBankPicker(false);
    setSelectedBankTaskIds([]);
    setSlotForm(emptySlotForm());
    setShowInlineCreate(true);
  };

  const setPreviewAnswer = (slotIndex: number, value: string) => {
    setPreviewAnswers((prev) => ({ ...prev, [slotIndex]: value }));
  };

  const slotAnswered = (slotIndex: number) => {
    const value = previewAnswers[slotIndex];
    if (!value) return false;
    const placement = slotMap.get(slotIndex) || null;
    const questionType = getPlacementQuestionType(placement);
    if (questionType === "select") return isSelectAnswerComplete(value);
    if (questionType === "factor_grid") return isFactorGridAnswerComplete(value);
    return value.trim().length > 0;
  };

  const renderCurrentSlotControls = () => {
    if (!currentPlacement) return null;

    const questionType = getPlacementQuestionType(currentPlacement);
    const options = getPlacementOptions(currentPlacement);
    const subquestions = getPlacementSubquestions(currentPlacement);
    const value = previewAnswers[currentSlotIndex] || "";

    if (questionType === "tf") {
      const isTrue = value === "true" || value === "1";
      const isFalse = value === "false" || value === "0";
      return (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPreviewAnswer(currentSlotIndex, "true")}
            className={`font-semibold py-2 px-3 rounded-lg border transition-colors ${
              isTrue
                ? "bg-purple-600 border-purple-700 text-white"
                : "bg-green-600 border-green-700 text-white hover:bg-green-700"
            }`}
          >
            Шын
          </button>
          <button
            type="button"
            onClick={() => setPreviewAnswer(currentSlotIndex, "false")}
            className={`font-semibold py-2 px-3 rounded-lg border transition-colors ${
              isFalse
                ? "bg-purple-600 border-purple-700 text-white"
                : "bg-red-600 border-red-700 text-white hover:bg-red-700"
            }`}
          >
            Жалған
          </button>
        </div>
      );
    }

    if (questionType === "select") {
      const selected = parseSelectAnswer(value);
      const subLabels = ["A", "B"];
      return (
        <div className="space-y-3">
          {[0, 1].map((subIndex) => {
            const subText = subquestions[subIndex]?.text || `${subIndex + 1}-қосымша сұрақ`;
            return (
              <div key={`slot-${currentSlotIndex}-sub-${subIndex}`} className="space-y-2">
                <div className="font-semibold text-gray-800">{subLabels[subIndex]})</div>
                <div className="text-gray-900">
                  <MathRender latex={subText} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {options.map((option, optionIndex) => {
                    const label = String(option?.label || "");
                    const isSelected = selected[subIndex] === label;
                    return (
                      <button
                        key={`slot-${currentSlotIndex}-sub-${subIndex}-option-${optionIndex}`}
                        type="button"
                        onClick={() => {
                          const next = [...selected] as [string, string];
                          next[subIndex] = label;
                          setPreviewAnswer(currentSlotIndex, JSON.stringify(next));
                        }}
                        className={`text-left border rounded-lg p-2 transition-colors ${
                          isSelected
                            ? "bg-purple-600 border-purple-700 text-white"
                            : "bg-white border-gray-300 text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                        }`}
                      >
                        <div className="font-bold">{label || `#${optionIndex + 1}`}</div>
                        <div className={isSelected ? "text-white" : "text-gray-700"}>
                          <MathRender inline latex={String(option?.text || "")} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (questionType === "mcq" || questionType === "mcq6") {
      return (
        <div className="grid grid-cols-1 gap-2">
          {options.map((option, optionIndex) => {
            const label = String(option?.label || "");
            const isSelected = value === label;
            return (
              <button
                key={`slot-${currentSlotIndex}-option-${optionIndex}`}
                type="button"
                onClick={() => setPreviewAnswer(currentSlotIndex, label)}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  isSelected
                    ? "bg-purple-600 border-purple-700 text-white"
                    : "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                }`}
              >
                <div className={`font-bold ${isSelected ? "text-white" : "text-gray-900"}`}>{label}</div>
                <div className={isSelected ? "text-white" : "text-gray-700"}>
                  <MathRender inline latex={String(option?.text || "")} />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (questionType === "factor_grid") {
      const cells = parseFactorGridAnswer(value);
      const labels = ["ax² #1", "c #1", "ax² #2", "c #2"];
      return (
        <div className="grid grid-cols-2 gap-3">
          {cells.map((cell, idx) => (
            <div key={`slot-${currentSlotIndex}-factor-${idx}`} className="space-y-1">
              <div className="text-xs font-semibold text-gray-600">{labels[idx]}</div>
              <MathFieldInput
                value={cell}
                onChange={(nextValue) => {
                  const next = [...cells] as typeof cells;
                  next[idx] = nextValue;
                  setPreviewAnswer(currentSlotIndex, serializeFactorGridAnswer(next));
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                placeholder="Жауап"
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <input
        value={value}
        onChange={(e) => setPreviewAnswer(currentSlotIndex, e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400"
        placeholder="Жауапты енгізіңіз"
      />
    );
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
        <div className="text-xl">Қолжетім жоқ</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <DesktopNav />
      <MobileNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-white">Сынақ тесттері (ұяшықтар)</h1>
              <Link href="/admin/bank" className="px-3 py-2 rounded-lg bg-white/20 text-white border border-white/40 text-sm">
                БАНК
              </Link>
            </div>
            {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="space-y-3">
                <form onSubmit={onCreateTest} className="bg-white/80 rounded-xl border border-white/40 p-3 space-y-2">
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Атауы"
                    value={createForm.title}
                    onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                    required
                  />
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[70px]"
                    placeholder="Сипаттамасы"
                    value={createForm.description}
                    onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={createForm.sort_order}
                      onChange={(e) => setCreateForm((p) => ({ ...p, sort_order: Number(e.target.value || 0) }))}
                    />
                    <input
                      type="number"
                      min={1}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={createForm.expected_tasks_count}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          expected_tasks_count: Math.max(1, Number(e.target.value || 40)),
                        }))
                      }
                    />
                  </div>
                  <button className="w-full rounded-lg bg-green-600 text-white py-2 text-sm">Құру</button>
                </form>

                {editingTestId && (
                  <form onSubmit={onUpdateTest} className="bg-white/80 rounded-xl border border-blue-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-gray-900">Тестті өңдеу</h3>
                      <button
                        type="button"
                        onClick={cancelEditTest}
                        className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700"
                      >
                        Бас тарту
                      </button>
                    </div>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Атауы"
                      value={editTestForm.title}
                      onChange={(e) => setEditTestForm((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[70px]"
                      placeholder="Сипаттамасы"
                      value={editTestForm.description}
                      onChange={(e) => setEditTestForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={editTestForm.sort_order}
                        onChange={(e) =>
                          setEditTestForm((prev) => ({ ...prev, sort_order: Number(e.target.value || 0) }))
                        }
                      />
                      <input
                        type="number"
                        min={1}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={editTestForm.expected_tasks_count}
                        onChange={(e) =>
                          setEditTestForm((prev) => ({
                            ...prev,
                            expected_tasks_count: Math.max(1, Number(e.target.value || 40)),
                          }))
                        }
                      />
                    </div>
                    <button className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm">Сақтау</button>
                  </form>
                )}

                <div className="bg-white/80 rounded-xl border border-white/40 p-3 max-h-[620px] overflow-auto space-y-2">
                  {loading ? (
                    <p className="text-sm text-gray-600">Жүктелуде...</p>
                  ) : (
                    tests.map((test) => (
                      <div
                        key={test.id}
                        className={`rounded-lg border p-2 ${
                          selectedTestId === test.id ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white"
                        }`}
                      >
                        <button className="w-full text-left" onClick={() => setSelectedTestId(test.id)}>
                          <div className="font-semibold text-sm">{test.title}</div>
                          <div className="text-xs text-gray-500">
                            Ұяшықтар: {test.expected_tasks_count || 40} • тапсырмалар: {test.task_count || 0}
                          </div>
                        </button>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-blue-700 border border-blue-300 rounded px-2 py-1"
                            onClick={() => startEditTest(test)}
                          >
                            Өңдеу
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-700 border border-red-300 rounded px-2 py-1"
                            onClick={() => void onDeleteTest(test.id)}
                          >
                            Жою
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="xl:col-span-2 bg-white/80 rounded-xl border border-white/40 p-4">
                {!selectedTest ? (
                  <p className="text-sm text-gray-600">Тестті таңдаңыз</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{selectedTest.title}</h2>
                        {selectedTest.description && (
                          <p className="text-sm text-gray-600 mt-1">{selectedTest.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-600">Тапсырма</div>
                        <div className="text-xl font-bold text-gray-900">
                          {currentSlotIndex} / {slotCount}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {Array.from({ length: slotCount }, (_, i) => i + 1).map((slotIndex) => {
                        const isCurrent = slotIndex === currentSlotIndex;
                        const isAnswered = slotAnswered(slotIndex);
                        return (
                          <button
                            key={`slot-nav-${slotIndex}`}
                            type="button"
                            onClick={() => setCurrentSlotIndex(slotIndex)}
                            className={`shrink-0 w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${
                              isCurrent
                                ? "bg-purple-600 border-purple-700 text-white"
                                : isAnswered
                                ? "bg-green-100 border-green-300 text-green-700"
                                : "bg-white border-gray-300 text-gray-700 hover:border-purple-400"
                            }`}
                          >
                            {slotIndex}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentSlotIndex((prev) => Math.max(1, prev - 1))}
                        disabled={currentSlotIndex === 1}
                        className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:text-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                      >
                        Алдыңғы
                      </button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white hover:bg-gray-50"
                          onClick={openBankForCurrentSlot}
                        >
                          Банктен
                        </button>
                        <button
                          type="button"
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white hover:bg-gray-50"
                          onClick={openInlineCreateForCurrentSlot}
                        >
                          Жаңа тапсырма
                        </button>
                        {currentPlacement && (
                          <button
                            type="button"
                            className="text-sm border border-red-300 text-red-700 rounded px-3 py-2 bg-white hover:bg-red-50"
                            onClick={() => void onClearSlot(currentSlotIndex)}
                          >
                            Ұяшықты тазалау
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCurrentSlotIndex((prev) => Math.min(slotCount, prev + 1))}
                          disabled={currentSlotIndex === slotCount}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg"
                        >
                          Келесі
                        </button>
                      </div>
                    </div>

                    <div
                      key={`slot-view-${currentSlotIndex}-${currentPlacement?.id ?? "empty"}`}
                      className="glass rounded-2xl p-4 border border-white/40"
                    >
                      {currentPlacement ? (
                        <div className="space-y-4">
                          <div className="text-xs text-gray-500">
                            Ұяшық {currentSlotIndex} • банк #{currentPlacement.bank_task_id || "-"} • {getPlacementQuestionType(currentPlacement)}
                          </div>
                          <div className={`font-semibold text-gray-900 ${getTaskTextScaleClass(getPlacementTextScale(currentPlacement))}`}>
                            {getPlacementText(currentPlacement) ? (
                              <MathRender latex={getPlacementText(currentPlacement)} />
                            ) : (
                              "Тапсырма мәтіні бос"
                            )}
                          </div>

                          {getPlacementImageFilename(currentPlacement) && (
                            <Image
                              src={apiPath(`images/${getPlacementImageFilename(currentPlacement)}`)}
                              alt="Тапсырма"
                              width={1280}
                              height={720}
                              unoptimized
                              className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200"
                            />
                          )}

                          {renderCurrentSlotControls()}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4">
                          <div className="font-semibold text-gray-900">Бос ұяшық</div>
                          <p className="text-sm text-gray-600 mt-1">
                            Осы ұяшық үшін банктен тапсырма таңдаңыз немесе жаңасын жасаңыз.
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {showBankPicker && selectedTestId && activeSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 p-4 overflow-auto">
          <div className="max-w-3xl mx-auto bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">БАНК • ұяшық {activeSlot}</h3>
              <button
                className="text-sm"
                onClick={() => {
                  setShowBankPicker(false);
                  setSelectedBankTaskIds([]);
                }}
              >
                Жабу
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input
                className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Іздеу"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
              />
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={bankDifficulty}
                onChange={(e) => setBankDifficulty(e.target.value as BankDifficulty | "")}
              >
                <option value="">Барлығы</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
            <button className="mb-3 text-sm border border-gray-300 rounded px-3 py-1" onClick={() => void fetchBank()}>
              Іздеу
            </button>
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-700">
                  Таңдалды: <span className="font-semibold">{selectedBankTaskIds.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBankTaskIds([])}
                    disabled={selectedBankTaskIds.length === 0}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
                  >
                    Таңдауды тазалау
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAssignSelectedBankTasks()}
                    disabled={selectedBankTaskIds.length === 0}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-300"
                  >
                    Таңдалғанды қосу
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Пакетпен қосу ағымдағы ұяшықтан бастап тек бос ұяшықтарды ретімен толтырады.
              </div>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {bankItems.map((task) => (
                <div key={task.id} className="rounded-lg border border-gray-200 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-500">#{task.id}</div>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedBankTaskIds.includes(task.id)}
                        onChange={() => toggleBankTaskSelection(task.id)}
                      />
                      Таңдау
                    </label>
                  </div>
                  <div className={`mb-2 ${getTaskTextScaleClass(normalizeTaskTextScale(task.text_scale))}`}><MathRender latex={task.text || ""} /></div>
                  <button
                    className="text-xs bg-green-600 text-white rounded px-2 py-1"
                    onClick={() => void onAssignBankTask(task.id)}
                  >
                    Осы ұяшыққа
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showInlineCreate && selectedTestId && activeSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 p-4 overflow-auto">
          <div className="max-w-3xl mx-auto bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Жаңа тапсырма • ұяшық {activeSlot}</h3>
              <button className="text-sm" onClick={() => setShowInlineCreate(false)}>Жабу</button>
            </div>
            <form onSubmit={onSaveInlineSlot} className="space-y-3">
              <MathFieldInput value={slotForm.text} onChange={(v) => setSlotForm((p) => ({ ...p, text: v }))} placeholder="Тапсырма мәтіні" />
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Мәтін өлшемі</label>
                <div className="flex gap-2">
                  {[
                    { label: "S", value: "sm" },
                    { label: "M", value: "md" },
                    { label: "L", value: "lg" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSlotForm((p) => ({ ...p, text_scale: item.value as TaskTextScale }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        slotForm.text_scale === item.value
                          ? "border-purple-600 bg-purple-600 text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.question_type} onChange={(e) => setSlotForm((p) => ({ ...p, question_type: e.target.value as QuestionType }))}>
                  <option value="mcq">MCQ(4)</option><option value="mcq6">MCQ(6)</option><option value="input">Енгізу</option><option value="tf">Ш/Ж</option><option value="select">Сәйкестендіру</option><option value="factor_grid">Factor Grid</option>
                </select>
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.difficulty} onChange={(e) => setSlotForm((p) => ({ ...p, difficulty: e.target.value as BankDifficulty }))}>
                  <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                </select>
                <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Тақырыптар (үтір арқылы)" value={slotForm.topicsRaw} onChange={(e) => setSlotForm((p) => ({ ...p, topicsRaw: e.target.value }))} />
              </div>

              {(slotForm.question_type === "mcq" || slotForm.question_type === "mcq6" || slotForm.question_type === "select") && (
                <div className="grid grid-cols-2 gap-2">
                  <MathFieldInput value={slotForm.optionA} onChange={(v) => setSlotForm((p) => ({ ...p, optionA: v }))} placeholder="A" />
                  <MathFieldInput value={slotForm.optionB} onChange={(v) => setSlotForm((p) => ({ ...p, optionB: v }))} placeholder="B" />
                  <MathFieldInput value={slotForm.optionC} onChange={(v) => setSlotForm((p) => ({ ...p, optionC: v }))} placeholder="C" />
                  <MathFieldInput value={slotForm.optionD} onChange={(v) => setSlotForm((p) => ({ ...p, optionD: v }))} placeholder="D" />
                  {slotForm.question_type === "mcq6" && <MathFieldInput value={slotForm.optionE} onChange={(v) => setSlotForm((p) => ({ ...p, optionE: v }))} placeholder="E" />}
                  {slotForm.question_type === "mcq6" && <MathFieldInput value={slotForm.optionF} onChange={(v) => setSlotForm((p) => ({ ...p, optionF: v }))} placeholder="F" />}
                </div>
              )}

              {slotForm.question_type === "input" && <MathFieldInput value={slotForm.answer} onChange={(v) => setSlotForm((p) => ({ ...p, answer: v }))} placeholder="Дұрыс жауап" />}
              {slotForm.question_type === "factor_grid" && (
                <div className="grid grid-cols-2 gap-2">
                  <MathFieldInput value={slotForm.factorTopLeft} onChange={(v) => setSlotForm((p) => ({ ...p, factorTopLeft: v }))} placeholder="ax² #1" />
                  <MathFieldInput value={slotForm.factorTopRight} onChange={(v) => setSlotForm((p) => ({ ...p, factorTopRight: v }))} placeholder="c #1" />
                  <MathFieldInput value={slotForm.factorBottomLeft} onChange={(v) => setSlotForm((p) => ({ ...p, factorBottomLeft: v }))} placeholder="ax² #2" />
                  <MathFieldInput value={slotForm.factorBottomRight} onChange={(v) => setSlotForm((p) => ({ ...p, factorBottomRight: v }))} placeholder="c #2" />
                </div>
              )}
              {slotForm.question_type === "tf" && (
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.correctTf} onChange={(e) => setSlotForm((p) => ({ ...p, correctTf: e.target.value as "true" | "false" }))}>
                  <option value="true">Шын</option><option value="false">Жалған</option>
                </select>
              )}
              {(slotForm.question_type === "mcq" || slotForm.question_type === "mcq6") && (
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.correctOption} onChange={(e) => setSlotForm((p) => ({ ...p, correctOption: e.target.value as SlotForm["correctOption"] }))}>
                  <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                  {slotForm.question_type === "mcq6" && <option value="E">E</option>}
                  {slotForm.question_type === "mcq6" && <option value="F">F</option>}
                </select>
              )}
              {slotForm.question_type === "select" && (
                <div className="grid grid-cols-2 gap-2">
                  <MathFieldInput value={slotForm.subQuestion1} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion1: v }))} placeholder="1-қосымша сұрақ" />
                  <MathFieldInput value={slotForm.subQuestion2} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion2: v }))} placeholder="2-қосымша сұрақ" />
                </div>
              )}
              <button className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm">Сақтау</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
