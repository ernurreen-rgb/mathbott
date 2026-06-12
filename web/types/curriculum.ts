import type { BankDifficulty, TaskTextScale } from "./bank";


// Module System Types
export interface Progress {
  completed: boolean;
  total: number;
  completed_count: number;
  progress: number;
}


export interface SectionProgress extends Progress {
  total_sections?: number;
  completed_sections?: number;
}


export type QuestionType = "tf" | "mcq" | "mcq6" | "input" | "select" | "factor_grid";


export interface LessonProgress {
  completed: boolean;
  total_mini_lessons: number;
  completed_mini_lessons: number;
  progress: number;
}


export interface MiniLessonSummary {
  id: number;
  mini_index: number;
  title?: string;
  progress?: Progress;
}


export interface LessonSummary {
  id: number;
  lesson_number?: number;
  title?: string;
  sort_order: number;
  progress?: LessonProgress;
  mini_lessons?: MiniLessonSummary[];
}


export interface Module {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  progress?: ModuleProgress;
  sections?: Section[];
}


export interface ModuleProgress {
  completed: boolean;
  total_sections: number;
  completed_sections: number;
  total_lessons?: number;
  completed_lessons?: number;
  progress: number;
}


export interface Section {
  id: number;
  name: string;
  sort_order: number;
  description?: string;
  guide?: string;
  progress?: Progress;
  lessons?: LessonSummary[];
}


export interface ModuleDetails {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  sections: Section[];
}


export interface LessonTaskOption {
  label: string; // "A" through "H" for MCQ, "A" through "D" for select
  text: string;
}


export interface LessonTaskSubquestion {
  text: string;
  correct?: string; // "A" | "B" | "C" | "D"
}


export interface LessonTask {
  id: number;
  text: string;
  answer?: string;
  question_type: QuestionType;
  correct_count?: number | null;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
  image_filename?: string | null;
  solution_filename?: string | null;
  bank_task_id?: number | null;
  bank_difficulty?: BankDifficulty | null;
  bank_topics?: string[];
  sort_order: number;
  status?: "not_started" | "in_progress" | "completed";
}


export interface LessonMiniLesson extends MiniLessonSummary {
  tasks: LessonTask[];
}


export interface LessonDetails {
  id: number;
  module_id?: number | null;
  section_id: number;
  lesson_number?: number;
  title?: string;
  sort_order: number;
  progress?: LessonProgress;
  mini_lessons: LessonMiniLesson[];
}
