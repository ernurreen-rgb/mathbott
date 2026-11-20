"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { DesktopNavProvider } from "@/lib/desktop-nav-context";
import QuizGuestSync from "@/components/quiz/QuizGuestSync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/config";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider initialLocale={locale}>
        <QuizGuestSync />
        <ServiceWorkerRegister />
        <DesktopNavProvider>
          <PresenceProvider>{children}</PresenceProvider>
        </DesktopNavProvider>
        <Toaster />
      </I18nProvider>
    </SessionProvider>
  );
}
