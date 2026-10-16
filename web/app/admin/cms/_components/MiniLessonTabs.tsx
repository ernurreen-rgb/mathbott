"use client";

import Link from "next/link";
import { useState } from "react";
import type { MiniLesson } from "./model";
import { formatMiniLessonTitle } from "./model";
import CurriculumList from "./CurriculumList";
import styles from "../CmsWorkspace.module.css";

type Props = {
  miniLessons: MiniLesson[]; selectedMiniLesson: number | null; basePath: string;
  variant: "list" | "tabs"; onRename: (id: number, title: string) => Promise<boolean | void>;
};

export default function MiniLessonTabs({ miniLessons, selectedMiniLesson, basePath, variant, onRename }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const sorted = [...miniLessons].sort((a, b) => a.mini_index - b.mini_index);
  if (variant === "tabs") return (
    <nav className={styles.miniPanel} aria-label="Кіші сабақтар">
      <div className={styles.miniTabs}>
        {sorted.map((mini) => <Link key={mini.id} href={`${basePath}/mini-lessons/${mini.id}`}
          aria-current={mini.id === selectedMiniLesson ? "page" : undefined}
          className={`${styles.miniTab} ${mini.id === selectedMiniLesson ? styles.miniTabActive : ""}`}>
          {formatMiniLessonTitle(mini)}
        </Link>)}
      </div>
    </nav>
  );
  return (
    <section className={styles.levelPanel}>
      <div className={styles.panelHeading}><h2 className={styles.panelTitle}>Кіші сабақтар</h2><span className={styles.count}>{miniLessons.length}</span></div>
      {editing !== null && <form className={styles.form} onSubmit={async (event) => { event.preventDefault(); if (title.trim() && await onRename(editing, title.trim())) setEditing(null); }}>
        <label className={styles.field}>Кіші сабақ атауы<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className={styles.actions}><button type="submit" className={styles.primaryButton}>Сақтау</button><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Бас тарту</button></div>
      </form>}
      <CurriculumList openLabel="Тапсырмаларды ашу" items={sorted.map((mini) => ({
        id: mini.id, title: formatMiniLessonTitle(mini), meta: mini.title && mini.title !== String(mini.mini_index) ? `${mini.mini_index}-кіші сабақ` : undefined,
        href: `${basePath}/mini-lessons/${mini.id}`,
      }))} onEdit={(id) => { const mini = miniLessons.find((item) => item.id === id); if (mini) { setEditing(id); setTitle(mini.title || ""); } }} />
      {miniLessons.length === 0 && <p className={styles.hint}>Кіші сабақтар жүктелуде...</p>}
    </section>
  );
}
