"use client";
import styles from "../CmsWorkspace.module.css";
import CurriculumList from "./CurriculumList";
import type { Dispatch, SetStateAction } from "react";
import { Module } from "./model";

type Props = {
  createModule: (e: React.FormEvent) => Promise<void>;
  moduleForm: { name: string; description: string; icon: string; sort_order: number; };
  setModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  modules: Module[];
  editingModule: number | null;
  updateModule: (e: React.FormEvent) => Promise<void>;
  editModuleForm: { name: string; description: string; icon: string; sort_order: number; };
  setEditModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  cancelEditModule: () => void;
  startEditModule: (module: Module) => void;
  deleteModule: (id: number) => Promise<void>;
};

export default function ModulesPanel({
  createModule,
  moduleForm,
  setModuleForm,
  modules,
  editingModule,
  updateModule,
  editModuleForm,
  setEditModuleForm,
  cancelEditModule,
  startEditModule,
  deleteModule,
}: Props) {
  return (
    <section className={styles.levelPanel}>
      <div className={styles.panelHeading}><h2 className={styles.panelTitle}>Модульдер</h2><span className={styles.count}>{modules.length}</span></div>
      {editingModule !== null && <form onSubmit={updateModule} className={styles.form}>
        <h3 className={styles.panelTitle}>Модульді өңдеу</h3>
        <label className={styles.field}>Атауы<input value={editModuleForm.name} required onChange={(event) => setEditModuleForm({ ...editModuleForm, name: event.target.value })} /></label>
        <label className={styles.field}>Сипаттамасы<textarea rows={2} value={editModuleForm.description} onChange={(event) => setEditModuleForm({ ...editModuleForm, description: event.target.value })} /></label>
        <div className={styles.formColumns}>
          <label className={styles.field}>Белгіше<input value={editModuleForm.icon} onChange={(event) => setEditModuleForm({ ...editModuleForm, icon: event.target.value })} /></label>
          <label className={styles.field}>Реті<input type="number" value={editModuleForm.sort_order} onChange={(event) => setEditModuleForm({ ...editModuleForm, sort_order: Number(event.target.value) || 0 })} /></label>
        </div>
        <div className={styles.actions}><button className={styles.primaryButton} type="submit">Сақтау</button><button className={styles.secondaryButton} type="button" onClick={cancelEditModule}>Бас тарту</button></div>
      </form>}
      <details className={styles.disclosure}>
        <summary>Модуль қосу</summary>
        <form onSubmit={createModule} className={styles.form}>
          <label className={styles.field}>Модуль атауы<input value={moduleForm.name} required placeholder="Модуль атауы" onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })} /></label>
          <label className={styles.field}>Сипаттамасы<textarea rows={2} value={moduleForm.description} onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })} /></label>
          <div className={styles.formColumns}>
            <label className={styles.field}>Белгіше<input value={moduleForm.icon} placeholder="Эмодзи" onChange={(event) => setModuleForm({ ...moduleForm, icon: event.target.value })} /></label>
            <label className={styles.field}>Реті<input type="number" value={moduleForm.sort_order} onChange={(event) => setModuleForm({ ...moduleForm, sort_order: Number(event.target.value) || 0 })} /></label>
          </div>
          <button type="submit" className={styles.primaryButton}>Модуль құру</button>
        </form>
      </details>
      <CurriculumList openLabel="Бөлімдерді ашу"
        items={[...modules].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((module) => ({
          id: module.id, title: module.name, description: module.description,
          href: `/admin/cms/modules/${module.id}`,
        }))}
        onEdit={(id) => { const selected = modules.find((item) => item.id === id); if (selected) startEditModule(selected); }}
        onDelete={deleteModule} />
      {modules.length === 0 && <p className={styles.hint}>Модульдер әлі жоқ. Алғашқы модульді қосыңыз.</p>}
    </section>
  );
}
