import { folderAncestors, folderLabel, folderMoveTargets } from "../trial-folders";
import type { TrialTestFolder } from "@/types";

const folders: TrialTestFolder[] = [
  { id: 1, name: "Алгебра / Геометрия", parent_id: null, sort_order: 0, test_count: 1, direct_test_count: 0, child_count: 1 },
  { id: 2, name: "Модуль", parent_id: 1, sort_order: 0, test_count: 1, direct_test_count: 0, child_count: 1 },
  { id: 3, name: "Тесттер", parent_id: 2, sort_order: 0, test_count: 1, direct_test_count: 1, child_count: 0 },
  { id: 4, name: "Бос", parent_id: null, sort_order: 0, test_count: 0, direct_test_count: 0, child_count: 0 },
];

it("builds the full path from parent IDs without parsing slashes in names", () => {
  expect(folderAncestors(folders, 3).map((f) => f.id)).toEqual([1, 2, 3]);
  expect(folderLabel(folders, 3)).toBe("Алгебра / Геометрия / Модуль / Тесттер");
});

it("excludes the folder, descendants and test-bearing destinations when moving", () => {
  expect(folderMoveTargets(folders, 2).map((f) => f.id)).toEqual([1, 4]);
  expect(folderMoveTargets(folders, 1).map((f) => f.id)).toEqual([4]);
});
