"use client";

import { useState, type FormEvent } from "react";
import type { TrialTestFolder } from "@/types";
import { saveTrialTestFolder } from "@/lib/api";
import { folderLabel, folderMoveTargets, sortFolders } from "@/lib/trial-folders";
import CmsDialog from "../../cms/_components/CmsDialog";
import styles from "../../cms/CmsWorkspace.module.css";
import { useTrialTests } from "./TrialTestsProvider";

export type FolderAction = { mode: "create"; parent: TrialTestFolder | null } | { mode: "rename" | "move"; folder: TrialTestFolder };

export default function TrialFolderDialog({ action, onClose }: { action: FolderAction; onClose: () => void }) {
  const { email, folders, refreshTests } = useTrialTests();
  const folder = action.mode === "create" ? undefined : action.folder;
  const [name, setName] = useState(folder?.name || "");
  const [order, setOrder] = useState(folder?.sort_order || 0);
  const [parentId, setParentId] = useState(folder?.parent_id === null ? "" : String(folder?.parent_id || ""));
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = action.mode === "create" ? action.parent?.direct_test_count || 0 : 0;
  const title = action.mode === "create" ? "Жаңа папка" : action.mode === "rename" ? "Папканы өңдеу" : "Папканы көшіру";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || saving || (count > 0 && !confirmed)) return;
    setSaving(true); setError(null);
    try {
      const payload = action.mode === "move" ? { parent_id: parentId ? Number(parentId) : null }
        : action.mode === "create" ? { name: name.trim(), sort_order: order, parent_id: action.parent?.id ?? null, move_existing_tests: confirmed }
        : { name: name.trim(), sort_order: order };
      const result = await saveTrialTestFolder(email, payload, folder?.id);
      if (result.error) { setError(result.error); return; }
      await refreshTests(); onClose();
    } catch { setError("Папканы сақтау мүмкін болмады."); }
    finally { setSaving(false); }
  };

  return <CmsDialog open title={title} error={error} onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={submit} className={styles.taskForm}><fieldset disabled={saving} className="grid min-w-0 gap-4">
      {action.mode === "move" ? <label className={styles.field}>Қайда көшіру керек<select value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Сынақ тесттері (негізгі деңгей)</option>
        {folderMoveTargets(folders, action.folder.id).sort(sortFolders).map((item) => <option key={item.id} value={item.id}>{folderLabel(folders, item.id)}</option>)}
      </select></label> : <>
        <label className={styles.field}>Папка атауы<input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className={styles.field}>Реті<input type="number" required step={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} /></label>
      </>}
      {count > 0 && <label className="flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
        <span>Қазіргі {count} тест жаңа «{name.trim() || "…"}» ішкі папкасына көшіріледі. Көшіруді растаймын.</span>
      </label>}
      <div className={styles.actions}><button type="submit" className={styles.primaryButton}>{saving ? "Сақталуда..." : "Сақтау"}</button><button type="button" className={styles.secondaryButton} onClick={onClose}>Бас тарту</button></div>
    </fieldset></form>
  </CmsDialog>;
}
