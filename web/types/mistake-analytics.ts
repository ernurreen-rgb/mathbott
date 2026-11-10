import type { QuestionType } from "./curriculum";

export type MistakeAnalyticsPeriod = "7d" | "30d" | "all";

/** Review outcome counts: resolved on a twin, weak after all twins, or not reviewed yet. */
export interface MistakeReviewCounts {
  mistakes: number;
  resolved: number;
  weak: number;
  pending: number;
}

export interface MistakeAnalyticsTask extends MistakeReviewCounts {
  task_id: number;
  bank_task_id: number;
  text_preview: string;
  question_type: QuestionType;
  topics: string[];
  location: {
    module_id: number;
    module_name: string;
    section_name: string;
    lesson_id: number;
    lesson_title: string | null;
    lesson_number: number | null;
    mini_index: number;
  };
  /** Students whose first attempt is in the period. */
  attempted: number;
  mistake_rate: number;
  twin_count: number;
  twin_draft_count: number;
}

export interface MistakeAnalyticsTopic extends MistakeReviewCounts {
  topic: string;
  students: number;
}

export interface MistakeAnalyticsStudent extends MistakeReviewCounts {
  user_id: number;
  nickname: string | null;
  /** Present only for super admins. */
  email?: string;
  weak_topics: string[];
}

export interface MistakeAnalyticsResponse {
  filters: { period: MistakeAnalyticsPeriod; module_id: number | null };
  modules: Array<{ id: number; name: string }>;
  summary: {
    first_attempts: number;
    mistakes: number;
    mistake_rate: number;
    resolved: number;
    weak: number;
    pending: number;
    tasks_with_mistakes: number;
    students_with_mistakes: number;
    tasks_without_twins: number;
  };
  tasks: MistakeAnalyticsTask[];
  topics: MistakeAnalyticsTopic[];
  students: MistakeAnalyticsStudent[];
}
