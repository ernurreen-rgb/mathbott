"use client";
import type { Dispatch, SetStateAction } from "react";
import { JsonEditState } from "./model";

type Props = {
  jsonEdit: JsonEditState | null;
  setJsonEdit: Dispatch<SetStateAction<JsonEditState | null>>;
  saveJsonEdit: (dedupConfirmed?: boolean) => Promise<void>;
};

export default function JsonEditDialog({ jsonEdit, setJsonEdit, saveJsonEdit }: Props) {
  return (
    <>
      {jsonEdit && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold">JSON өңдеу #{jsonEdit.task.id}</h3>
                <div className="text-xs text-gray-500">v{jsonEdit.versionNo} нұсқасы бойынша</div>
              </div>
              <button
                onClick={() => setJsonEdit(null)}
                disabled={jsonEdit.saving}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-900 px-3 py-1 rounded-lg"
              >
                Жабу
              </button>
            </div>
            {jsonEdit.error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {jsonEdit.error}
              </div>
            )}
            <label htmlFor="bank-json-edit" className="mb-2 block text-sm font-semibold text-gray-700">
              Тапсырма JSON
            </label>
            <textarea
              id="bank-json-edit"
              value={jsonEdit.value}
              onChange={(e) =>
                setJsonEdit((prev) =>
                  prev ? { ...prev, value: e.target.value, error: null, canForceSave: false } : prev
                )
              }
              spellCheck={false}
              className="min-h-[420px] w-full rounded-lg border border-gray-300 bg-gray-950 p-3 font-mono text-xs leading-5 text-gray-100 outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="mt-2 text-xs text-gray-500">
              image_filename және solution_filename тек анықтама үшін көрсетіледі.
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setJsonEdit(null)}
                disabled={jsonEdit.saving}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-900 font-semibold py-2 px-4 rounded-lg"
              >
                Бас тарту
              </button>
              {jsonEdit.canForceSave && (
                <button
                  onClick={() => saveJsonEdit(true)}
                  disabled={jsonEdit.saving}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  Сонда да сақтау
                </button>
              )}
              <button
                onClick={() => saveJsonEdit(false)}
                disabled={jsonEdit.saving}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
              >
                {jsonEdit.saving ? "Сақталуда..." : "JSON сақтау"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
