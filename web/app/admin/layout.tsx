import type { Metadata } from "next";
import { LocaleOverride } from "@/lib/i18n/provider";
import { translate } from "@/lib/i18n/translate";

// The root layout titles the tab in the student's language; the admin panel keeps Kazakh.
export const metadata: Metadata = {
  title: translate("kk", "meta.title"),
  description: translate("kk", "meta.description"),
};

/** The admin panel is not translated: shared components render in Kazakh here whatever the student language is. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <LocaleOverride locale="kk">{children}</LocaleOverride>;
}
