import type { TrialTestFolder } from "@/types";

export const trialFolderPath = (id: number) => `/admin/trial-tests/folder/${id}`;

export function folderAncestors(folders: TrialTestFolder[], id: number | null): TrialTestFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: TrialTestFolder[] = [];
  const seen = new Set<number>();
  let folder = id === null ? undefined : byId.get(id);
  while (folder && !seen.has(folder.id)) {
    path.push(folder);
    seen.add(folder.id);
    folder = folder.parent_id === null ? undefined : byId.get(folder.parent_id);
  }
  return path.reverse();
}

export const folderLabel = (folders: TrialTestFolder[], id: number) => folderAncestors(folders, id).map((f) => f.name).join(" / ");
export const sortFolders = (a: TrialTestFolder, b: TrialTestFolder) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "kk") || a.id - b.id;

export function folderMoveTargets(folders: TrialTestFolder[], id: number) {
  return folders.filter((folder) => !folder.direct_test_count && !folderAncestors(folders, folder.id).some((f) => f.id === id));
}

/**
 * Resolve initial folder selection for TrialTestFormDialog.
 * When editing an existing root test (`folder_id === null`), preserve `""` so saving
 * metadata never silently moves the root test into the first leaf folder (H-35).
 */
export function resolveInitialTrialTestFolderId(
  test: { folder_id?: number | null } | undefined,
  folderId: number | undefined,
  leaves: Array<{ id: number }>
): number | "" {
  if (test) {
    return test.folder_id ?? "";
  }
  return folderId ?? leaves[0]?.id ?? "";
}
