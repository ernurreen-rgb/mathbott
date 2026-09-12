"use client";
import type { Dispatch, SetStateAction } from "react";
import { SnapshotViewState } from "./model";

type Props = {
  snapshotView: SnapshotViewState | null;
  setSnapshotView: Dispatch<SetStateAction<SnapshotViewState | null>>;
};

export default function SnapshotDialog({ snapshotView, setSnapshotView }: Props) {
  return (
    <>
      {snapshotView && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Нұсқа көрінісі v{snapshotView.versionNo}</h3>
              <button
                onClick={() => setSnapshotView(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
              >
                Жабу
              </button>
            </div>
            <pre className="text-xs bg-gray-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(snapshotView.snapshot, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
