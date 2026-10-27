"use client";
import CmsDialog from "../../cms/_components/CmsDialog";
import CmsSkeleton from "../../cms/_components/CmsSkeleton";
import styles from "../../cms/CmsWorkspace.module.css";
import local from "../TrialTests.module.css";
import MathRender from "@/components/ui/MathRender";
import { getTaskTextScaleClass, getTaskTextScaleStyle, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { BankDifficulty, BankTask } from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { trialQuestionTypeLabel } from "./model";

type Props = {
  error: string | null;
  busy: boolean;
  bankOffset: number;
  setBankOffset: Dispatch<SetStateAction<number>>;
  showBankPicker: boolean;
  selectedTestId: number | null;
  activeSlot: number | null;
  setShowBankPicker: Dispatch<SetStateAction<boolean>>;
  setSelectedBankTaskIds: Dispatch<SetStateAction<number[]>>;
  bankSearch: string;
  setBankSearch: Dispatch<SetStateAction<string>>;
  bankDifficulty: "" | BankDifficulty;
  setBankDifficulty: Dispatch<SetStateAction<"" | BankDifficulty>>;
  fetchBank: () => Promise<void>;
  bankLoading: boolean;
  selectedBankTaskIds: number[];
  bankItems: BankTask[];
  bankTotal: number;
  onSelectAllBankTasks: () => Promise<void>;
  bankSelectAllLoading: boolean;
  bankAssigningSelected: boolean;
  onAssignSelectedBankTasks: () => Promise<void>;
  assignedBankTaskIds: Set<number>;
  toggleBankTaskSelection: (bankTaskId: number) => void;
  onAssignBankTask: (bankTaskId: number) => Promise<void>;
};

export default function BankPickerDialog({
  error, busy, bankOffset, setBankOffset,
  showBankPicker,
  selectedTestId,
  activeSlot,
  setShowBankPicker,
  setSelectedBankTaskIds,
  bankSearch,
  setBankSearch,
  bankDifficulty,
  setBankDifficulty,
  fetchBank,
  bankLoading,
  selectedBankTaskIds,
  bankItems,
  bankTotal,
  onSelectAllBankTasks,
  bankSelectAllLoading,
  bankAssigningSelected,
  onAssignSelectedBankTasks,
  assignedBankTaskIds,
  toggleBankTaskSelection,
  onAssignBankTask,
}: Props) {
  const close = () => { if (!busy) { setShowBankPicker(false); setSelectedBankTaskIds([]); } };
  return <CmsDialog open={Boolean(showBankPicker && selectedTestId && activeSlot)} title={`Банктен таңдау · ${activeSlot || ""}-ұяшық`} error={error} onClose={close}>
    <div className={local.bankFilters}>
      <label className={styles.field}>Іздеу<input type="search" value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} placeholder="Мәтін немесе тақырып" disabled={busy} /></label>
      <label className={styles.field}>Күрделілігі<select className="min-h-[38px] rounded border border-slate-300 bg-white px-3 text-sm" value={bankDifficulty} onChange={(e) => setBankDifficulty(e.target.value as BankDifficulty | "")} disabled={busy}><option value="">Барлығы</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
      <button type="button" className={styles.secondaryButton} onClick={() => void fetchBank()} disabled={bankLoading || busy}>Іздеу</button>
    </div>
    <div className={local.bankSelection}>
      <span className={styles.count}>Таңдалды: {selectedBankTaskIds.length} · Барлығы: {bankTotal}</span>
      <div className={styles.actions}><button type="button" className={styles.textButton} onClick={() => void onSelectAllBankTasks()} disabled={busy || bankLoading || !bankTotal}>{bankSelectAllLoading ? "Таңдалуда..." : "Барлығын таңдау"}</button><button type="button" className={styles.textButton} onClick={() => setSelectedBankTaskIds([])} disabled={busy || !selectedBankTaskIds.length}>Таңдауды тазалау</button></div>
    </div>
    <p className="mb-2 text-xs leading-relaxed text-slate-500">Тестке қосылған есептер қайта таңдалмайды. Бірнеше есеп таңдалса, ағымдағы орыннан бастап бос ұяшықтарға қосылады.</p>
    {bankLoading ? <CmsSkeleton kind="tasks" label="Банк тапсырмалары жүктелуде..." /> : <div className={local.bankList}>
      {bankItems.map((task) => {
        const assigned = assignedBankTaskIds.has(task.id);
        const selected = selectedBankTaskIds.includes(task.id);
        return <article key={task.id} className={`${local.bankRow} ${selected ? local.bankRowSelected : ""}`}>
          <input type="checkbox" aria-label={`Банк #${task.id} таңдау`} checked={selected} disabled={assigned || busy} onChange={() => toggleBankTaskSelection(task.id)} />
          <div className="min-w-0"><div className={local.bankMeta}>#{task.id} · {task.difficulty} · {trialQuestionTypeLabel(task.question_type)}{assigned ? " · Тестке қосылған" : ""}</div><div className={`text-slate-800 ${getTaskTextScaleClass(normalizeTaskTextScale(task.text_scale))}`} style={getTaskTextScaleStyle(task.text_scale)}><MathRender latex={task.text || ""} /></div></div>
          <button type="button" className={styles.secondaryButton} disabled={assigned || busy} onClick={() => void onAssignBankTask(task.id)}>Осы ұяшыққа</button>
        </article>;
      })}
      {!bankItems.length && <p className={styles.hint}>Тапсырмалар табылмады.</p>}
    </div>}
    <div className={local.bankActions}><div className={styles.actions}>
      <button type="button" className={styles.secondaryButton} disabled={busy || bankLoading || bankOffset === 0} onClick={() => setBankOffset(Math.max(0, bankOffset - 20))}>Алдыңғы</button>
      <span className={styles.count}>{bankTotal ? bankOffset + 1 : 0}–{Math.min(bankOffset + bankItems.length, bankTotal)} / {bankTotal}</span>
      <button type="button" className={styles.secondaryButton} disabled={busy || bankLoading || bankOffset + bankItems.length >= bankTotal} onClick={() => setBankOffset(bankOffset + 20)}>Келесі</button>
    </div><button type="button" className={styles.primaryButton} disabled={busy || selectedBankTaskIds.length === 0} onClick={() => void onAssignSelectedBankTasks()}>{bankAssigningSelected ? "Қосылуда..." : `Таңдалғанды қосу (${selectedBankTaskIds.length})`}</button></div>
  </CmsDialog>;
}
