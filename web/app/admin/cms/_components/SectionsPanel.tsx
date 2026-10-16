"use client";
import styles from "../CmsWorkspace.module.css";
import CurriculumList from "./CurriculumList";
import type { Dispatch, SetStateAction } from "react";
import { Section } from "./model";

type Props = {
  selectedModule: number | null;
  createSection: (e: React.FormEvent) => Promise<void>;
  sectionForm: { name: string; description: string; sort_order: number; };
  setSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  sections: Section[];
  editingSection: number | null;
  updateSection: (e: React.FormEvent) => Promise<void>;
  editSectionForm: { name: string; description: string; sort_order: number; };
  setEditSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  cancelEditSection: () => void;
  startEditSection: (section: Section) => void;
  deleteSection: (id: number) => Promise<void>;
};

export default function SectionsPanel({
  selectedModule,
  createSection,
  sectionForm,
  setSectionForm,
  sections,
  editingSection,
  updateSection,
  editSectionForm,
  setEditSectionForm,
  cancelEditSection,
  startEditSection,
  deleteSection,
}: Props) {
  return (
    <section className={styles.levelPanel}>
      <div className={styles.panelHeading}><h2 className={styles.panelTitle}>Бөлімдер</h2><span className={styles.count}>{sections.length}</span></div>
      {editingSection !== null && <form onSubmit={updateSection} className={styles.form}>
        <h3 className={styles.panelTitle}>Бөлімді өңдеу</h3>
        <label className={styles.field}>Атауы<input required value={editSectionForm.name} onChange={(event) => setEditSectionForm({ ...editSectionForm, name: event.target.value })} /></label>
        <label className={styles.field}>Сипаттамасы<textarea rows={2} value={editSectionForm.description} onChange={(event) => setEditSectionForm({ ...editSectionForm, description: event.target.value })} /></label>
        <label className={styles.field}>Реті<input type="number" value={editSectionForm.sort_order} onChange={(event) => setEditSectionForm({ ...editSectionForm, sort_order: Number(event.target.value) || 0 })} /></label>
        <div className={styles.actions}><button type="submit" className={styles.primaryButton}>Сақтау</button><button type="button" className={styles.secondaryButton} onClick={cancelEditSection}>Бас тарту</button></div>
      </form>}
      {selectedModule && <details className={styles.disclosure}>
        <summary>Бөлім қосу</summary>
        <form onSubmit={createSection} className={styles.form}>
          <label className={styles.field}>Бөлім атауы<input required value={sectionForm.name} placeholder="Бөлім атауы" onChange={(event) => setSectionForm({ ...sectionForm, name: event.target.value })} /></label>
          <label className={styles.field}>Сипаттамасы<textarea rows={2} value={sectionForm.description} onChange={(event) => setSectionForm({ ...sectionForm, description: event.target.value })} /></label>
          <label className={styles.field}>Реті<input type="number" value={sectionForm.sort_order} onChange={(event) => setSectionForm({ ...sectionForm, sort_order: Number(event.target.value) || 0 })} /></label>
          <button type="submit" className={styles.primaryButton}>Бөлім құру</button>
        </form>
      </details>}
      <CurriculumList openLabel="Сабақтарды ашу"
        items={[...sections].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((section) => ({
          id: section.id, title: section.name, description: section.description,
          href: `/admin/cms/modules/${selectedModule}/sections/${section.id}`,
        }))}
        onEdit={(id) => { const section = sections.find((item) => item.id === id); if (section) startEditSection(section); }}
        onDelete={deleteSection} />
      {sections.length === 0 && <p className={styles.hint}>Бұл модульде бөлімдер әлі жоқ.</p>}
    </section>
  );
}
