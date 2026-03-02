"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { checkAdminStatus } from "@/lib/api";

interface MobileNavProps {
  currentPage?: "modules" | "league" | "rating" | "profile" | "admin" | "trial-test" | "achievements";
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAdminStatus = async () => {
      const email = session?.user?.email;
      if (email) {
        try {
          const { data, error } = await checkAdminStatus();
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
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
    },
    {
      id: "league",
      label: "Лига",
      href: "/league",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
    },
    {
      id: "rating",
      label: "Рейтинг",
      href: "/rating",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
    },
    {
      id: "trial-test",
      label: "\u0411\u0430\u0439\u049b\u0430\u0443 \u0441\u044b\u043d\u0430\u0493\u044b",
      href: "/trial-test",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Профиль",
      href: "/profile",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  // Добавляем админ-панель только для админов
  if (!loading && isAdmin) {
    navItems.push({
      id: "admin",
      label: "Әкімші",
      href: "/admin/",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    });
  }

  const gridCols = navItems.length === 4 ? "grid-cols-4" : "grid-cols-5";

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 glass border-t border-white/30 shadow-2xl md:hidden z-50"
      role="navigation"
      aria-label="Мобильная навигация"
    >
      <div className={`grid ${gridCols} h-16`}>
        {navItems.map((item) => {
          const isActive = currentPage === item.id || 
            pathname === item.href ||
            (item.id === "admin" && pathname?.startsWith("/admin")) ||
            (item.href === "/trial-test" && pathname?.startsWith("/trial-test"));
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-t-lg ${
                isActive
                  ? item.id === "admin"
                    ? "text-red-600 bg-gradient-to-t from-red-100 to-pink-50 font-bold"
                    : "text-purple-600 bg-gradient-to-t from-purple-100 to-pink-50 font-bold"
                  : item.id === "admin"
                  ? "text-red-500 hover:text-red-600 hover:bg-red-50"
                  : "text-gray-600 hover:text-purple-600 hover:bg-white/50"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}


