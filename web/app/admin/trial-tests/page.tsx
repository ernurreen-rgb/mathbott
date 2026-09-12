"use client";
import BankPickerDialog from "./_components/BankPickerDialog";
import CurrentSlotControls from "./_components/CurrentSlotControls";
import InlineTaskDialog from "./_components/InlineTaskDialog";
import { SlotForm, buildSlotPayload, buildSlotPreviewTask, emptySlotForm, getPlacementImageFilename, getPlacementQuestionType, getPlacementText, getPlacementTextScale, isSelectAnswerComplete } from "./_components/model";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import {
  apiPath,
  clearTrialTestSlot,
  createTrialTest,
  deleteTrialTest,
  getAdminBankTasks,
  getAdminTrialTestTasks,
  getAdminTrialTests,
  updateTrialTest,
  upsertTrialTestSlot,
} from "@/lib/api";
import { getTaskTextScaleClass } from "@/lib/task-text-scale";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { BankDifficulty, BankPlacementTask, BankTask, TrialTest } from "@/types";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [bankTotal, setBankTotal] = useState(0);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSelectAllLoading, setBankSelectAllLoading] = useState(false);
  const [bankAssigningSelected, setBankAssigningSelected] = useState(false);
  const [selectedBankTaskIds, setSelectedBankTaskIds] = useState<number[]>([]);

  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [slotForm, setSlotForm] = useState<SlotForm>(emptySlotForm());
  const slotPreviewTask = useMemo(() => buildSlotPreviewTask(slotForm), [slotForm]);

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

  const assignedBankTaskIds = useMemo(() => {
    const ids = new Set<number>();
    for (const task of tasks) {
      if (typeof task.bank_task_id === "number") ids.add(task.bank_task_id);
    }
    return ids;
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
    setBankLoading(true);
    const { data, error: err } = await getAdminBankTasks(email, {
      search: bankSearch,
      difficulty: bankDifficulty,
      limit: 20,
      offset: 0,
    });
    setBankLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setBankItems(data?.items || []);
    setBankTotal(data?.total || 0);
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
    setBankItems([]);
    setBankTotal(0);
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
    if (assignedBankTaskIds.has(bankTaskId)) return;
    setSelectedBankTaskIds((prev) =>
      prev.includes(bankTaskId) ? prev.filter((id) => id !== bankTaskId) : [...prev, bankTaskId]
    );
  };

  const onSelectAllBankTasks = async () => {
    if (!email) return;

    setBankSelectAllLoading(true);
    setError(null);

    const limit = 100;
    let offset = 0;
    const selectedIds: number[] = [];
    const seenIds = new Set<number>();

    while (true) {
      const { data, error: err } = await getAdminBankTasks(email, {
        search: bankSearch,
        difficulty: bankDifficulty,
        limit,
        offset,
      });

      if (err || !data) {
        setError(err || "Банк тапсырмаларын жүктеу қатесі");
        setBankSelectAllLoading(false);
        return;
      }

      if (offset === 0) {
        setBankItems(data.items || []);
        setBankTotal(data.total || 0);
      }

      for (const task of data.items || []) {
        if (assignedBankTaskIds.has(task.id) || seenIds.has(task.id)) continue;
        seenIds.add(task.id);
        selectedIds.push(task.id);
      }

      if (!data.has_more || data.items.length === 0) break;
      offset += limit;
    }

    setSelectedBankTaskIds(selectedIds);
    setBankSelectAllLoading(false);
  };

  const onAssignSelectedBankTasks = async () => {
    if (!email || !selectedTestId || !activeSlot || selectedBankTaskIds.length === 0) return;
    const bankTaskIdsToAssign = Array.from(new Set(selectedBankTaskIds))
      .filter((id) => !assignedBankTaskIds.has(id))
      .reverse();
    if (bankTaskIdsToAssign.length === 0) {
      setError("Таңдалған тапсырмалар бұл тестте бұрыннан бар.");
      return;
    }

    const targetSlots: number[] = [];
    for (let slotIndex = activeSlot; slotIndex <= slotCount && targetSlots.length < bankTaskIdsToAssign.length; slotIndex += 1) {
      if (slotMap.has(slotIndex)) continue;
      targetSlots.push(slotIndex);
    }

    if (targetSlots.length < bankTaskIdsToAssign.length) {
      setError("Таңдалған тапсырмаларға бос ұяшық жеткіліксіз. Ағымдағы ұяшықтан кейінгі бос ұяшықтарды тазалаңыз.");
      return;
    }

    setBankAssigningSelected(true);
    for (let index = 0; index < bankTaskIdsToAssign.length; index += 1) {
      const { error: err } = await upsertTrialTestSlot(selectedTestId, targetSlots[index], {
        email,
        bank_task_id: bankTaskIdsToAssign[index],
      });
      if (err) {
        setError(err);
        setBankAssigningSelected(false);
        return;
      }
    }

    targetSlots.forEach((slotIndex) => clearPreviewAnswerForSlot(slotIndex));
    await fetchTasks(selectedTestId);
    setBankAssigningSelected(false);
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
    return value.trim().length > 0;
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
                        className={`rounded-lg border p-2 ${selectedTestId === test.id ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white"
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
                            className={`shrink-0 w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${isCurrent
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

                          <CurrentSlotControls
                            currentPlacement={currentPlacement}
                            previewAnswers={previewAnswers}
                            currentSlotIndex={currentSlotIndex}
                            setPreviewAnswer={setPreviewAnswer}
                          />
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

      <BankPickerDialog
        showBankPicker={showBankPicker}
        selectedTestId={selectedTestId}
        activeSlot={activeSlot}
        setShowBankPicker={setShowBankPicker}
        setSelectedBankTaskIds={setSelectedBankTaskIds}
        bankSearch={bankSearch}
        setBankSearch={setBankSearch}
        bankDifficulty={bankDifficulty}
        setBankDifficulty={setBankDifficulty}
        fetchBank={fetchBank}
        bankLoading={bankLoading}
        selectedBankTaskIds={selectedBankTaskIds}
        bankItems={bankItems}
        bankTotal={bankTotal}
        onSelectAllBankTasks={onSelectAllBankTasks}
        bankSelectAllLoading={bankSelectAllLoading}
        bankAssigningSelected={bankAssigningSelected}
        onAssignSelectedBankTasks={onAssignSelectedBankTasks}
        assignedBankTaskIds={assignedBankTaskIds}
        toggleBankTaskSelection={toggleBankTaskSelection}
        onAssignBankTask={onAssignBankTask}
      />

      <InlineTaskDialog
        showInlineCreate={showInlineCreate}
        selectedTestId={selectedTestId}
        activeSlot={activeSlot}
        setShowInlineCreate={setShowInlineCreate}
        onSaveInlineSlot={onSaveInlineSlot}
        slotForm={slotForm}
        setSlotForm={setSlotForm}
        slotPreviewTask={slotPreviewTask}
      />
    </div>
  );
}
