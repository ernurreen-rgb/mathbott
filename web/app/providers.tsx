"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { DesktopNavProvider } from "@/lib/desktop-nav-context";
import QuizGuestSync from "@/components/quiz/QuizGuestSync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/config";
import { ThemeProvider } from "@/lib/theme/provider";

export function Providers({ locale, signedIn, children }: { locale: Locale; signedIn: boolean; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider initialSignedIn={signedIn}>
        <I18nProvider initialLocale={locale}>
          <QuizGuestSync />
          <ServiceWorkerRegister />
          <DesktopNavProvider>
            <PresenceProvider>{children}</PresenceProvider>
          </DesktopNavProvider>
          {/* react-hot-toast styles its cards inline (white); the dark theme needs !important. */}
          <Toaster toastOptions={{ className: "dark:!bg-surface-muted dark:!text-fg" }} />
        </I18nProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
