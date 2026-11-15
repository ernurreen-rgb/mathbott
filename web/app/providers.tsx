"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { DesktopNavProvider } from "@/lib/desktop-nav-context";
import QuizGuestSync from "@/components/quiz/QuizGuestSync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QuizGuestSync />
      <ServiceWorkerRegister />
      <DesktopNavProvider>
        <PresenceProvider>{children}</PresenceProvider>
      </DesktopNavProvider>
      <Toaster />
    </SessionProvider>
  );
}
