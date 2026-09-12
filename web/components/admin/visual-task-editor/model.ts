import { LessonTask } from "@/types";

export type CropPercent = { left: number; top: number; width: number; height: number };

export const MIN_CROP_PCT = 5;

export const HANDLES = ["tl", "t", "tr", "r", "br", "b", "bl", "l"] as const;

export interface VisualTaskEditorProps {
  tasks: LessonTask[];
  onSave: (task: Partial<LessonTask> & { imageFile?: File | null; removeImage?: boolean }) => Promise<void>;
  onAdd: () => void;
  onDelete: (taskId: number) => Promise<void>;
  context: "trial-test" | "mini-lesson";
  showBankMetadata?: boolean;
  testIdOrMiniLessonId?: number;
  email: string;
}
