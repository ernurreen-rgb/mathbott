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


export type QuestionType = "tf" | "mcq" | "mcq6" | "input" | "select";
export type AnswerMode = "choices" | "written";


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
  /** Set while the lesson waits for the mistake review of the lesson before it. */
  lock?: LessonLock | null;
  mini_lessons?: MiniLessonSummary[];
}

/** The lesson before still has mistakes to review; it names where that review starts. */
export interface LessonLock {
  lesson_id: number;
  lesson_title?: string | null;
  lesson_number?: number | null;
  mini_lesson_id: number;
  pending: number;
}

export interface NextLessonSummary {
  id: number;
  title?: string | null;
  lesson_number?: number | null;
  /** Closed until this lesson's mistakes are reviewed. */
  locked: boolean;
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
  accepted_answers?: string[] | null;
  question_type: QuestionType;
  answer_mode?: AnswerMode | null;
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
  review?: MiniLessonReviewSummary | null;
}


/** First-attempt mistakes of a completed mini-lesson and how far their review has got. */
export interface MiniLessonReviewSummary {
  mistakes: number;
  resolved: number;
  weak: number;
  pending: number;
}

export type MiniLessonReviewState = "pending" | "resolved" | "weak";

export interface MiniLessonReviewTask {
  bank_task_id: number;
  text: string;
  image_filename?: string | null;
  question_type: QuestionType;
  answer_mode?: AnswerMode | null;
  correct_count?: number | null;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
}

export interface MiniLessonReview {
  mini_lesson_id: number;
  lesson_id: number;
  summary: MiniLessonReviewSummary;
  items: Array<{ task_id: number; state: MiniLessonReviewState; attempts: number }>;
  /** Next task to solve: an unseen twin, or the original when the task has no twins. */
  current: {
    task_id: number;
    kind: "twin" | "original";
    position: number;
    attempt: number;
    task: MiniLessonReviewTask;
  } | null;
}

export interface MiniLessonReviewAnswerResult {
  correct: boolean;
  correct_answer: string | null;
  solution_filename: string | null;
  state: MiniLessonReviewState;
  has_next_twin: boolean;
  summary: MiniLessonReviewSummary;
}


export interface LessonDetails {
  id: number;
  module_id?: number | null;
  section_id: number;
  lesson_number?: number;
  title?: string;
  sort_order: number;
  progress?: LessonProgress;
  /** When set, tasks are withheld until the earlier lesson's mistakes are reviewed. */
  lock?: LessonLock | null;
  next_lesson?: NextLessonSummary | null;
  mini_lessons: LessonMiniLesson[];
}
