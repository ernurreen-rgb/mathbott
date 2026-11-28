"use client";
import Icon from "@/components/ui/Icon";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useI18n } from "@/lib/i18n/provider";

interface MobileNavProps {
  currentPage?: "modules" | "profile" | "admin" | "trial-test" | "achievements" | "quizzes" | "constructor";
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useI18n();
  const isAdmin = useIsAdmin(session?.user?.email);

  const navItems = [
    {
      id: "modules",
      label: t("nav.modules"),
      href: "/modules",
      icon: (
        <Icon name="book" className="w-6 h-6" />
      ),
    },
    {
      id: "trial-test",
      label: t("nav.trialTest"),
      href: "/trial-test",
      icon: (
        <Icon name="test" className="w-6 h-6" />
      ),
    },
    {
      id: "quizzes",
      label: t("nav.quizzes"),
      href: "/quizzes",
      icon: (
        <Icon name="quiz" className="w-6 h-6" />
      ),
    },
    {
      id: "constructor",
      label: t("nav.constructor"),
      href: "/task-builder",
      icon: (
        <Icon name="layers" className="w-6 h-6" />
      ),
    },
    {
      id: "profile",
      label: t("nav.profile"),
      href: "/profile",
      icon: (
        <Icon name="user" className="w-6 h-6" />
      ),
    },
  ];

  // Only admins get the admin panel link
  if (isAdmin) {
    navItems.push({
      id: "admin",
      label: t("nav.admin"),
      href: "/admin/",
      icon: (
        <Icon name="shield" className="w-6 h-6" />
      ),
    });
  }

  const gridCols = navItems.length >= 6 ? "grid-cols-6" : navItems.length === 5 ? "grid-cols-5" : navItems.length === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 glass border-t border-white/30 pb-[env(safe-area-inset-bottom)] shadow-2xl md:hidden z-50"
      role="navigation"
      aria-label={t("nav.mobileAria")}
    >
      <div className={`grid ${gridCols} h-16`}>
        {navItems.map((item) => {
          const isActive = currentPage === item.id || 
            pathname === item.href ||
            // /settings opens from the profile and has no nav item of its own.
            (item.id === "profile" && pathname?.startsWith("/settings")) ||
            (item.id === "admin" && pathname?.startsWith("/admin")) ||
            (item.href === "/trial-test" && pathname?.startsWith("/trial-test")) ||
            (item.id === "constructor" && pathname?.startsWith("/task-builder"));
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-t-lg ${
                isActive
                  ? "text-indigo-700 bg-indigo-50 font-bold"
                  : "text-slate-500 hover:text-indigo-700 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className={`w-full truncate px-0.5 text-center font-medium leading-tight ${navItems.length >= 6 ? "text-[10px]" : "text-xs"}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}


