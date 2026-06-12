
export interface AdminTopUserByPoints {
  id: number;
  email: string;
  nickname: string | null;
  total_points: number;
  total_solved: number;
  week_points: number;
  streak: number;
}


export interface AdminTopUserBySolved {
  id: number;
  email: string;
  nickname: string | null;
  total_solved: number;
  total_points: number;
  week_points: number;
  streak: number;
}


export interface AdminTopUserByStreak {
  id: number;
  email: string;
  nickname: string | null;
  streak: number;
  total_solved: number;
  total_points: number;
}


export interface AdminAvgUserStats {
  avg_solved: number;
  avg_points: number;
  avg_streak: number;
  avg_week_points: number;
}


export interface AdminTaskStatItem {
  task_id: number;
  text: string;
  attempts: number;
  correct: number;
  total?: number;
  success_rate: number;
}


export interface AdminQuestionTypeStatItem {
  question_type: string;
  total: number;
  correct: number;
  success_rate: number;
}


export interface AdminActivityByDayItem {
  day_name: string;
  count: number;
}


export interface AdminActivityByHourItem {
  hour: number;
  count: number;
}


export interface AdminActivityTrendItem {
  date: string;
  count: number;
  unique_users: number;
}


export interface AdminAchievementDistributionItem {
  achievement_id: string;
  count: number;
}


export interface AdminTrialTestStatItem {
  id: number;
  title: string;
  completions: number;
  avg_percentage: number;
  unique_users: number;
}


export interface AdminTrialTestResultDistributionItem {
  range: string;
  count: number;
}


export interface AdminReportStatusDistributionItem {
  status: string;
  count: number;
}


export interface AdminProblematicTaskItem {
  task_id: number;
  text: string;
  report_count: number;
}


export interface AdminLeagueDistributionItem {
  league: string;
  count: number;
}


export interface AdminLeagueAverageItem {
  league: string;
  avg_solved: number;
  avg_points: number;
  avg_week_points: number;
  avg_streak: number;
}


export interface AdminRegistrationsOverTimeItem {
  date: string;
  count: number;
}


export interface AdminSolutionsOverTimeItem {
  date: string;
  count: number;
  correct: number;
}


export interface AdminModuleProgressItem {
  id: number;
  name: string;
  users_with_progress: number;
  tasks_completed: number;
}


export interface AdminStatistics {
  total_users: number;
  total_tasks: number;
  deleted_tasks: number;
  total_solutions: number;
  correct_solutions: number;
  incorrect_solutions: number;
  total_trial_tests: number;
  total_trial_test_results: number;
  total_reports: number;
  pending_reports: number;
  resolved_reports: number;
  overall_success_rate: number;
  users_registered_today: number;
  users_registered_week: number;
  users_registered_month: number;
  active_users_today: number;
  active_users_week: number;
  active_users_month: number;
  top_users_by_points: AdminTopUserByPoints[];
  top_users_by_solved: AdminTopUserBySolved[];
  top_users_by_streak: AdminTopUserByStreak[];
  avg_user_stats: AdminAvgUserStats;
  popular_tasks: AdminTaskStatItem[];
  difficult_tasks: AdminTaskStatItem[];
  easy_tasks: AdminTaskStatItem[];
  question_type_stats: AdminQuestionTypeStatItem[];
  activity_by_day: AdminActivityByDayItem[];
  activity_by_hour: AdminActivityByHourItem[];
  activity_trends: AdminActivityTrendItem[];
  achievement_distribution: AdminAchievementDistributionItem[];
  trial_test_stats: AdminTrialTestStatItem[];
  trial_test_results_distribution: AdminTrialTestResultDistributionItem[];
  report_status_distribution: AdminReportStatusDistributionItem[];
  problematic_tasks: AdminProblematicTaskItem[];
  avg_report_resolution_time: number;
  league_distribution: AdminLeagueDistributionItem[];
  league_averages: AdminLeagueAverageItem[];
  registrations_over_time: AdminRegistrationsOverTimeItem[];
  solutions_over_time: AdminSolutionsOverTimeItem[];
  module_progress: AdminModuleProgressItem[];
}


export interface OnboardingStatistics {
  total_completed: number;
  how_did_you_hear: Record<string, number>;
  math_level: Record<string, number>;
}
