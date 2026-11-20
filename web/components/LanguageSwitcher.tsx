"use client";

import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

interface LanguageSwitcherProps {
  className?: string;
  /** "light" sits on white cards, "glass" on the purple gradient of /join. */
  tone?: "light" | "glass";
}

export default function LanguageSwitcher({ className = "", tone = "light" }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const track = tone === "glass" ? "bg-white/20 ring-1 ring-white/30" : "bg-slate-100 ring-1 ring-slate-200";
  const idle = tone === "glass" ? "text-white/90 hover:bg-white/15" : "text-slate-600 hover:bg-white";
  const active = "bg-white text-purple-700 shadow-sm";

  return (
    <div role="radiogroup" aria-label={t("language.title")} className={`inline-flex rounded-xl p-1 ${track} ${className}`}>
      {LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={code}
            onClick={() => setLocale(code)}
            className={`min-h-[36px] flex-1 rounded-lg px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${selected ? active : idle}`}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
