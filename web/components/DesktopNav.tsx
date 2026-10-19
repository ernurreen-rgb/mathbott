"use client";
import Icon from "@/components/ui/Icon";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { checkAdminStatus } from "@/lib/api";
import { useDesktopNav } from "@/lib/desktop-nav-context";

interface DesktopNavProps {
  currentPage?: "modules" | "profile" | "admin" | "trial-test" | "achievements" | "quizzes";
}

function SidebarIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <Icon name="sidebar" className={className} />
  );
}

export default function DesktopNav(_props: DesktopNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isCollapsed, toggleNav } = useDesktopNav();

  useEffect(() => {
    const loadAdminStatus = async () => {
      const email = session?.user?.email;
      if (email) {
        try {
          const { data, error } = await checkAdminStatus(email);
          if (error) {
            // Only log in development, silently fail in production
            if (process.env.NODE_ENV === "development") {
              console.error("Failed to check admin status:", error);
            }
            setIsAdmin(false);
          } else {
            setIsAdmin(!!data?.is_admin);
          }
        } catch (error) {
          // Only log in development
          if (process.env.NODE_ENV === "development") {
            console.error("Failed to check admin status:", error);
          }
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    };

    loadAdminStatus();
  }, [session?.user?.email]);

  const navItems = [
    {
      id: "modules",
      label: "Модульдер",
      href: "/modules",
      icon: (
        <Icon name="book" className="w-6 h-6" />
      ),
    },
    {
      id: "trial-test",
      label: "Тест",
      href: "/trial-test",
      icon: (
        <Icon name="test" className="w-6 h-6" />
      ),
    },
    {
      id: "quizzes",
      label: "Квиздер",
      href: "/quizzes",
      icon: (
        <Icon name="quiz" className="w-6 h-6" />
      ),
    },
    {
      id: "profile",
      label: "Профиль",
      href: "/profile",
      icon: (
        <Icon name="user" className="w-6 h-6" />
      ),
    },
  ];

  if (!loading && isAdmin) {
    navItems.push({
      id: "admin",
      label: "Әкімші",
      href: "/admin/",
      icon: (
        <Icon name="shield" className="w-6 h-6" />
      ),
    });
  }


  return (
    <nav
      className={`hidden md:flex fixed left-0 top-0 h-full bg-white/95 backdrop-blur-md border-r border-gray-200/80 shadow-sm z-30 flex-col py-3 select-none transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${
        isCollapsed ? "w-16" : "w-64"
      }`}
      role="navigation"
      aria-label="Основная навигация"
    >
      {/* Header */}
      {!isCollapsed ? (
        <div className="flex items-center justify-between px-4 pb-3 mb-2 border-b border-gray-200/40">
          <Link
            href="/modules"
            className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-sm group-hover:scale-105 transition-transform flex-shrink-0">
              QM
            </div>
            <span className="font-extrabold text-gray-800 text-base tracking-tight group-hover:text-purple-600 transition-colors whitespace-nowrap">
              QazMath
            </span>
          </Link>
          <div className="relative group">
            <button
              type="button"
              onClick={toggleNav}
              aria-label="Навигацияны жабу"
              title="Бүйірлік тақтаны жию (Ctrl+B)"
              className="p-1.5 rounded-xl bg-white/70 hover:bg-purple-100 text-gray-500 hover:text-purple-700 border border-gray-200/60 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <SidebarIcon className="w-5 h-5" />
            </button>
            <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/95 text-white text-xs font-medium shadow-xl whitespace-nowrap z-50">
              <div className="absolute bottom-full right-3 border-4 border-transparent border-b-gray-900/95" />
              <span>Бүйірлік тақтаны жию</span>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] font-mono text-gray-300 border border-gray-700">
                Ctrl+B
              </kbd>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center px-2 pb-3 mb-2 border-b border-gray-200/40">
          <div className="relative group">
            <button
              type="button"
              onClick={toggleNav}
              aria-label="Навигацияны ашу"
              title="Бүйірлік тақтаны ашу (Ctrl+B)"
              className="relative flex items-center justify-center w-10 h-10 rounded-xl hover:bg-purple-100/80 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {/* Default state: QM Logo */}
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-sm transition-all duration-200 group-hover:opacity-0 group-hover:scale-75">
                QM
              </div>
              {/* Hover state: ChatGPT sidebar toggle icon */}
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 group-hover:text-purple-700 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200">
                <SidebarIcon className="w-5 h-5" />
              </div>
            </button>

            {/* Floating tooltip to the right (ChatGPT style) */}
            <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/95 text-white text-xs font-medium shadow-xl whitespace-nowrap z-50">
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900/95" />
              <span>Бүйірлік тақтаны ашу</span>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] font-mono text-gray-300 border border-gray-700">
                Ctrl+B
              </kbd>
            </div>
          </div>
        </div>
      )}

      {/* Nav items */}
      <div
        className={`flex flex-col gap-2 flex-1 ${
          isCollapsed ? "px-2 items-center overflow-visible" : "px-4 overflow-y-auto"
        }`}
      >
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/profile" && pathname?.startsWith("/profile")) ||
            (item.id === "admin" && pathname?.startsWith("/admin")) ||
            (item.href === "/trial-test" && pathname?.startsWith("/trial-test"));

          if (isCollapsed) {
            return (
              <div key={item.id} className="relative group">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200/70"
                      : "text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 ${
                      isActive ? "text-indigo-700" : "text-current"
                    }`}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                </Link>

                {/* Floating tooltip */}
                <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center px-3 py-1.5 rounded-lg bg-gray-900/95 text-white text-xs font-medium shadow-xl whitespace-nowrap z-50">
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900/95" />
                  <span>{item.label}</span>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200/70"
                  : "text-slate-600 hover:bg-slate-100 hover:text-indigo-700"
              }`}
            >
              <div
                className={`flex-shrink-0 ${
                  isActive ? "text-indigo-700" : "text-current"
                }`}
                aria-hidden="true"
              >
                {item.icon}
              </div>
              <span className="font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
