import { LocaleOverride } from "@/lib/i18n/provider";

/** The admin panel is not translated: shared components render in Kazakh here whatever the student language is. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <LocaleOverride locale="kk">{children}</LocaleOverride>;
}
