"use client";

import type { ReactNode } from "react";

interface StatsLegacySectionsProps {
  children: ReactNode;
}

export default function StatsLegacySections({ children }: StatsLegacySectionsProps) {
  return (
    <details className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
      <summary className="cursor-pointer select-none text-xl font-semibold text-gray-900">
        Толық статистика (кестелер мен тізімдер)
      </summary>
      <div className="mt-6">{children}</div>
    </details>
  );
}
