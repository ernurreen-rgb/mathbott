import type { LessonTask } from "./curriculum";

// Trial Test Types
export interface TrialTest {
  id: number;
  title: string;
  description?: string;
  category?: string | null;
  folder_id?: number | null;
  sort_order: number;
  expected_tasks_count?: number;
  created_at: string;
  task_count?: number;
}

export interface TrialTestFolder {
  id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  test_count: number;
  direct_test_count: number;
  child_count: number;
}

export interface TrialTestDetails extends TrialTest {
  tasks: LessonTask[];
}

export interface TrialTestResult {
  id: number;
  trial_test_id: number;
  attempt_id?: string | null;
  score: number;
  total: number;
  percentage: number;
  answers: Record<number, { answer: string; correct: boolean; correct_answer?: string; task?: LessonTask }>;
  completed_at: string;
}

export interface TrialTestSubmitRequest {
  email: string;
  answers: Record<number, string>; // {task_id: answer}
  attempt_id?: string;
}

export interface TrialTestSubmitResponse {
  result_id?: number;
  attempt_id?: string;
  score: number;
  total: number;
  percentage: number;
  results: Record<number, { answer: string; correct: boolean; correct_answer?: string; task?: LessonTask }>;
}







