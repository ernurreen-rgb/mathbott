"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { DesktopNavProvider } from "@/lib/desktop-nav-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DesktopNavProvider>
        <PresenceProvider>{children}</PresenceProvider>
      </DesktopNavProvider>
      <Toaster />
    </SessionProvider>
  );
}
