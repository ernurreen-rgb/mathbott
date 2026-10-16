"use client";

import Link from "next/link";
import { useState } from "react";
import type { MiniLesson } from "./model";
import { formatMiniLessonTitle } from "./model";
import styles from "../CmsWorkspace.module.css";

type Props = {
  miniLessons: MiniLesson[]; selectedMiniLesson: number | null; basePath: string;
  onRename: (id: number, title: string) => Promise<boolean | void>;
};

export default function MiniLessonTabs({ miniLessons, selectedMiniLesson, basePath, onRename }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const sorted = [...miniLessons].sort((a, b) => a.mini_index - b.mini_index || a.id - b.id);
  const selected = miniLessons.find((mini) => mini.id === selectedMiniLesson);
  return (
    <>
      <nav className={styles.miniPanel} aria-label="Кіші сабақтар">
        <div className={styles.miniTabs}>
          {sorted.map((mini) => <Link key={mini.id} href={`${basePath}/mini-lessons/${mini.id}`}
            aria-current={mini.id === selectedMiniLesson ? "page" : undefined}
            className={`${styles.miniTab} ${mini.id === selectedMiniLesson ? styles.miniTabActive : ""}`}>
            {formatMiniLessonTitle(mini)}
          </Link>)}
        </div>
        {selected && <button type="button" className={styles.textButton} onClick={() => {
          setEditing(selected.id);
          setTitle(formatMiniLessonTitle(selected));
        }}>Атауын өңдеу</button>}
      </nav>
      {editing !== null && <form className={styles.form} onSubmit={async (event) => { event.preventDefault(); if (title.trim() && await onRename(editing, title.trim())) setEditing(null); }}>
        <label className={styles.field}>Кіші сабақ атауы<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className={styles.actions}><button type="submit" className={styles.primaryButton}>Сақтау</button><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Бас тарту</button></div>
      </form>}
    </>
  );
}
