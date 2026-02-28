"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-math animate-gradient p-4">
      <div className="max-w-md w-full bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 text-center border border-white/30">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Қате орын алды
        </h1>
        <p className="text-gray-600 mb-4">
          Кешіріңіз, бір нәрсе дұрыс жұмыс істемеді. Бетті жаңартып көріңіз.
        </p>
        {error.message && (
          <details className="text-left mb-4">
            <summary className="cursor-pointer text-sm text-gray-500 mb-2">
              Техникалық ақпарат
            </summary>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
              {error.message}
            </pre>
          </details>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Қайталау
          </button>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors font-semibold"
          >
            Басты бетке
          </button>
        </div>
      </div>
    </div>
  );
}

