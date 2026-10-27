"use client";

import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { isAllowedForPage } from "@/lib/admin-access";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import CmsSkeleton from "../cms/_components/CmsSkeleton";
import styles from "../cms/CmsWorkspace.module.css";
import { TrialTestsProvider } from "./_components/TrialTestsProvider";

function AccessBoundary({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { access, loading } = useAdminPageAccess("content", status, session?.user?.email);
  if (status === "loading" || loading) return <CmsSkeleton kind="page" label="Сынақ тесттері жүктелуде..." />;
  if (!session || !access?.is_admin || !isAllowedForPage("content", access.role)) return <p className={styles.hint}>Қолжетім жоқ.</p>;
  return <TrialTestsProvider>{children}</TrialTestsProvider>;
}

export default function TrialTestsLayout({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  return <div className={styles.page}>
    <DesktopNav />
    <main className={`${styles.main} md:ml-64`}><div className={styles.shell}>
      <AccessBoundary key={session?.user?.email || "anonymous"}>{children}</AccessBoundary>
    </div></main>
    <MobileNav currentPage="admin" />
  </div>;
}
