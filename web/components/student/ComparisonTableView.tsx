"use client";

import MathRender from "@/components/ui/MathRender";
import type { ComparisonTaskParts } from "@/lib/comparison-task";

interface ComparisonTableViewProps {
  parts: ComparisonTaskParts;
  compact?: boolean;
  className?: string;
}

export default function ComparisonTableView({
  parts,
  compact = false,
  className = "",
}: ComparisonTableViewProps) {
  return (
    <div className={`w-full space-y-2.5 ${className}`.trim()}>
      {parts.condition ? (
        <div
          className={`min-w-0 flex flex-col items-center justify-center text-center font-semibold text-gray-900 break-words ${
            compact ? "text-sm leading-snug" : "leading-relaxed"
          }`}
        >
          <MathRender latex={parts.condition} />
        </div>
      ) : null}

      <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
          <div
            className={`text-center font-bold tracking-wide text-gray-700 ${
              compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-xs sm:text-sm"
            }`}
          >
            A
          </div>
          <div
            className={`text-center font-bold tracking-wide text-gray-700 ${
              compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-xs sm:text-sm"
            }`}
          >
            B
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          <div
            className={`min-w-0 flex items-center justify-center text-center break-words font-medium text-gray-900 ${
              compact ? "px-2.5 py-2 text-sm" : "px-3 py-3 sm:px-4 sm:py-4"
            }`}
          >
            <MathRender latex={parts.columnA} />
          </div>
          <div
            className={`min-w-0 flex items-center justify-center text-center break-words font-medium text-gray-900 ${
              compact ? "px-2.5 py-2 text-sm" : "px-3 py-3 sm:px-4 sm:py-4"
            }`}
          >
            <MathRender latex={parts.columnB} />
          </div>
        </div>
      </div>
    </div>
  );
}
