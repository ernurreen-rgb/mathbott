"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { deleteTrialTest } from "@/lib/api";
import type { TrialTest } from "@/types";
import CmsSkeleton from "../../cms/_components/CmsSkeleton";
import styles from "../../cms/CmsWorkspace.module.css";
import local from "../TrialTests.module.css";
import TrialTestFormDialog from "./TrialTestFormDialog";
import { normalizeCategory, trialFolderPath, useTrialTests } from "./TrialTestsProvider";

export default function TrialTestsCatalog({ category }: { category?: string }) {
  const { email, tests, loading, error, refreshTests } = useTrialTests();
  const [dialog, setDialog] = useState<"create" | TrialTest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const folder = category === undefined ? undefined : normalizeCategory(category);
  const folders = useMemo(() => {
    const counts = new Map<string, number>([["Жалпы", 0]]);
    for (const test of tests) { const name = normalizeCategory(test.category); counts.set(name, (counts.get(name) || 0) + 1); }
    return [...counts].sort(([a], [b]) => a.localeCompare(b, "kk"));
  }, [tests]);
  const filtered = tests.filter((test) => normalizeCategory(test.category) === folder && test.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const remove = async (test: TrialTest) => {
    if (!email || deleting || !confirm(`«${test.title}» тестін жою керек пе?`)) return;
    setDeleting(test.id); setActionError(null);
    try {
      const result = await deleteTrialTest(test.id, email);
      if (result.error) setActionError(result.error);
      else await refreshTests();
    } catch { setActionError("Тестті жою мүмкін болмады."); }
    finally { setDeleting(null); }
  };

  return <>
    <nav aria-label="Мазмұн жолы" className={styles.breadcrumbs}>
      {folder ? <><Link href="/admin/trial-tests">Сынақ тесттері</Link><span className={styles.breadcrumbSeparator}>/</span><span aria-current="page">{folder}</span></> : <span aria-current="page">Сынақ тесттері</span>}
    </nav>
    <header className={styles.header}><h1 className={styles.title}>{folder || "Сынақ тесттері"}</h1><div className={styles.actions}>
      {folder && <Link href="/admin/trial-tests" className={styles.textButton}><Icon name="arrowLeft" />Папкалар</Link>}
      <Link href="/admin/bank" className={styles.textButton}><Icon name="folder" />Банк</Link>
    </div></header>
    {(actionError || error) && <div className={styles.error} role="alert">{actionError || error}<button type="button" className={styles.textButton} onClick={() => void refreshTests()}>Қайта жүктеу</button></div>}
    {loading ? <CmsSkeleton /> : <section>
      <div className={local.catalogToolbar}>
        <div className={styles.actions}><h2 className={styles.panelTitle}>{folder ? "Тесттер" : "Папкалар"}</h2><span className={styles.count}>{folder ? filtered.length : folders.length}</span></div>
        <div className={styles.actions}>
          {folder && <input type="search" aria-label="Тест іздеу" placeholder="Тест іздеу" className={local.search} value={search} onChange={(e) => setSearch(e.target.value)} />}
          <button type="button" className={styles.primaryButton} onClick={() => { setActionError(null); setDialog("create"); }}><Icon name="plus" />Тест қосу</button>
        </div>
      </div>
      {folder === undefined ? <div className={styles.curriculumList}>
        <div className={styles.listHeading} aria-hidden="true"><span>Папка</span><span>Тесттер</span></div>
        <ul>{folders.map(([name, count]) => <li className={styles.curriculumRow} key={name}>
          <Link className={styles.itemLink} href={trialFolderPath(name)}><div className={local.folderName}><Icon name="folder" size={22} className="text-slate-500" /><h3>{name}</h3></div><span className={styles.itemOpen}>{count} тест<Icon name="arrowRight" size={16} /></span></Link>
        </li>)}</ul>
      </div> : <>
        {filtered.length > 0 ? <div className={styles.curriculumList}>
          <div className={styles.listHeading} aria-hidden="true"><span>Тест атауы</span><span>Әрекеттер</span></div>
          <ul>{filtered.map((test) => <li className={styles.curriculumRow} key={test.id}>
            <Link className={styles.itemLink} href={`/admin/trial-tests/${test.id}`}><div className={styles.itemContent}><h3>{test.title}</h3><p>{test.task_count || 0} / {test.expected_tasks_count || 40} тапсырма{test.description ? ` · ${test.description}` : ""}</p></div><span className={styles.itemOpen}>Тапсырмалар<Icon name="arrowRight" size={16} /></span></Link>
            <div className={styles.rowActions}><button type="button" className={styles.textButton} aria-label={`${test.title} өңдеу`} onClick={() => setDialog(test)}><Icon name="edit" size={15} />Өңдеу</button><button type="button" disabled={deleting !== null} className={styles.dangerButton} aria-label={`${test.title} жою`} onClick={() => void remove(test)}><Icon name="trash" size={15} />{deleting === test.id ? "Жойылуда..." : "Жою"}</button></div>
          </li>)}</ul>
        </div> : <div className={styles.empty}><h3>{search ? "Тест табылмады" : "Бұл папкада тесттер жоқ"}</h3><p>{search ? "Басқа атаумен іздеп көріңіз." : "Жаңа тест қосуға немесе тестті өңдеу арқылы осы папкаға ауыстыруға болады."}</p></div>}
      </>}
    </section>}
    {dialog && <TrialTestFormDialog test={dialog === "create" ? undefined : dialog} category={folder} onClose={() => setDialog(null)} />}
  </>;
}
