import type { LessonTask } from "./curriculum";


// Trial Test Types
export interface TrialTest {
  id: number;
  title: string;
  description?: string;
  sort_order: number;
  expected_tasks_count?: number;
  created_at: string;
  task_count?: number;
}


export interface TrialTestDetails extends TrialTest {
  tasks: LessonTask[];
}


export interface TrialTestResult {
  id: number;
  trial_test_id: number;
  score: number;
  total: number;
  percentage: number;
  answers: Record<number, { answer: string; correct: boolean; correct_answer?: string }>;
  completed_at: string;
}


export interface TrialTestSubmitRequest {
  email: string;
  answers: Record<number, string>; // {task_id: answer}
}


export interface TrialTestSubmitResponse {
  score: number;
  total: number;
  percentage: number;
  results: Record<number, { answer: string; correct: boolean; correct_answer?: string }>;
}


export type TrialTestCoopColor = "red" | "blue";


export interface TrialTestCoopParticipant {
  user_id: number;
  nickname: string | null;
  color: TrialTestCoopColor;
  is_finished: boolean;
}


export interface TrialTestCoopSession {
  id: number;
  trial_test_id: number;
  owner_id: number;
  status: string;
  participants: TrialTestCoopParticipant[];
  current_user_id: number;
  current_user_color: TrialTestCoopColor;
  is_owner: boolean;
  answers?: {
    user: Record<number, string>;
    others: Record<number, Record<number, string>>;
  };
}


export interface TrialTestCoopCreateResponse {
  session_id: number;
  trial_test_id: number;
  owner_id: number;
  color: TrialTestCoopColor;
}


export interface TrialTestCoopFinishResponse {
  score: number;
  total: number;
  percentage: number;
  session_status: string;
}


export interface TrialTestCoopResultItem {
  user_id: number;
  nickname?: string | null;
  score: number;
  total: number;
  percentage: number;
  answers: Record<number, { answer: string; correct: boolean; correct_answer?: string }>;
  completed_at: string;
  color?: TrialTestCoopColor;
}


export interface TrialTestCoopResultsResponse {
  session_id: number;
  status: string;
  items: TrialTestCoopResultItem[];
}
