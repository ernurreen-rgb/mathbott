export type QuestionType = "mcq" | "multi_select" | "input" | "tf";

export interface QuizOption {
  id: string; // "A", "B", "C", "D"
  text: string;
  is_correct?: boolean;
}

export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: QuestionType;
  options: QuizOption[];
  correct_answer?: string;
  accepted_answers?: string[];
  time_limit_seconds: number;
  points: number;
  sort_order: number;
  image_filename?: string | null;
  explanation?: string | null;
}

export interface Quiz {
  id: number;
  title: string;
  description: string;
  cover_image?: string | null;
  created_by: number;
  author_nickname?: string | null;
  question_count?: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuizParticipant {
  id: number;
  session_id: number;
  user_id?: number | null;
  nickname: string;
  avatar_color: string;
  score: number;
  streak: number;
  correct_count: number;
  total_answered: number;
  is_finished: boolean;
  joined_at: string;
  last_active_at: string;
}

export interface QuizSession {
  id: number;
  quiz_id: number;
  host_id: number;
  host_nickname?: string;
  quiz_title?: string;
  quiz_description?: string;
  pin_code: string;
  status: "lobby" | "in_progress" | "finished";
  settings: Record<string, any>;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  participants?: QuizParticipant[];
}

export interface QuizAnswerResult {
  is_correct: boolean;
  points_awarded: number;
  streak: number;
  total_score: number;
  correct_answer?: string | null;
  explanation?: string | null;
}

export interface QuestionAccuracyStat {
  question_id: number;
  question_text: string;
  sort_order: number;
  total_answers: number;
  correct_answers: number;
  avg_time: number;
}

export interface QuizSessionStats {
  session_id: number;
  total_players: number;
  leaderboard: QuizParticipant[];
  podium: QuizParticipant[];
  question_stats: QuestionAccuracyStat[];
}
