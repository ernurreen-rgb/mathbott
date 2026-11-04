"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { deleteTrialTest, deleteTrialTestFolder } from "@/lib/api";
import type { TrialTest, TrialTestFolder } from "@/types";
import { sortFolders, trialFolderPath } from "@/lib/trial-folders";
import CmsSkeleton from "../../cms/_components/CmsSkeleton";
import styles from "../../cms/CmsWorkspace.module.css";
import local from "../TrialTests.module.css";
import TrialTestFormDialog from "./TrialTestFormDialog";
import TrialFolderDialog, { type FolderAction } from "./TrialFolderDialog";
import TrialFolderBreadcrumbs from "./TrialFolderBreadcrumbs";
import { normalizeCategory, useTrialTests } from "./TrialTestsProvider";

export default function TrialTestsCatalog({ folderId, category }: { folderId?: number; category?: string }) {
  const { email, tests, folders, loading, error, refreshTests } = useTrialTests();
  const router = useRouter();
  const [dialog, setDialog] = useState<"create" | TrialTest | null>(null);
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selectedId = folderId ?? (category === undefined ? null : folders.find((f) => f.parent_id === null && f.name === normalizeCategory(category))?.id ?? -1);
  const folder = folders.find((f) => f.id === selectedId) || null;
  const children = folders.filter((f) => f.parent_id === selectedId).sort(sortFolders);
  const leaves = folders.some((f) => f.child_count === 0);
  const filtered = tests.filter((test) => test.folder_id === selectedId && test.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  useEffect(() => {
    if (category !== undefined && folder) router.replace(trialFolderPath(folder.id));
  }, [category, folder, router]);

  const remove = async (item: TrialTest | TrialTestFolder, isFolder: boolean) => {
    const name = "title" in item ? item.title : item.name;
    if (!email || deleting || !confirm(`«${name}» ${isFolder ? "папкасын" : "тестін"} жою керек пе?`)) return;
    setDeleting(`${isFolder ? "folder" : "test"}-${item.id}`); setActionError(null);
    try {
      const result = isFolder ? await deleteTrialTestFolder(item.id, email) : await deleteTrialTest(item.id, email);
      if (result.error) setActionError(result.error);
      else await refreshTests();
    } catch { setActionError("Жою мүмкін болмады."); }
    finally { setDeleting(null); }
  };

  if (!loading && !error && selectedId !== null && !folder) return <div className={styles.empty}><h1>Папка табылмады</h1><Link href="/admin/trial-tests">Папкаларға оралу</Link></div>;

  return <>
    <TrialFolderBreadcrumbs folders={folders} folderId={selectedId} />
    <header className={styles.header}><h1 className={styles.title}>{folder?.name || "Сынақ тесттері"}</h1><div className={styles.actions}>
      {folder && <Link href={folder.parent_id === null ? "/admin/trial-tests" : trialFolderPath(folder.parent_id)} className={styles.textButton}><Icon name="arrowLeft" />Артқа</Link>}
      <Link href="/admin/bank" className={styles.textButton}><Icon name="folder" />Банк</Link>
    </div></header>
    {(actionError || error) && <div className={styles.error} role="alert">{actionError || error}<button type="button" className={styles.textButton} onClick={() => void refreshTests()}>Қайта жүктеу</button></div>}
    {loading ? <CmsSkeleton /> : <section>
      <div className={local.catalogToolbar}>
        <div className={styles.actions}><h2 className={styles.panelTitle}>{children.length || !folder ? "Папкалар" : "Тесттер"}</h2><span className={styles.count}>{children.length || filtered.length}</span></div>
        <div className={styles.actions}>
          {folder && !folder.child_count && <input type="search" aria-label="Тест іздеу" placeholder="Тест іздеу" className={local.search} value={search} onChange={(e) => setSearch(e.target.value)} />}
          <button type="button" className={styles.secondaryButton} onClick={() => setFolderAction({ mode: "create", parent: folder })}><Icon name="plus" />Папка қосу</button>
          {(!folder || !folder.child_count) && <button type="button" disabled={!leaves} className={styles.primaryButton} onClick={() => { setActionError(null); setDialog("create"); }}><Icon name="plus" />Тест қосу</button>}
        </div>
      </div>
      {children.length > 0 && <div className={styles.curriculumList}>
        <div className={styles.listHeading} aria-hidden="true"><span>Папка</span><span>Әрекеттер</span></div>
        <ul>{children.map((item) => <li className={styles.curriculumRow} key={item.id}>
          <Link className={styles.itemLink} href={trialFolderPath(item.id)}><div className={local.folderName}><Icon name="folder" size={22} className="text-slate-500" /><h3>{item.name}</h3></div><span className={styles.itemOpen}>{item.test_count} тест<Icon name="arrowRight" size={16} /></span></Link>
          <div className={styles.rowActions}>
            <button type="button" className={styles.textButton} aria-label={`${item.name} папкасын өңдеу`} onClick={() => setFolderAction({ mode: "rename", folder: item })}><Icon name="edit" size={15} />Өңдеу</button>
            <button type="button" className={styles.textButton} aria-label={`${item.name} папкасын көшіру`} onClick={() => setFolderAction({ mode: "move", folder: item })}>Көшіру</button>
            <button type="button" disabled={deleting !== null || item.child_count > 0 || item.direct_test_count > 0} className={styles.dangerButton} aria-label={`${item.name} папкасын жою`} onClick={() => void remove(item, true)}><Icon name="trash" size={15} />Жою</button>
          </div>
        </li>)}</ul>
      </div>}
      {filtered.length > 0 ? <div className={styles.curriculumList}>
        <div className={styles.listHeading} aria-hidden="true"><span>Тест атауы</span><span>Әрекеттер</span></div>
        <ul>{filtered.map((test) => <li className={styles.curriculumRow} key={test.id}>
          <Link className={styles.itemLink} href={`/admin/trial-tests/${test.id}`}><div className={styles.itemContent}><h3>{test.title}</h3><p>{test.task_count || 0} / {test.expected_tasks_count || 40} тапсырма{test.description ? ` · ${test.description}` : ""}</p></div><span className={styles.itemOpen}>Тапсырмалар<Icon name="arrowRight" size={16} /></span></Link>
          <div className={styles.rowActions}><button type="button" className={styles.textButton} aria-label={`${test.title} өңдеу`} onClick={() => setDialog(test)}><Icon name="edit" size={15} />Өңдеу</button><button type="button" disabled={deleting !== null} className={styles.dangerButton} aria-label={`${test.title} жою`} onClick={() => void remove(test, false)}><Icon name="trash" size={15} />Жою</button></div>
        </li>)}</ul>
      </div> : children.length === 0 && <div className={styles.empty}><h3>{search ? "Тест табылмады" : folder ? "Бұл папкада тесттер жоқ" : "Папкалар әлі жоқ"}</h3><p>{search ? "Басқа атаумен іздеп көріңіз." : "Папка немесе тест қосуға болады."}</p></div>}
    </section>}
    {dialog && <TrialTestFormDialog test={dialog === "create" ? undefined : dialog} folderId={folder?.id} onClose={() => setDialog(null)} />}
    {folderAction && <TrialFolderDialog action={folderAction} onClose={() => setFolderAction(null)} />}
  </>;
}
