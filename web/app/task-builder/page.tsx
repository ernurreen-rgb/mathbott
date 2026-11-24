"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";
import { createTaskCollection, deleteTaskCollection, listTaskCollections } from "@/lib/api/constructor";
import { useI18n } from "@/lib/i18n/provider";
import { useRequireAuth } from "@/lib/use-require-auth";
import type { TaskCollectionList } from "@/types/constructor";
import { formatCollectionDate } from "./_components/format";

export default function ConstructorPage() {
  const { data: session, status } = useRequireAuth();
  const email = session?.user?.email || "";
  const router = useRouter();
  const { t, intlLocale } = useI18n();
  const [list, setList] = useState<TaskCollectionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!email) return;
    const result = await listTaskCollections(email);
    if (result.error || !result.data) {
      setError(t("constructor.loadError"));
      return;
    }
    setError(null);
    setList(result.data);
  }, [email, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!email || busy) return;
    setBusy(true);
    const result = await createTaskCollection(t("constructor.defaultTitle"), email);
    if (result.data) {
      router.push(`/task-builder/${result.data.id}`);
      return;
    }
    setBusy(false);
    setError(result.status === 409 ? t("constructor.limitReached", { max: list?.max_collections ?? 50 }) : t("constructor.loadError"));
  };

  const remove = async (id: number, title: string) => {
    if (!email || !window.confirm(t("constructor.deleteConfirm", { title }))) return;
    const result = await deleteTaskCollection(id, email);
    if (result.error) {
      setError(t("constructor.loadError"));
      return;
    }
    setList((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current));
  };

  if (status === "loading" || !session) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10 md:pl-64">
      <DesktopNav currentPage="constructor" />
      <MobileNav currentPage="constructor" />
      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start gap-4">
          <div className="mr-auto min-w-0">
            <h1 className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text py-1 text-3xl font-bold leading-normal text-transparent sm:text-4xl">
              {t("constructor.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{t("constructor.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !list}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            <Icon name={busy ? "loader" : "plus"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {t("constructor.new")}
          </button>
        </header>

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!list && !error ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}
          </div>
        ) : list && list.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Icon name="layers" className="mx-auto h-10 w-10 text-purple-500" />
            <p className="mt-3 text-slate-600">{t("constructor.empty")}</p>
          </div>
        ) : list ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {list.items.map((item) => (
              <li key={item.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Link
                  href={`/task-builder/${item.id}`}
                  className="text-lg font-bold text-slate-900 hover:text-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <span className="line-clamp-2 break-words">{item.title}</span>
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  {t("constructor.taskCount", { count: item.task_count ?? 0 })}
                  {item.updated_at ? ` · ${t("constructor.updated", { date: formatCollectionDate(item.updated_at, intlLocale) })}` : ""}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/task-builder/${item.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                    {t("constructor.open")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(item.id, item.title)}
                    aria-label={t("constructor.deleteAria", { title: item.title })}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                    {t("constructor.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
