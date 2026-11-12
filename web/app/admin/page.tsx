"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import Icon, { type IconName } from "@/components/ui/Icon";
import MobileNav from "@/components/MobileNav";
import { checkAdminStatus } from "@/lib/api";
import { isAllowedForPage, type AdminPageKey } from "@/lib/admin-access";
import { showToast } from "@/lib/toast";
import type { AdminCheckResponse } from "@/types";

type AdminCardConfig = {
  title: string;
  href: string;
  icon: IconName;
  section: AdminPageKey;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [adminCheck, setAdminCheck] = useState<AdminCheckResponse | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    const sessionEmail = session?.user?.email;
    if (status === "loading") return;
    if (!sessionEmail) {
      router.push("/");
      return;
    }

    let cancelled = false;
    setAccessLoading(true);

    void (async () => {
      const { data, error } = await checkAdminStatus(sessionEmail);
      if (cancelled) return;

      if (error || !data?.is_admin) {
        showToast.error("Қолжетім жоқ");
        router.push("/");
        setAdminCheck(null);
        setAccessLoading(false);
        return;
      }

      setAdminCheck(data);
      setAccessLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.email, status, router]);

  const cards = useMemo<AdminCardConfig[]>(
    () => [
      {
        title: "CMS",
        href: "/admin/cms",
        icon: "layers",
        section: "content",
      },
      {
        title: "Статистика",
        href: "/admin/statistics",
        icon: "chart",
        section: "review",
      },
      {
        title: "Қателер талдауы",
        href: "/admin/mistakes",
        icon: "target",
        section: "any",
      },
      {
        title: "Хабарламалар",
        href: "/admin/reports",
        icon: "report",
        section: "review",
      },
      {
        title: "Сынақ тесттері",
        href: "/admin/trial-tests",
        icon: "test",
        section: "content",
      },
      {
        title: "Банк",
        href: "/admin/bank",
        icon: "folder",
        section: "content",
      },
      {
        title: "Банк сапасы",
        href: "/admin/bank/quality",
        icon: "compass",
        section: "review",
      },
      {
        title: "Банк аудиті",
        href: "/admin/bank/audit",
        icon: "audit",
        section: "review",
      },
      {
        title: "Өндіріс денсаулығы",
        href: "/admin/ops",
        icon: "support",
        section: "review",
      },
      {
        title: "Рөлдерді басқару",
        href: "/admin/roles",
        icon: "shield",
        section: "super",
      },
      {
        title: "Нұсқаулар",
        href: "/admin/guides",
        icon: "book",
        section: "content",
      },
    ],
    []
  );

  const visibleCards = useMemo(() => {
    const role = adminCheck?.role ?? null;
    return cards.filter((card) => isAllowedForPage(card.section, role));
  }, [cards, adminCheck?.role]);

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <MobileNav currentPage="admin" />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-6xl">
          <div className="mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Әкімші панелі
            </h1>
            <p className="text-gray-700">Платформаны басқару</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {visibleCards.map((card) => (
              <AdminCard
                key={card.href}
                title={card.title}
                href={card.href}
                icon={card.icon}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function AdminCard({
  title,
  href,
  icon,
}: {
  title: string;
  href: string;
  icon: IconName;
}) {
  return (
    <Link href={href} className="group block focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-3xl">
      <div className="glass rounded-3xl shadow-xl p-6 border border-white/40 hover:shadow-glow-pink transition-all duration-200 transform hover:-translate-y-1 hover:scale-[1.02] cursor-pointer h-36 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600 transition-all shadow-sm">
            <Icon name={icon} size={26} />
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 group-hover:text-purple-600 group-hover:bg-purple-100/50 transition-all">
            <Icon name="arrowRight" className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 group-hover:text-purple-700 transition-colors truncate">
          {title}
        </h3>
      </div>
    </Link>
  );
}
