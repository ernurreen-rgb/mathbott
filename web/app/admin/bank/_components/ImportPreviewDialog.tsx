"use client";
import MathRender from "@/components/ui/MathRender";
import type { Dispatch, SetStateAction } from "react";
import { ImportPreviewState } from "./model";

type Props = {
  importPreviewState: ImportPreviewState | null;
  setImportPreviewState: Dispatch<SetStateAction<ImportPreviewState | null>>;
  runBankImportConfirm: (dedupConfirmed: boolean) => Promise<void>;
  confirmingImport: boolean;
};

export default function ImportPreviewDialog({ importPreviewState, setImportPreviewState, runBankImportConfirm, confirmingImport }: Props) {
  return (
    <>
      {importPreviewState && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">JSON импорт preview</h3>
            <p className="text-sm text-gray-600 mb-4">
              Алдымен тексеру нәтижесі көрсетіледі. Растамайынша базаға ештеңе сақталмайды.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm mb-4">
              <div className="bg-gray-100 rounded px-2 py-1">Барлығы: {importPreviewState.preview.summary.total_tasks}</div>
              <div className="bg-green-100 rounded px-2 py-1">Дұрыс: {importPreviewState.preview.summary.valid_count}</div>
              <div className="bg-red-100 rounded px-2 py-1">Қате: {importPreviewState.preview.summary.invalid_count}</div>
              <div className="bg-amber-100 rounded px-2 py-1">Дубликат: {importPreviewState.preview.summary.duplicate_count}</div>
              <div className="bg-blue-100 rounded px-2 py-1 col-span-2 md:col-span-1">
                Растау: {importPreviewState.preview.summary.can_confirm ? "Иә" : "Жоқ"}
              </div>
            </div>

            {importPreviewState.preview.validation_errors.length > 0 && (
              <div className="mb-4">
                <div className="font-semibold mb-2 text-red-700">Валидация қателері</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {importPreviewState.preview.validation_errors.map((item, index) => (
                    <li key={`${item.index}-${item.field}-${index}`}>
                      #{item.index + 1} · {item.field}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importPreviewState.preview.duplicate_conflicts.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="font-semibold text-amber-700">Ұқсас тапсырмалар</div>
                {importPreviewState.preview.duplicate_conflicts.map((conflict) => (
                  <div key={`conflict-${conflict.index}`} className="border rounded-lg p-3">
                    <div className="text-sm text-gray-700 mb-2">JSON жолы: #{conflict.index + 1}</div>
                    {conflict.similar_tasks.map((item) => (
                      <div key={`${conflict.index}-${item.id}`} className="border rounded-lg p-3 mb-2 last:mb-0">
                        <div className="text-sm text-gray-700 mb-1">
                          #{item.id} · ұқсастық: {(item.score * 100).toFixed(1)}% · {item.question_type}
                        </div>
                        <div className="text-sm text-gray-900 break-words">
                          {item.text ? <MathRender inline latex={item.text} /> : `Тапсырма #${item.id}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setImportPreviewState(null)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg"
              >
                Бас тарту
              </button>
              <button
                onClick={() => void runBankImportConfirm(false)}
                disabled={
                  confirmingImport ||
                  !importPreviewState.preview.summary.can_confirm ||
                  importPreviewState.preview.summary.duplicate_count > 0
                }
                className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
              >
                {confirmingImport ? "Расталуда..." : "Импортты растау"}
              </button>
              <button
                onClick={() => void runBankImportConfirm(true)}
                disabled={
                  confirmingImport ||
                  !importPreviewState.preview.summary.can_confirm ||
                  importPreviewState.preview.summary.duplicate_count === 0
                }
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Соған қарамастан импорттау
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
