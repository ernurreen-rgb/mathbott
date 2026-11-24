/** Task constructor (/constructor): bank tasks a user collects and downloads as PDF or PPTX. */

export type ConstructorQuestionType = "input" | "tf" | "mcq" | "mcq6" | "select";

export interface ConstructorTask {
  id: number;
  text: string;
  text_scale: string;
  question_type: ConstructorQuestionType;
  answer_mode: "choices" | "written";
  difficulty: "A" | "B" | "C";
  topics: string[];
  image_filename: string | null;
  options: { label: string; text: string }[];
  subquestions: { text: string; correct?: string }[];
  /** Only in a collection's export, for the answer key. */
  answer?: string;
  accepted_answers?: string[];
}

export interface ConstructorTaskPage {
  items: ConstructorTask[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface TaskCollectionSummary {
  id: number;
  title: string;
  header_text: string;
  /** The PowerPoint font, one of lib/pptx/fonts.ts PPTX_FONTS. */
  pptx_font: string;
  title_image: string | null;
  background_image: string | null;
  created_at: string | null;
  updated_at: string | null;
  task_count?: number;
}

export interface TaskCollection extends TaskCollectionSummary {
  tasks: ConstructorTask[];
}

export interface TaskCollectionList {
  items: TaskCollectionSummary[];
  max_collections: number;
  max_tasks: number;
}

export type TaskCollectionImageKind = "title" | "background";
