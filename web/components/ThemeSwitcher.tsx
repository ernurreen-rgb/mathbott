"use client";

import Icon, { type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/preference";
import { useTheme } from "@/lib/theme/provider";

const OPTIONS: Record<ThemePreference, { label: MessageKey; icon: IconName }> = {
  system: { label: "theme.system", icon: "monitor" },
  light: { label: "theme.light", icon: "sun" },
  dark: { label: "theme.dark", icon: "moon" },
};

/** Light, dark or follow the device; the same segmented look as LanguageSwitcher. */
export default function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();

  return (
    <div role="radiogroup" aria-label={t("theme.title")} className={`inline-flex rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200 ${className}`}>
      {THEME_PREFERENCES.map((option) => {
        const selected = option === preference;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            data-theme-option={option}
            onClick={() => setPreference(option)}
            className={`inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
              selected ? "bg-white text-purple-700 shadow-sm dark:bg-surface-stronger" : "text-slate-600 hover:bg-white"
            }`}
          >
            <Icon name={OPTIONS[option].icon} className="h-4 w-4" />
            {t(OPTIONS[option].label)}
          </button>
        );
      })}
    </div>
  );
}
