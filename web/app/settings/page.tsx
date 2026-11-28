"use client";
import Icon from "@/components/ui/Icon";

import StreakReminderCard from "./_components/StreakReminderCard";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useI18n } from "@/lib/i18n/provider";

import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { useRequireAuth } from "@/lib/use-require-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";

/** The student's settings, opened from the profile: streak reminder, language, theme and sign-out. */
export default function SettingsPage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const sessionEmail = session?.user?.email || "";

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="profile" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-2xl mx-auto">
            <SkeletonLoader variant="card" className="mb-4" />
            <SkeletonLoader variant="card" className="mb-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthRedirectScreen loading={false} />;
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
          <div className="mb-6">
            <Link
              href="/profile"
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-purple-50 hover:text-purple-700 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <Icon name="arrowLeft" />
              <span>{t("settings.backToProfile")}</span>
            </Link>
            {/* pb-1 lets the gradient reach the descenders of «у» and «р». */}
            <h1 className="pb-1 text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 bg-clip-text text-transparent">
              {t("settings.title")}
            </h1>
          </div>

          <div className="space-y-6">
            {sessionEmail && <StreakReminderCard email={sessionEmail} />}

            <section
              aria-labelledby="language-title"
              className="glass flex flex-wrap items-center gap-4 rounded-3xl border border-white/30 p-5 shadow-xl"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                <Icon name="globe" className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <h2 id="language-title" className="text-lg font-bold text-gray-900">{t("language.title")}</h2>
                <p className="text-sm text-gray-600">{t("language.hint")}</p>
              </div>
              <LanguageSwitcher className="w-full sm:w-auto" />
            </section>

            <section
              aria-labelledby="theme-title"
              className="glass flex flex-wrap items-center gap-4 rounded-3xl border border-white/30 p-5 shadow-xl"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                <Icon name="moon" className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <h2 id="theme-title" className="text-lg font-bold text-gray-900">{t("theme.title")}</h2>
                <p className="text-sm text-gray-600">{t("theme.hint")}</p>
              </div>
              <ThemeSwitcher className="w-full sm:w-auto" />
            </section>

            <div className="glass rounded-2xl shadow-xl p-6 border border-white/30">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-[1.02] text-lg"
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon name="logOut" className="w-5 h-5" />
                  {t("profile.signOut")}
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      <MobileNav currentPage="profile" />
    </div>
  );
}
