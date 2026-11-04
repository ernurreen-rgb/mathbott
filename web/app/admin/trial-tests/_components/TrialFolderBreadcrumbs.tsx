import Link from "next/link";
import { folderAncestors, trialFolderPath } from "@/lib/trial-folders";
import type { TrialTestFolder } from "@/types";
import styles from "../../cms/CmsWorkspace.module.css";

export default function TrialFolderBreadcrumbs({ folders, folderId, testTitle }: { folders: TrialTestFolder[]; folderId: number | null; testTitle?: string }) {
  const path = folderAncestors(folders, folderId);
  return <nav aria-label="Мазмұн жолы" className={`${styles.breadcrumbs} flex-wrap break-words`}>
    {path.length || testTitle ? <Link href="/admin/trial-tests">Сынақ тесттері</Link> : <span aria-current="page">Сынақ тесттері</span>}
    {path.map((folder, index) => <span key={folder.id} className="inline-flex min-w-0 items-center gap-2">
      <span className={styles.breadcrumbSeparator}>/</span>
      {index === path.length - 1 && !testTitle ? <span aria-current="page">{folder.name}</span> : <Link href={trialFolderPath(folder.id)}>{folder.name}</Link>}
    </span>)}
    {testTitle && <><span className={styles.breadcrumbSeparator}>/</span><span aria-current="page">{testTitle}</span></>}
  </nav>;
}
