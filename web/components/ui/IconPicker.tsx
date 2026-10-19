"use client";

import Icon, { resolveIconName, type IconName } from "./Icon";

const options: Array<{ name: IconName; label: string }> = [
  { name: "book", label: "Кітап" }, { name: "graduation", label: "Оқу" },
  { name: "layers", label: "Бөлімдер" }, { name: "test", label: "Тест" },
  { name: "quiz", label: "Квиз" }, { name: "compass", label: "Бағыт" },
  { name: "star", label: "Жұлдыз" }, { name: "bolt", label: "Ұпай" },
  { name: "trophy", label: "Кубок" }, { name: "award", label: "Жетістік" },
];

export default function IconPicker({ value, onChange, label = "Белгіше" }: {
  value: string; onChange: (value: string) => void; label?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <Icon name={resolveIconName(value, "book")} size={24} className="text-indigo-600" />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        <option value="">Әдепкі белгіше</option>
        {value && !options.some((option) => option.name === value) && <option value={value}>Қазіргі белгіше</option>}
        {options.map((option) => <option key={option.name} value={option.name}>{option.label}</option>)}
      </select>
    </span>
  );
}
