"use client";

import { useState, type FormEvent } from "react";
import { createTrialTest, updateTrialTest } from "@/lib/api";
import type { TrialTest } from "@/types";
import CmsDialog from "../../cms/_components/CmsDialog";
import styles from "../../cms/CmsWorkspace.module.css";
import { useTrialTests } from "./TrialTestsProvider";
import { folderLabel, sortFolders } from "@/lib/trial-folders";

export default function TrialTestFormDialog({ test, folderId, onClose }: {
  test?: TrialTest; folderId?: number; onClose: () => void;
}) {
  const { email, folders, refreshTests } = useTrialTests();
  const leaves = folders.filter((f) => f.child_count === 0).sort(sortFolders);
  const [form, setForm] = useState({ title: test?.title || "", description: test?.description || "",
    folderId: test?.folder_id ?? folderId ?? leaves[0]?.id ?? "", sort_order: test?.sort_order || 0,
    expected_tasks_count: test?.expected_tasks_count || 40 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || saving || !form.folderId) return;
    setSaving(true); setError(null);
    try {
      const args = [form.title.trim(), form.description, form.sort_order, form.expected_tasks_count, email, undefined, Number(form.folderId)] as const;
      const result = test ? await updateTrialTest(test.id, ...args) : await createTrialTest(...args);
      if (result.error) { setError(result.error); return; }
      await refreshTests(); onClose();
    } catch { setError("Тестті сақтау мүмкін болмады."); }
    finally { setSaving(false); }
  };

  return <CmsDialog open title={test ? "Тестті өңдеу" : "Жаңа тест"} error={error} onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={submit} className={styles.taskForm}>
      <fieldset disabled={saving} className="grid min-w-0 gap-4">
        <label className={styles.field}>Атауы<input autoFocus required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className={styles.field}>Папка<select required value={form.folderId} onChange={(e) => setForm({ ...form, folderId: Number(e.target.value) })}>
          <option value="" disabled>Папканы таңдаңыз</option>
          {leaves.map((folder) => <option key={folder.id} value={folder.id}>{folderLabel(folders, folder.id)}</option>)}
        </select></label>
        {leaves.length === 0 && <p>Алдымен папка қосыңыз.</p>}
        <label className={styles.field}>Сипаттамасы<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className={styles.formColumns}>
          <label className={styles.field}>Тапсырма саны<input type="number" required min={1} step={1} value={form.expected_tasks_count} onChange={(e) => setForm({ ...form, expected_tasks_count: Number(e.target.value) })} /></label>
          <label className={styles.field}>Реті<input type="number" required step={1} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></label>
        </div>
        <div className={styles.actions}><button className={styles.primaryButton} type="submit">{saving ? "Сақталуда..." : "Сақтау"}</button><button className={styles.secondaryButton} type="button" onClick={onClose}>Бас тарту</button></div>
      </fieldset>
    </form>
  </CmsDialog>;
}
