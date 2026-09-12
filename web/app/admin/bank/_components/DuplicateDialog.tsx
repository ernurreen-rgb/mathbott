"use client";
import MathRender from "@/components/ui/MathRender";
import type { Dispatch, SetStateAction } from "react";
import { PendingDedupState } from "./model";

type Props = {
  pendingDedup: PendingDedupState | null;
  setPendingDedup: Dispatch<SetStateAction<PendingDedupState | null>>;
  submitBankForm: (dedupConfirmed?: boolean) => Promise<void>;
  saving: boolean;
};

export default function DuplicateDialog({ pendingDedup, setPendingDedup, submitBankForm, saving }: Props) {
  return (
    <>
      {pendingDedup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">Ұқсас тапсырмалар табылды</h3>
            <p className="text-sm text-gray-600 mb-4">
              Төмендегі тізімді тексеріңіз. Бас тартуға немесе мәжбүрлеп сақтауға болады.
            </p>
            <div className="space-y-2 mb-4">
              {pendingDedup.similarTasks.map((item) => (
                <div key={item.id} className="border rounded-lg p-3">
                  <div className="text-sm text-gray-700 mb-1">
                    #{item.id} · ұқсастық: {(item.score * 100).toFixed(1)}% · {item.question_type}
                  </div>
                  <div className="text-sm text-gray-900 break-words">
                    {item.text ? <MathRender inline latex={item.text} /> : `Тапсырма #${item.id}`}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingDedup(null)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg"
              >
                Бас тарту
              </button>
              <button
                onClick={() => submitBankForm(true)}
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Соған қарамастан сақтау
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
