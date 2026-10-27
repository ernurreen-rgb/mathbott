"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearTrialTestSlot, getAdminBankTasks, getAdminTrialTestTasks, upsertTrialTestSlot } from "@/lib/api";
import type { BankDifficulty, BankPlacementTask, BankTask } from "@/types";
import { buildSlotPayload, buildSlotPreviewTask, emptySlotForm, getPlacementQuestionType, isSelectAnswerComplete, type SlotForm } from "./model";
import { useTrialTests } from "./TrialTestsProvider";

export function useTrialTaskEditor(selectedTestId: number, slotCount: number) {
  const { email, readTasks, writeTasks } = useTrialTests();
  const [tasks, setTasks] = useState<BankPlacementTask[]>(() => readTasks(selectedTestId) || []);
  const [loading, setLoading] = useState(() => readTasks(selectedTestId) === undefined);
  const [ready, setReady] = useState(() => readTasks(selectedTestId) !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(1);
  const [previewAnswers, setPreviewAnswers] = useState<Record<number, string>>({});
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankDifficulty, setBankDifficulty] = useState<BankDifficulty | "">("");
  const [bankItems, setBankItems] = useState<BankTask[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankOffset, setBankOffset] = useState(0);
  const [bankSelectAllLoading, setBankSelectAllLoading] = useState(false);
  const [bankAssigningSelected, setBankAssigningSelected] = useState(false);
  const [selectedBankTaskIds, setSelectedBankTaskIds] = useState<number[]>([]);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [slotForm, setSlotForm] = useState<SlotForm>(emptySlotForm());
  const slotPreviewTask = useMemo(() => buildSlotPreviewTask(slotForm), [slotForm]);
  const version = useRef({ tasks: 0, bank: 0 });
  const mutationLock = useRef(false);
  const [busy, setBusy] = useState(false);

  const slotMap = useMemo(() => new Map(tasks.map((task) => [(task.sort_order || 0) + 1, task])), [tasks]);
  const assignedBankTaskIds = useMemo(() => new Set(tasks.flatMap((task) => typeof task.bank_task_id === "number" ? [task.bank_task_id] : [])), [tasks]);
  const currentPlacement = slotMap.get(currentSlotIndex) || null;
  const clearPreviewAnswerForSlot = useCallback((slotIndex: number) => {
    setPreviewAnswers((previous) => { const next = { ...previous }; delete next[slotIndex]; return next; });
  }, []);

  const fetchTasks = useCallback(async (testId: number) => {
    if (!email) return;
    const request = ++version.current.tasks;
    try {
      const result = await getAdminTrialTestTasks(testId, email);
      if (request !== version.current.tasks) return;
      if (result.error) setError(result.error);
      else { setTasks(result.data || []); writeTasks(testId, result.data || []); setReady(true); }
    } catch { if (request === version.current.tasks) setError("Тапсырмаларды жүктеу мүмкін болмады."); }
    finally { if (request === version.current.tasks) setLoading(false); }
  }, [email, writeTasks]);

  useEffect(() => {
    const requests = version.current;
    void fetchTasks(selectedTestId);
    return () => { requests.tasks += 1; requests.bank += 1; };
  }, [selectedTestId, fetchTasks]);
  useEffect(() => { setCurrentSlotIndex((slot) => Math.min(slot, slotCount)); }, [slotCount]);

  const fetchBank = useCallback(async () => {
    if (!email || !showBankPicker) return;
    const request = ++version.current.bank;
    setBankLoading(true);
    try {
      const result = await getAdminBankTasks(email, { search: bankSearch, difficulty: bankDifficulty, limit: 20, offset: bankOffset });
      if (request !== version.current.bank) return;
      if (result.error) { setError(result.error); setBankItems([]); setBankTotal(0); }
      else { setBankItems(result.data?.items || []); setBankTotal(result.data?.total || 0); }
    } catch { if (request === version.current.bank) { setError("Банк тапсырмаларын жүктеу мүмкін болмады."); setBankItems([]); setBankTotal(0); } }
    finally { if (request === version.current.bank) setBankLoading(false); }
  }, [email, showBankPicker, bankSearch, bankDifficulty, bankOffset]);
  useEffect(() => { setBankOffset(0); }, [bankSearch, bankDifficulty]);
  useEffect(() => {
    const requests = version.current;
    void fetchBank();
    return () => { requests.bank += 1; };
  }, [fetchBank]);

  const assignBankTask = async (bankTaskId: number) => {
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

  const selectAllBankTasks = async () => {
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

  const assignSelectedBankTasks = async () => {
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
        await fetchTasks(selectedTestId);
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

  const saveInlineSlot = async (e: React.FormEvent) => {
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

  const clearSlot = async (slotIndex: number) => {
    if (!email || !selectedTestId) return;
    const { error: err } = await clearTrialTestSlot(selectedTestId, slotIndex, email);
    if (err) {
      setError(err);
      return;
    }
    clearPreviewAnswerForSlot(slotIndex);
    await fetchTasks(selectedTestId);
  };

  const openBankForCurrentSlot = (slotIndex = currentSlotIndex) => {
    setError(null);
    setBankOffset(0);
    setActiveSlot(slotIndex);
    setShowInlineCreate(false);
    setSelectedBankTaskIds([]);
    setShowBankPicker(true);
  };

  const openInlineCreateForCurrentSlot = (slotIndex = currentSlotIndex) => {
    setError(null);
    setActiveSlot(slotIndex);
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

  const mutate = async (action: () => Promise<void>) => {
    if (mutationLock.current || !ready) return;
    mutationLock.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch { setError("Өзгерісті сақтау мүмкін болмады. Қайта көріңіз."); }
    finally {
      mutationLock.current = false; setBusy(false);
      setBankAssigningSelected(false); setBankSelectAllLoading(false);
    }
  };
  const onAssignBankTask = (id: number) => mutate(() => assignBankTask(id));
  const onSelectAllBankTasks = () => mutate(selectAllBankTasks);
  const onAssignSelectedBankTasks = () => mutate(assignSelectedBankTasks);
  const onSaveInlineSlot = (event: React.FormEvent) => { event.preventDefault(); return mutate(() => saveInlineSlot(event)); };
  const onClearSlot = (slot: number) => mutate(() => clearSlot(slot));

  return { tasks, loading, ready, error, setError, busy, fetchTasks, currentSlotIndex, setCurrentSlotIndex,
    slotMap, currentPlacement, slotAnswered, previewAnswers, setPreviewAnswer,
    showBankPicker, setShowBankPicker, activeSlot, bankSearch, setBankSearch, bankDifficulty, setBankDifficulty,
    bankItems, bankTotal, bankLoading, bankOffset, setBankOffset, fetchBank, bankSelectAllLoading, bankAssigningSelected,
    selectedBankTaskIds, setSelectedBankTaskIds, assignedBankTaskIds, toggleBankTaskSelection,
    onSelectAllBankTasks, onAssignSelectedBankTasks, onAssignBankTask,
    showInlineCreate, setShowInlineCreate, slotForm, setSlotForm, slotPreviewTask, onSaveInlineSlot, onClearSlot,
    openBankForCurrentSlot, openInlineCreateForCurrentSlot };
}
