"use client";
import Icon from "@/components/ui/Icon";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { checkAdminStatus } from "@/lib/api";

interface MobileNavProps {
  currentPage?: "modules" | "profile" | "admin" | "trial-test" | "achievements" | "quizzes";
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
      label: "\u0422\u0435\u0441\u0442",
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

  // Добавляем админ-панель только для админов
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

  const gridCols = navItems.length >= 5 ? "grid-cols-5" : navItems.length === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 glass border-t border-white/30 pb-[env(safe-area-inset-bottom)] shadow-2xl md:hidden z-50"
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
                  ? "text-indigo-700 bg-indigo-50 font-bold"
                  : "text-slate-500 hover:text-indigo-700 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="w-full text-center text-xs font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}


