"use client";
import {
  BankTask,
  BankTaskUsageItem
} from "@/types";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  usageTask: BankTask | null;
  setUsageTask: Dispatch<SetStateAction<BankTask | null>>;
  usageLoading: boolean;
  usageError: string | null;
  usageItems: BankTaskUsageItem[];
};

export default function UsageDialog({ usageTask, setUsageTask, usageLoading, usageError, usageItems }: Props) {
  return (
    <>
      {usageTask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Тапсырма #{usageTask.id} қай жерде қолданылады</h3>
              <button
                onClick={() => setUsageTask(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
              >
                Жабу
              </button>
            </div>
            {usageLoading ? (
              <div className="text-sm text-gray-600">Жүктелуде...</div>
            ) : usageError ? (
              <div className="text-sm text-red-600">{usageError}</div>
            ) : usageItems.length === 0 ? (
              <div className="text-sm text-gray-600">Белсенді орналастыру жоқ</div>
            ) : (
              <div className="space-y-2">
                {usageItems.map((item) => (
                  <div key={`${item.kind}-${item.placement_id}`} className="border rounded-lg p-3 text-sm">
                    {item.kind === "trial_test" ? (
                      <div>
                        Сынақ тесті #{item.trial_test_id}: {item.trial_test_title || "-"} · ұяшық {item.sort_order + 1} ·{" "}
                        <Link href="/admin/trial-tests" className="text-blue-600 hover:underline">Ашу</Link>
                      </div>
                    ) : (
                      <div>
                        Модуль: {item.module_name || "-"} · Бөлім: {item.section_name || "-"} · Сабақ: {item.lesson_title || "-"} · орын {item.sort_order + 1} ·{" "}
                        <Link href="/admin/cms" className="text-blue-600 hover:underline">Ашу</Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
