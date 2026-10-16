"use client";

import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { isAllowedForPage } from "@/lib/admin-access";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { CmsCacheProvider } from "./_components/CmsCache";
import CmsSkeleton from "./_components/CmsSkeleton";
import styles from "./CmsWorkspace.module.css";

function CmsAccessBoundary({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { access, loading } = useAdminPageAccess("content", status, session?.user?.email);
  if (status === "loading" || loading) return <CmsSkeleton kind="page" label="CMS жүктелуде..." />;
  if (!session || !access?.is_admin || !isAllowedForPage("content", access.role)) {
    return <p className={styles.hint}>CMS-ке қолжетімділік жоқ.</p>;
  }
  return <CmsCacheProvider>{children}</CmsCacheProvider>;
}

export default function CmsLayout({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  return (
    <div className={styles.page}>
      <DesktopNav />
      <main className={`${styles.main} md:ml-64`}>
        <div className={styles.shell}>
          <CmsAccessBoundary key={session?.user?.email || "anonymous"}>{children}</CmsAccessBoundary>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}
