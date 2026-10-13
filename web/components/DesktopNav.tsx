"use client";

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
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M9 3v18" />
    </svg>
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
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
    },
    {
      id: "trial-test",
      label: "Тест",
      href: "/trial-test",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "quizzes",
      label: "Квиздер",
      href: "/quizzes",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Профиль",
      href: "/profile",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  if (!loading && isAdmin) {
    navItems.push({
      id: "admin",
      label: "Әкімші",
      href: "/admin/",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
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
                      ? item.id === "admin"
                        ? "bg-red-500 text-white shadow-md"
                        : "bg-blue-500 text-white shadow-md"
                      : item.id === "admin"
                      ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                      : "text-gray-600 hover:bg-white/70 hover:text-purple-600"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 ${
                      isActive ? "text-white" : item.id === "admin" ? "text-red-600" : "text-gray-600"
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
                  ? item.id === "admin"
                    ? "bg-red-500 text-white shadow-lg"
                    : "bg-blue-500 text-white shadow-lg"
                  : item.id === "admin"
                  ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                  : "text-gray-700 hover:bg-white/60 hover:text-purple-600"
              }`}
            >
              <div
                className={`flex-shrink-0 ${
                  isActive ? "text-white" : item.id === "admin" ? "text-red-600" : "text-gray-600"
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
