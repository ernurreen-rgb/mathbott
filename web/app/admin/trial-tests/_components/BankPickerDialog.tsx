"use client";
import MathRender from "@/components/ui/MathRender";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { BankDifficulty, BankTask } from "@/types";
import type { Dispatch, SetStateAction } from "react";

type Props = {
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
  return (
    <>
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
            <button
              className="mb-3 text-sm border border-gray-300 rounded px-3 py-1 disabled:opacity-50"
              onClick={() => void fetchBank()}
              disabled={bankLoading}
            >
              {bankLoading ? "Ізделуде..." : "Іздеу"}
            </button>
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-700">
                  Таңдалды: <span className="font-semibold">{selectedBankTaskIds.length}</span>
                  <span className="ml-2 text-xs text-gray-500">Көрсетілген: {bankItems.length}/{bankTotal}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onSelectAllBankTasks()}
                    disabled={bankSelectAllLoading || bankLoading || bankTotal === 0}
                    className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 disabled:opacity-50"
                  >
                    {bankSelectAllLoading ? "Жүктелуде..." : "Барлығын таңдау"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBankTaskIds([])}
                    disabled={selectedBankTaskIds.length === 0 || bankAssigningSelected}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
                  >
                    Таңдауды тазалау
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAssignSelectedBankTasks()}
                    disabled={selectedBankTaskIds.length === 0 || bankAssigningSelected}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-300"
                  >
                    {bankAssigningSelected ? "Қосылуда..." : "Таңдалғанды қосу"}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Барлығын таңдау ағымдағы іздеу/деңгей сүзгісіне сай барлық банк тапсырмаларын алады. Тестте бұрыннан бар тапсырмалар қайталанбайды.
              </div>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {bankItems.map((task) => {
                const alreadyAssigned = assignedBankTaskIds.has(task.id);
                return (
                  <div key={task.id} className="rounded-lg border border-gray-200 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">#{task.id}</div>
                      <label className={`flex items-center gap-2 text-xs ${alreadyAssigned ? "text-gray-400" : "text-gray-700"}`}>
                        <input
                          type="checkbox"
                          disabled={alreadyAssigned}
                          checked={!alreadyAssigned && selectedBankTaskIds.includes(task.id)}
                          onChange={() => toggleBankTaskSelection(task.id)}
                        />
                        {alreadyAssigned ? "Тестте бар" : "Таңдау"}
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
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
