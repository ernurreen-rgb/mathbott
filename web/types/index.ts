export interface RatingUser {
  id: number;
  nickname: string | null;
  league: string;
  total_points: number;
  week_points: number;
  total_solved: number;
  email?: string | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export interface UserData {
  id: number;
  email: string;
  nickname?: string;
  league: string;
  league_position?: number;
  league_size?: number;
  total_solved: number;
  week_solved: number;
  week_points: number;
  total_points: number;
  streak?: number;
  last_streak_date?: string | null;
  is_admin?: boolean;
  achievements?: Achievement[];
}

export type AdminRole = "content_editor" | "reviewer" | "super_admin";

export interface AdminCheckResponse {
  is_admin: boolean;
  role: AdminRole | null;
  is_super_admin: boolean;
  permissions: string[];
}

export interface AdminRoleUserItem {
  id: number;
  email: string;
  role: AdminRole;
  created_at: string;
  last_active: string | null;
}

export interface AdminRoleListResponse {
  items: AdminRoleUserItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface AdminRoleUpdateRequest {
  target_email: string;
  role?: AdminRole;
  remove_admin?: boolean;
}

export interface AdminRoleUpdateResponse {
  success: boolean;
  changed: boolean;
  target_user: {
    id: number;
    email: string;
    previous_role: AdminRole | null;
    new_role: AdminRole | null;
    previous_is_admin?: boolean;
    new_is_admin?: boolean;
  };
  audit_id?: number;
}

export interface AdminRoleRestoreRequest {
  audit_id: number;
}

export interface AdminRoleRestoreResponse {
  success: boolean;
  changed: boolean;
  target_user: {
    id: number;
    email: string;
    previous_role: AdminRole | null;
    new_role: AdminRole | null;
    previous_is_admin: boolean;
    new_is_admin: boolean;
  };
  audit_id?: number;
  restored_from_audit_id: number;
}

export interface FriendUser {
  id: number;
  nickname: string | null;
  league: string | null;
  total_points: number;
  total_solved: number;
}

export interface FriendInvite {
  id?: number;
  token: string;
  inviter_id: number;
  status: "active" | "accepted" | "expired" | "revoked";
  expires_at?: string | null;
  accepted_by?: number | null;
  accepted_at?: string | null;
  created_at?: string;
}

export interface FriendInviteDetails {
  token: string;
  status: "active" | "accepted" | "expired" | "revoked";
  expires_at?: string | null;
  inviter: {
    id: number;
    nickname: string | null;
    league: string | null;
  };
  can_accept: boolean;
  is_friend: boolean;
}

export interface FriendRequestItem {
  id: number;
  status: string;
  created_at: string;
  responded_at?: string | null;
  sender_id?: number;
  sender_nickname?: string | null;
  sender_league?: string | null;
  receiver_id?: number;
  receiver_nickname?: string | null;
  receiver_league?: string | null;
}

export interface BlockedUser {
  id: number;
  nickname: string | null;
  league: string | null;
  total_points: number;
  total_solved: number;
  blocked_at?: string | null;
}

export interface FriendStatus {
  is_self: boolean;
  is_friend: boolean;
  is_blocked: boolean;
  has_pending_outgoing: boolean;
  has_pending_incoming: boolean;
}

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
  label: string; // "A" | "B" | "C" | "D" | "E" | "F"
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

// Bank tasks (admin pool for trial tests)
export type BankDifficulty = "A" | "B" | "C";
export type TaskTextScale = "sm" | "md" | "lg";

export interface BankTask {
  id: number;
  text: string;
  answer: string;
  question_type: QuestionType;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
  image_filename?: string | null;
  solution_filename?: string | null;
  difficulty: BankDifficulty;
  topics: string[];
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  current_version?: number;
  active_usage_count?: number;
}

export interface BankTaskListResponse {
  items: BankTask[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface BankQualitySummaryResponse {
  active_total: number;
  dead_total: number;
  no_topics_total: number;
  default_similarity_threshold: number;
}

export interface BankQualityListParams {
  search?: string;
  difficulty?: BankDifficulty | "";
  limit?: number;
  offset?: number;
}

export interface BankDuplicateListParams extends BankQualityListParams {
  threshold?: number;
  question_type?: QuestionType | "";
}

export interface BankDuplicateMember {
  id: number;
  text: string;
  question_type: QuestionType;
  difficulty: BankDifficulty;
  topics: string[];
  active_usage_count: number;
  updated_at: string;
  current_version: number;
  best_match_score: number;
}

export interface BankDuplicateCluster {
  cluster_id: string;
  size: number;
  max_score: number;
  members: BankDuplicateMember[];
}

export interface BankDuplicateListResponse {
  threshold: number;
  items: BankDuplicateCluster[];
  total_clusters: number;
  total_tasks_in_clusters: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export type BankAuditAction =
  | "import_confirm"
  | "version_delete"
  | "rollback"
  | "hard_delete"
  | "role_change";

export interface BankAuditLogItem {
  id: number;
  domain: "bank";
  action: BankAuditAction;
  entity_type: "bank_task" | "bank_import_batch" | "admin_user";
  entity_id: number | null;
  actor_user_id: number | null;
  actor_email: string;
  summary: string;
  changed_fields: string[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface BankAuditListParams {
  action?: BankAuditAction | "";
  task_id?: number;
  actor_email?: string;
  limit?: number;
  offset?: number;
}

export interface BankAuditListResponse {
  items: BankAuditLogItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface TrialTestAddFromBankResponse {
  added_count: number;
  skipped_existing_ids: number[];
  created_task_ids: number[];
  skipped_missing_ids?: number[];
}

export interface BankTaskVersionItem {
  id: number;
  bank_task_id: number;
  version_no: number;
  event_type: string;
  source?: string | null;
  actor_user_id?: number | null;
  reason?: string | null;
  rollback_from_version?: number | null;
  changed_fields: string[];
  created_at: string;
}

export interface BankTaskVersionDetail extends BankTaskVersionItem {
  snapshot: {
    text: string;
    answer: string;
    question_type: QuestionType;
    text_scale?: TaskTextScale | null;
    options?: LessonTaskOption[] | null;
    subquestions?: LessonTaskSubquestion[] | null;
    difficulty?: BankDifficulty | null;
    topics?: string[];
    image_filename?: string | null;
    solution_filename?: string | null;
  };
}

export interface BankTaskVersionListResponse {
  items: BankTaskVersionItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface BankTaskUsageItem {
  kind: "module" | "trial_test";
  placement_id: number;
  sort_order: number;
  deleted_at?: string | null;
  module_id?: number | null;
  module_name?: string | null;
  section_id?: number | null;
  section_name?: string | null;
  lesson_id?: number | null;
  lesson_title?: string | null;
  lesson_number?: number | null;
  mini_lesson_id?: number | null;
  mini_lesson_title?: string | null;
  mini_index?: number | null;
  trial_test_id?: number | null;
  trial_test_title?: string | null;
}

export interface BankTaskUsageResponse {
  task_id: number;
  active_only: boolean;
  total: number;
  items: BankTaskUsageItem[];
}

export interface BankTaskSimilarCandidate {
  id: number;
  text: string;
  question_type: QuestionType;
  difficulty: BankDifficulty;
  score: number;
  updated_at: string;
}

export type BankImportMode = "dry_run" | "confirm";

export interface BankImportDuplicateConflictItem {
  index: number;
  similar_tasks: BankTaskSimilarCandidate[];
}

export interface SimilarConflictPayload {
  code: "SIMILAR_TASKS_FOUND";
  message: string;
  task_index?: number;
  similar_tasks: BankTaskSimilarCandidate[];
  conflicts?: BankImportDuplicateConflictItem[];
}

export interface BankImportValidationErrorItem {
  index: number;
  field: string;
  message: string;
}

export interface BankImportValidationErrorPayload {
  code: "IMPORT_VALIDATION_FAILED";
  errors: BankImportValidationErrorItem[];
}

export interface BankImportResponse {
  mode?: "confirm";
  created_count: number;
  created_ids: number[];
}

export interface BankImportPreviewSummary {
  total_tasks: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  can_confirm: boolean;
  requires_dedup_confirmation: boolean;
}

export interface BankImportPreviewResponse {
  mode: "dry_run";
  preview_token: string;
  expires_at: string;
  summary: BankImportPreviewSummary;
  validation_errors: BankImportValidationErrorItem[];
  duplicate_conflicts: BankImportDuplicateConflictItem[];
}

export interface BankPlacementTask {
  id: number;
  trial_test_id?: number;
  section_id?: number | null;
  mini_lesson_id?: number | null;
  bank_task_id: number | null;
  sort_order: number;
  deleted_at?: string | null;
  task_type?: string | null;
  bank_difficulty?: BankDifficulty | null;
  bank_topics?: string[];
  bank_task?: Partial<BankTask> | null;
  text?: string;
  answer?: string;
  question_type?: QuestionType;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
  image_filename?: string | null;
}

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

export type OpsTimeseriesRange = "1h" | "24h" | "7d";

export type OpsTimeseriesStep = "1m" | "5m" | "1h";

export interface OpsHealthSummary {
  service_status: "healthy" | "degraded" | "down";
  database_status: "ok" | "error";
  window: "5m";
  requests_5m: number;
  errors_5m: number;
  error_rate_5m: number;
  p95_ms_5m: number;
  avg_ms_5m: number;
  open_incidents: number;
  updated_at: string;
}

export interface OpsHealthTimeseriesPoint {
  ts: string;
  requests: number;
  errors: number;
  error_rate: number;
  p95_ms: number;
  avg_ms: number;
  db_ok: number;
}

export interface OpsHealthTimeseriesResponse {
  range: OpsTimeseriesRange;
  step: OpsTimeseriesStep;
  items: OpsHealthTimeseriesPoint[];
}

export interface OpsIncident {
  id: number;
  kind: string;
  severity: "critical" | "high" | "medium";
  title: string;
  message: string;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  metadata: Record<string, any>;
  telegram_last_sent_at?: string | null;
  resolved_at?: string | null;
}

export interface OpsIncidentListResponse {
  items: OpsIncident[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
