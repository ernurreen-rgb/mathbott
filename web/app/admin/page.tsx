"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { checkAdminStatus } from "@/lib/api";
import { isAllowedForPage, type AdminPageKey } from "@/lib/admin-access";
import { showToast } from "@/lib/toast";
import type { AdminCheckResponse } from "@/types";

type AdminCardConfig = {
  title: string;
  description: string;
  href: string;
  icon: string;
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
      const { data, error } = await checkAdminStatus();
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
        description: "Модульдер, бөлімдер, сабақтар және тапсырмалар",
        href: "/admin/cms",
        icon: "📝",
        section: "content",
      },
      {
        title: "Статистика",
        description: "Платформаның жалпы статистикасы",
        href: "/admin/statistics",
        icon: "📊",
        section: "review",
      },
      {
        title: "Хабарламалар",
        description: "Пайдаланушылардың хабарламаларын басқару",
        href: "/admin/reports",
        icon: "📋",
        section: "review",
      },
      {
        title: "Сынақ тесттері",
        description: "Сынақ тесттері мен тапсырмаларын басқару",
        href: "/admin/trial-tests",
        icon: "🧪",
        section: "content",
      },
      {
        title: "БАНК",
        description: "Тақырыптар мен күрделілігі бар тапсырмалар қоры",
        href: "/admin/bank",
        icon: "🗂️",
        section: "content",
      },
      {
        title: "Банк сапасы",
        description: "Дубликаттар, қолданылмайтын және тақырыпсыз тапсырмалар",
        href: "/admin/bank/quality",
        icon: "🧭",
        section: "review",
      },
      {
        title: "Bank Audit",
        description: "Импорт, rollback және жою әрекеттерінің аудит ізі",
        href: "/admin/bank/audit",
        icon: "🕵️",
        section: "review",
      },
      {
        title: "Өндіріс денсаулығы",
        description: "Қателер, инциденттер және сервис күйі",
        href: "/admin/ops",
        icon: "🛟",
        section: "review",
      },
      {
        title: "Рөлдерді басқару",
        description: "Админ рөлдерін тағайындау және өзгерту",
        href: "/admin/roles",
        icon: "🛡️",
        section: "super",
      },
      {
        title: "Нұсқаулар",
        description: "Бөлімдерге нұсқаулық қосу",
        href: "/admin/guides",
        icon: "📖",
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleCards.map((card) => (
              <AdminCard
                key={card.href}
                title={card.title}
                description={card.description}
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
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link href={href}>
      <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 hover:shadow-glow-pink transition-all transform hover:scale-105 cursor-pointer">
        <div className="text-5xl mb-4">{icon}</div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </Link>
  );
}
