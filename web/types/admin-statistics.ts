/** Admin statistics workspace: one response shape per tab, all scoped by the same period. */

export type StatisticsPeriodKey = "7d" | "30d" | "90d" | "all";
export type StatisticsTab = "overview" | "students" | "tasks" | "modules" | "trial-tests" | "quizzes";
export type StatisticsGranularity = "day" | "week" | "month";

export interface StatisticsPeriod {
  key: StatisticsPeriodKey;
  /** Length in local days; null for all time. */
  days: number | null;
  start: string | null;
  end: string;
  previous_start: string | null;
  previous_end: string | null;
  tz_offset_minutes: number;
}

/** A figure with the same figure for the period before; previous is null for all time. */
export interface StatisticsKpi<T = number> {
  value: T;
  previous: T | null;
}

export interface StatisticsThresholds {
  hard_task_min_attempts: number;
  hard_task_max_accuracy: number;
}

export interface StatisticsSeries<Point> {
  granularity: StatisticsGranularity;
  points: Point[];
}

export interface StatisticsBucket {
  start: string;
  end: string;
}

export interface ActivityPoint extends StatisticsBucket {
  attempts: number;
  correct: number;
  active_users: number;
  new_users: number;
  trial_attempts: number;
  trial_average: number | null;
}

export interface HeatmapCell {
  /** 0 is Monday. */
  weekday: number;
  hour: number;
  count: number;
}

export type JourneyStepKey = "registered" | "answered" | "completed_mini_lesson" | "returned" | "trial_test";

export interface StatisticsOverview {
  period: StatisticsPeriod;
  kpis: {
    active_users: StatisticsKpi;
    new_users: StatisticsKpi;
    attempts: StatisticsKpi;
    accuracy: StatisticsKpi<number | null>;
    trial_attempts: StatisticsKpi;
    trial_average: StatisticsKpi<number | null>;
  };
  series: StatisticsSeries<ActivityPoint>;
  heatmap: HeatmapCell[];
  journey: Array<{ key: JourneyStepKey; count: number }>;
  attention: {
    pending_reports: number;
    hard_tasks: number;
    churned_students: number;
    silent_new_students: number;
  };
  today: { online_now: number; active_users: number; attempts: number; new_users: number };
  totals: {
    users: number;
    modules: number;
    lessons: number;
    module_tasks: number;
    bank_tasks: number;
    trial_tests: number;
    quizzes: number;
  };
  thresholds: StatisticsThresholds;
}

export interface StatisticsStudent {
  user_id: number;
  nickname: string | null;
  /** Present for super admins only. */
  email?: string | null;
  registered_at: string | null;
  last_seen_at: string | null;
  attempts: number;
  correct: number;
  accuracy: number | null;
  active_days: number;
  trial_attempts: number;
  trial_average: number | null;
  total_solved: number;
  streak: number;
  is_admin: boolean;
  is_active: boolean;
  is_new: boolean;
  is_churned: boolean;
  never_active: boolean;
}

export interface StatisticsStudents {
  period: StatisticsPeriod;
  summary: {
    total: number;
    active: number;
    new: number;
    returning: number | null;
    churned: number | null;
    never_active: number;
    average_active_days: number | null;
    median_attempts: number | null;
  };
  series: StatisticsSeries<ActivityPoint>;
  activity_distribution: Array<{ key: string; count: number }>;
  achievements: Array<{ id: string; name: string; count: number }>;
  students: StatisticsStudent[];
  truncated: boolean;
  emails_visible: boolean;
}

export interface StatisticsBreakdown {
  key: string;
  attempts: number;
  correct: number;
  tasks: number;
  accuracy: number | null;
}

export interface StatisticsTask {
  task_id: number;
  bank_task_id: number | null;
  deleted: boolean;
  text_preview: string;
  question_type: string;
  difficulty: string | null;
  topics: string[];
  location: {
    mini_index: number | null;
    lesson_id: number | null;
    lesson_title: string | null;
    lesson_number: number | null;
    section_name: string | null;
    module_id: number | null;
    module_name: string | null;
  };
  attempts: number;
  correct: number;
  accuracy: number | null;
  students: number;
  solved_students: number;
  first_attempts: number;
  first_correct: number;
  first_accuracy: number | null;
  reports: number;
  pending_reports: number;
  is_hard: boolean;
}

export interface StatisticsTasks {
  period: StatisticsPeriod;
  summary: {
    attempts: number;
    accuracy: number | null;
    first_attempts: number;
    first_accuracy: number | null;
    students: number;
    tasks_attempted: number;
    tasks_total: number;
    hard_tasks: number;
    pending_reports: number;
  };
  by_type: StatisticsBreakdown[];
  by_difficulty: StatisticsBreakdown[];
  /** An empty key collects tasks without a topic. */
  by_topic: StatisticsBreakdown[];
  tasks: StatisticsTask[];
  truncated: boolean;
  thresholds: StatisticsThresholds;
}

interface ModuleActivity {
  /** Students who have ever answered here. */
  started: number;
  completed: number;
  tasks: number;
  /** Answers within the selected period. */
  attempts: number;
  correct: number;
  accuracy: number | null;
  active_students: number;
}

export interface StatisticsLesson extends ModuleActivity {
  id: number;
  title: string | null;
  lesson_number: number | null;
  section_name: string | null;
  minis: Array<{ id: number; mini_index: number; tasks: number; started: number; completed: number }>;
}

export interface StatisticsModule extends ModuleActivity {
  id: number;
  name: string;
  lessons_count: number;
  average_progress: number | null;
  lessons: StatisticsLesson[];
}

export interface StatisticsModules {
  period: StatisticsPeriod;
  summary: {
    modules: number;
    lessons: number;
    tasks: number;
    students_started: number;
    students_completed_lesson: number;
    attempts: number;
    accuracy: number | null;
  };
  modules: StatisticsModule[];
}

export interface TrialQuestionStat {
  task_id: number;
  number: number;
  deleted: boolean;
  text_preview: string;
  /** Attempts in the period that included the question; a blank answer counts as wrong. */
  answers: number;
  correct: number;
  skipped: number;
  accuracy: number | null;
}

export interface StatisticsTrialTest {
  id: number;
  title: string;
  folder: string | null;
  questions_count: number;
  attempts: number;
  students: number;
  average: number | null;
  median: number | null;
  best: number | null;
  last_completed_at: string | null;
  questions: TrialQuestionStat[];
}

export interface StatisticsTrialTests {
  period: StatisticsPeriod;
  summary: {
    attempts: StatisticsKpi;
    students: StatisticsKpi;
    average: StatisticsKpi<number | null>;
    median: number | null;
    best: number | null;
    tests_total: number;
    tests_taken: number;
  };
  series: StatisticsSeries<StatisticsBucket & { attempts: number; average: number | null }>;
  distribution: Array<{ from: number; to: number; count: number }>;
  tests: StatisticsTrialTest[];
  emails_visible: boolean;
  recent: Array<{
    result_id: number;
    user_id: number;
    nickname: string | null;
    email?: string | null;
    trial_test_id: number;
    title: string | null;
    score: number;
    total: number;
    percentage: number;
    completed_at: string | null;
  }>;
}

export interface StatisticsQuizzes {
  period: StatisticsPeriod;
  summary: {
    sessions: StatisticsKpi;
    participants: StatisticsKpi;
    answers: StatisticsKpi;
    accuracy: StatisticsKpi<number | null>;
    finished_sessions: number;
    guests: number;
    hosts: number;
    quizzes_total: number;
    quizzes_played: number;
  };
  series: StatisticsSeries<StatisticsBucket & { sessions: number; participants: number }>;
  quizzes: Array<{
    quiz_id: number;
    title: string;
    sessions: number;
    participants: number;
    answers: number;
    accuracy: number | null;
    last_session_at: string | null;
  }>;
  recent: Array<{
    session_id: number;
    quiz_id: number;
    title: string;
    host_nickname: string | null;
    status: string;
    created_at: string | null;
    participants: number;
    guests: number;
    answers: number;
    accuracy: number | null;
  }>;
}

export interface StatisticsByTab {
  overview: StatisticsOverview;
  students: StatisticsStudents;
  tasks: StatisticsTasks;
  modules: StatisticsModules;
  "trial-tests": StatisticsTrialTests;
  quizzes: StatisticsQuizzes;
}
