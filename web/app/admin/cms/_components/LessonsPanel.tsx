"use client";
import styles from "../CmsWorkspace.module.css";
import CurriculumList from "./CurriculumList";
import type { Dispatch, SetStateAction } from "react";
import { Lesson } from "./model";

type Props = {
  basePath: string;
  selectedSection: number | null;
  createLesson: (e: React.FormEvent) => Promise<void>;
  lessonForm: { lesson_number: number; title: string; sort_order: number; };
  setLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  lessons: Lesson[];
  editingLesson: number | null;
  updateLesson: (e: React.FormEvent) => Promise<void>;
  editLessonForm: { lesson_number: number; title: string; sort_order: number; };
  setEditLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  cancelEditLesson: () => void;
  startEditLesson: (lesson: Lesson) => void;
  deleteLesson: (lessonId: number) => Promise<void>;
};

export default function LessonsPanel({
  basePath,
  selectedSection,
  createLesson,
  lessonForm,
  setLessonForm,
  lessons,
  editingLesson,
  updateLesson,
  editLessonForm,
  setEditLessonForm,
  cancelEditLesson,
  startEditLesson,
  deleteLesson,
}: Props) {
  return (
    <section className={styles.levelPanel}>
      <div className={styles.panelHeading}><h2 className={styles.panelTitle}>Сабақтар</h2><span className={styles.count}>{lessons.length}</span></div>
      {!selectedSection ? <p className={styles.hint}>Сабақтарды көру үшін бөлімді таңдаңыз.</p> : <>
        <details className={styles.disclosure}>
          <summary>Сабақ қосу</summary>
          <form onSubmit={createLesson} className={styles.form}>
            <label className={styles.field}>Сабақ нөмірі<input type="number" min={1} required value={lessonForm.lesson_number} onChange={(event) => setLessonForm({ ...lessonForm, lesson_number: Number(event.target.value) || 1 })} /></label>
            <label className={styles.field}>Сабақ атауы<input value={lessonForm.title} placeholder="Сабақ атауы" onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} /></label>
            <label className={styles.field}>Реті<input type="number" value={lessonForm.sort_order} onChange={(event) => setLessonForm({ ...lessonForm, sort_order: Number(event.target.value) || 0 })} /></label>
            <button type="submit" className={styles.primaryButton}>Сабақ құру</button>
          </form>
        </details>
        {editingLesson !== null && <form onSubmit={updateLesson} className={styles.form}>
          <h3 className={styles.panelTitle}>Сабақты өңдеу</h3>
          <label className={styles.field}>Сабақ нөмірі<input type="number" min={1} required value={editLessonForm.lesson_number} onChange={(event) => setEditLessonForm({ ...editLessonForm, lesson_number: Number(event.target.value) || 1 })} /></label>
          <label className={styles.field}>Атауы<input value={editLessonForm.title} onChange={(event) => setEditLessonForm({ ...editLessonForm, title: event.target.value })} /></label>
          <label className={styles.field}>Реті<input type="number" value={editLessonForm.sort_order} onChange={(event) => setEditLessonForm({ ...editLessonForm, sort_order: Number(event.target.value) || 0 })} /></label>
          <div className={styles.actions}><button type="submit" className={styles.primaryButton}>Сақтау</button><button type="button" className={styles.secondaryButton} onClick={cancelEditLesson}>Бас тарту</button></div>
        </form>}
        <CurriculumList openLabel="Кіші сабақтарды ашу"
          items={[...lessons].sort((a, b) => a.sort_order - b.sort_order || a.lesson_number - b.lesson_number || a.id - b.id).map((lesson) => ({
            id: lesson.id, title: lesson.title || `${lesson.lesson_number}-сабақ`, meta: lesson.title ? `${lesson.lesson_number}-сабақ` : undefined,
            href: `${basePath}/lessons/${lesson.id}`,
          }))}
          onEdit={(id) => { const lesson = lessons.find((item) => item.id === id); if (lesson) startEditLesson(lesson); }}
          onDelete={deleteLesson} />
        {lessons.length === 0 && <p className={styles.hint}>Бұл бөлімде сабақтар әлі жоқ. Жаңа сабақ қоса аласыз.</p>}
      </>}
    </section>
  );
}
