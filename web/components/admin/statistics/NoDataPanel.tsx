"use client";

interface NoDataPanelProps {
  title?: string;
}

export default function NoDataPanel({ title = "Деректер жоқ" }: NoDataPanelProps) {
  return (
    <div className="h-[260px] rounded-xl border border-dashed border-gray-300 bg-white/60 flex items-center justify-center text-sm text-gray-600">
      {title}
    </div>
  );
}
